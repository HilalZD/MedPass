// The AI transcription core, shared by the portal (/api/extract) and the public
// "Read my prescription" page (/api/read). Server-only: uses the Anthropic key.
//
// One call = one photo. The model only transcribes (see the prompts in
// lib/extract.ts); everything else (merging, matching, explanations) is plain code.
// Never logs the image or the result, only the kind of error.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Vercel stops a function after 60 s. Worst case per photo: 2 tries x 25 s
// AI timeout (no extra SDK retry) = 50 s, so routes always answer in time.
export const AI_TIMEOUT_MS = 25_000;

export function aiClient(): Anthropic {
  return new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 });
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

// Transcribe ONE photo with `system` as the instructions and `parse` to turn
// the reply into data. Never throws: failures come back as { ok: false } with
// a plain-language message ending in `wayOut` (e.g. "enter the medicines by hand").
export async function transcribe<T>(
  client: Anthropic,
  image: string,
  system: string,
  parse: (text: string) => T,
  opts: { label: string; wayOut: string },
): Promise<AiResult<T>> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
    { type: "text", text: "Transcribe this paper. Reply with only the JSON object." },
  ];
  const { label, wayOut } = opts;

  // Try twice: if the first reply is not valid JSON in our shape, ask again once.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      // Log only the kind of error, never the image or the record.
      console.error(`${label}: API call failed`, err instanceof Anthropic.APIError ? err.status : "network");
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        return { ok: false, error: `The AI is too slow right now. Try again in a minute. ${wayOut}`, status: 504 };
      }
      if (err instanceof Anthropic.RateLimitError) {
        return { ok: false, error: `The AI is busy right now. Wait a minute and try again. ${wayOut}`, status: 429 };
      }
      if (err instanceof Anthropic.AuthenticationError) {
        return { ok: false, error: `The server's AI key is not valid. Tell the MedPass team. ${wayOut}`, status: 500 };
      }
      if (err instanceof Anthropic.InternalServerError) {
        // 5xx, including 529 "overloaded"
        return { ok: false, error: `The AI service is down or overloaded right now. Try again in a minute. ${wayOut}`, status: 503 };
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, error: `Could not reach the AI. Check the internet connection and try again. ${wayOut}`, status: 502 };
      }
      return { ok: false, error: `The AI could not read the paper. Try again. ${wayOut}`, status: 502 };
    }

    if (response.stop_reason === "refusal") {
      return { ok: false, error: `The AI declined to read this photo. ${wayOut}`, status: 422 };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      return { ok: true, value: parse(text) };
    } catch {
      console.error(`${label}: invalid JSON from model (attempt ${attempt})`);
    }
  }
  return { ok: false, error: `The AI's answer did not make sense twice in a row. ${wayOut}`, status: 502 };
}
