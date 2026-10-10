import { z } from "zod";
import { aiClient, transcribe } from "@/lib/ai";
import { requireClinician } from "@/lib/db/auth";
import { getMatcher } from "@/lib/db/drugs";
import { SYSTEM_PROMPT, applyMatches, mergeDrafts, parsePaper, tagPaper, type ExtractedDraft } from "@/lib/extract";

// Each paper is read in its own AI call, all at the same time, so the total
// time is about the time of the slowest paper (12–15 s in our tests).
// Vercel stops the function after 60 s; lib/ai.ts keeps each paper under 50 s.
export const maxDuration = 60;

const BY_HAND = "You can also enter the medicines by hand.";
const RETAKE = "Retake it in better light, flat and in focus.";

// A paper the AI could barely read: it may be blurry or too dark.
function hardToRead(d: ExtractedDraft): boolean {
  const readableMeds = d.meds.filter((m) => m.status !== "unreadable").length;
  const anythingElse = d.conditions.length + d.emergency.allergies.length + d.referrals.length + d.visits.length;
  if (d.meds.length > 0) return readableMeds === 0 || readableMeds < d.meds.length / 2;
  return anythingElse === 0;
}

// Request body: { images: ["<base64 JPEG>", ...] }, 1 to 3 images.
// A "data:image/jpeg;base64," prefix is allowed and removed.
const MAX_IMAGE_CHARS = 2_000_000; // ~1.5 MB per image after base64; resized photos are far smaller
const requestSchema = z.object({
  images: z
    .array(
      z
        .string()
        .transform((s) => s.replace(/^data:image\/jpeg;base64,/, ""))
        .pipe(z.string().min(100).max(MAX_IMAGE_CHARS).regex(/^[A-Za-z0-9+/=]+$/)),
    )
    .min(1)
    .max(3),
});

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Only logged-in clinicians may use the AI here (it costs money per call).
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse("The server is missing its AI key. Tell the MedPass team.", 500);
  }

  let images: string[];
  try {
    images = requestSchema.parse(await request.json()).images;
  } catch {
    return errorResponse("Please send 1 to 3 JPEG photos.", 400);
  }

  const client = aiClient();
  const today = new Date().toISOString().slice(0, 10);

  // One call per paper, in parallel. Paper numbers are 1-based, in upload order.
  const results = await Promise.all(
    images.map((image, i) =>
      transcribe(client, image, SYSTEM_PROMPT, (text) => tagPaper(parsePaper(text), i + 1, today), {
        label: `extract: paper ${i + 1}`,
        wayOut: BY_HAND,
      }),
    ),
  );
  console.log(`extract: ${images.length} paper(s), ${results.filter((r) => r.ok).length} read`);

  if (!results.some((r) => r.ok)) {
    // Every paper failed: show the first reason (they are usually all the same).
    const first = results.find((r) => !r.ok);
    return errorResponse(first && !first.ok ? first.error : "The AI could not read the papers.", first && !first.ok ? first.status : 502);
  }

  const failedPapers = results.flatMap((r, i) => (r.ok ? [] : [i + 1]));
  const merged = mergeDrafts(results.map((r) => (r.ok ? r.value : null)));

  // Check every readable med against the MoPH list. If the list cannot be
  // loaded, treat every med as "not found" (yellow), never as fine.
  let matchMed: Parameters<typeof applyMatches>[1] = () => null;
  try {
    matchMed = (await getMatcher()).matchMed;
  } catch {
    console.error("extract: could not load drugs.json");
  }
  const draft = applyMatches(merged.draft, matchMed);
  const warnings = merged.warnings;

  return Response.json({
    record: draft,
    failedPapers,
    warnings: [
      ...failedPapers.map((n) => `Paper ${n} could not be read. ${RETAKE}`),
      ...results.flatMap((r, i) =>
        r.ok && hardToRead(r.value) ? [`Paper ${i + 1} was hard to read (it may be blurry or dark). ${RETAKE}`] : [],
      ),
      ...warnings,
    ],
  });
}
