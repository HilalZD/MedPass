import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, mergeDrafts, parsePaper, tagPaper, type ExtractedDraft } from "@/lib/extract";

// Each paper is read in its own AI call, all at the same time, so the total
// time is about the time of the slowest paper. Give the function 2 minutes on Vercel.
export const maxDuration = 120;

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

type PaperResult =
  | { ok: true; draft: ExtractedDraft }
  | { ok: false; error: string; status: number };

// Read ONE paper. Never throws: failures come back as { ok: false }.
async function readPaper(client: Anthropic, image: string, n: number, today: string): Promise<PaperResult> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
    { type: "text", text: "Transcribe this paper. Reply with only the JSON object." },
  ];

  // Try twice: if the first reply is not valid JSON in our shape, ask again once.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      // Log only the kind of error, never the image or the record.
      console.error(`extract: paper ${n} API call failed`, err instanceof Anthropic.APIError ? err.status : "network");
      if (err instanceof Anthropic.RateLimitError) {
        return { ok: false, error: "The AI is busy right now. Please wait a minute and try again.", status: 429 };
      }
      if (err instanceof Anthropic.AuthenticationError) {
        return { ok: false, error: "The server's AI key is not valid. Tell the MedPass team.", status: 500 };
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, error: "Could not reach the AI. Check the internet connection and try again.", status: 502 };
      }
      return { ok: false, error: "The AI could not read the papers. Please try again.", status: 502 };
    }

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "The AI declined to read this photo. Please enter it by hand.", status: 422 };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      return { ok: true, draft: tagPaper(parsePaper(text), n, today) };
    } catch {
      console.error(`extract: paper ${n} invalid JSON from model (attempt ${attempt})`);
    }
  }
  return { ok: false, error: "The AI's answer did not make sense twice in a row.", status: 502 };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse("The server is missing its AI key. Tell the MedPass team.", 500);
  }

  let images: string[];
  try {
    images = requestSchema.parse(await request.json()).images;
  } catch {
    return errorResponse("Please send 1 to 3 JPEG photos.", 400);
  }

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  const today = new Date().toISOString().slice(0, 10);

  // One call per paper, in parallel. Paper numbers are 1-based, in upload order.
  const results = await Promise.all(images.map((image, i) => readPaper(client, image, i + 1, today)));
  console.log(`extract: ${images.length} paper(s), ${results.filter((r) => r.ok).length} read`);

  if (!results.some((r) => r.ok)) {
    // Every paper failed: show the first reason (they are usually all the same).
    const first = results.find((r) => !r.ok);
    return errorResponse(first && !first.ok ? first.error : "The AI could not read the papers.", first && !first.ok ? first.status : 502);
  }

  const failedPapers = results.flatMap((r, i) => (r.ok ? [] : [i + 1]));
  const { draft, warnings } = mergeDrafts(results.map((r) => (r.ok ? r.draft : null)));

  return Response.json({
    record: draft,
    failedPapers,
    warnings: [
      ...failedPapers.map((n) => `Paper ${n} could not be read. Please retake the photo of paper ${n}.`),
      ...warnings,
    ],
  });
}
