import { z } from "zod";
import { aiClient, transcribe } from "@/lib/ai";
import { getMatcher } from "@/lib/db/drugs";
import { takeToken } from "@/lib/rate-limit";
import type { MedMatch } from "@/lib/match";
import { READ_PROMPT, parseReadPaper, toLines } from "@/lib/read";
import type { Med } from "@/lib/types";

// POST /api/read  { image: "<base64 JPEG>", lang: "en" | "ar" }
// Public (no login): the patient's "Read my prescription" page.
// One photo → plain-language lines, built in code from the transcription.
// The image and the result are NEVER stored or logged.
export const maxDuration = 60; // lib/ai.ts answers within 50 s

const MAX_BODY_BYTES = 4.5 * 1024 * 1024; // Vercel's request limit
const MAX_IMAGE_CHARS = 2_000_000; // same per-image limit as the portal
const PER_IP_PER_HOUR = 10;
const PER_INSTANCE_PER_HOUR = 300; // safety cap on AI cost

const bodySchema = z.object({
  image: z
    .string()
    .transform((s) => s.replace(/^data:image\/jpeg;base64,/, ""))
    .pipe(z.string().min(100).max(MAX_IMAGE_CHARS).regex(/^[A-Za-z0-9+/=]+$/)),
  lang: z.enum(["en", "ar"]),
});

const MSG = {
  en: {
    tooBig: "This photo is too large. Please take it again; the app will make it smaller.",
    bad: "Please send one photo of a prescription.",
    limit: (m: number) => `You have read many prescriptions this hour. Please try again in about ${m} minutes.`,
    noKey: "The server is missing its AI key. Please try again later.",
    wayOut: "You can also show the paper to your pharmacist.",
    noMeds: "We couldn't find any medicines on this paper. Retake it in better light, flat and in focus, or show it to your pharmacist.",
    hard: "This photo was hard to read (it may be blurry or dark). Retake it in better light, flat and in focus.",
  },
  ar: {
    tooBig: "هذه الصورة كبيرة جداً. يرجى التقاطها مرة أخرى؛ سيقوم التطبيق بتصغيرها.",
    bad: "يرجى إرسال صورة واحدة لوصفة طبية.",
    limit: (m: number) => `لقد قرأت عدداً كبيراً من الوصفات خلال هذه الساعة. يرجى المحاولة بعد حوالي ${m} دقيقة.`,
    noKey: "الخادم لا يملك مفتاح الذكاء الاصطناعي. يرجى المحاولة لاحقاً.",
    wayOut: "يمكنك أيضاً عرض الورقة على الصيدلي.",
    noMeds: "لم نجد أي دواء في هذه الورقة. أعد التصوير بإضاءة أفضل، أو اعرضها على الصيدلي.",
    hard: "كانت قراءة هذه الصورة صعبة (قد تكون غير واضحة أو مظلمة). أعد التصوير بإضاءة أفضل.",
  },
};

function clientIp(request: Request): string {
  // On Vercel the first address in x-forwarded-for is the visitor.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > MAX_BODY_BYTES) return Response.json({ error: MSG.en.tooBig, errorAr: MSG.ar.tooBig }, { status: 413 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: MSG.en.bad, errorAr: MSG.ar.bad }, { status: 400 });
  }
  const t = MSG[body.lang];

  const token = takeToken(clientIp(request), PER_IP_PER_HOUR, PER_INSTANCE_PER_HOUR);
  if (!token.ok) return Response.json({ error: t.limit(token.retryMinutes) }, { status: 429 });

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: t.noKey }, { status: 500 });

  const result = await transcribe(aiClient(), body.image, READ_PROMPT, parseReadPaper, { label: "read", wayOut: MSG.en.wayOut });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  const paper = result.value;
  if (paper.meds.length === 0) return Response.json({ lines: [], warning: t.noMeds });

  // Sure MoPH matches get the "Registered in Lebanon" badge. If the list can't
  // be loaded, nothing gets a badge (never a wrong one).
  let matchMed: (med: Med) => MedMatch | null = () => null;
  let alternatives: Parameters<typeof toLines>[3] = () => [];
  try {
    const m = await getMatcher();
    matchMed = m.matchMed;
    alternatives = m.alternatives;
  } catch {
    console.error("read: could not load drugs.json");
  }

  const lines = toLines(paper, body.lang, (med) => matchMed({ ...med, verified: "patient" }), alternatives);
  const unreadable = lines.filter((l) => l.kind === "unreadable").length;
  return Response.json({
    lines,
    warning: unreadable > 0 && unreadable >= lines.length / 2 ? t.hard : undefined,
  });
}
