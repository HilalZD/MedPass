import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, parseRecord, type ExtractedRecord } from "@/lib/extract";

// Reading 3 photos can take a while; give the function up to 2 minutes on Vercel.
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

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (data): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data },
      }),
    ),
    {
      type: "text",
      text: `Today's date is ${today}. Transcribe ${
        images.length === 1 ? "this paper" : `these ${images.length} papers into one record`
      }. Reply with only the JSON object.`,
    },
  ];

  // Try twice: if the first reply is not valid JSON in our shape, ask again once.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      // Log only the kind of error, never the images or the record.
      console.error("extract: API call failed", err instanceof Anthropic.APIError ? err.status : "network");
      if (err instanceof Anthropic.RateLimitError) {
        return errorResponse("The AI is busy right now. Please wait a minute and try again.", 429);
      }
      if (err instanceof Anthropic.AuthenticationError) {
        return errorResponse("The server's AI key is not valid. Tell the MedPass team.", 500);
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return errorResponse("Could not reach the AI. Check the internet connection and try again.", 502);
      }
      return errorResponse("The AI could not read the papers. Please try again.", 502);
    }

    if (response.stop_reason === "refusal") {
      return errorResponse("The AI declined to read these photos. Please enter the medicines by hand.", 422);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let record: ExtractedRecord;
    try {
      record = parseRecord(text);
    } catch {
      console.error(`extract: invalid JSON from model (attempt ${attempt})`);
      continue;
    }

    // Safety net: these values are fixed by our rules, whatever the model wrote.
    record.updated = today;
    record.conditions.forEach((c) => (c.verified = "patient"));
    record.meds.forEach((m) => (m.verified = "patient"));

    return Response.json({ record });
  }

  return errorResponse(
    "The AI's answer did not make sense twice in a row. Try clearer photos, or enter the medicines by hand.",
    502,
  );
}
