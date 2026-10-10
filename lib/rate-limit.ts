// Simple in-memory rate limit for the public "Read my prescription" route.
// Each AI call costs money, so: at most 10 requests per IP per hour, plus a
// safety cap for the whole server instance.
//
// Limitation (fine for the hackathon): the counts live in the memory of one
// server instance. Vercel may run several instances, and a restart resets them.
// A shared store (e.g. a database table) would make it exact.
import "server-only";

const HOUR_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>(); // key → request times in the last hour
const allHits: number[] = [];

export function takeToken(key: string, perKey: number, perInstance: number): { ok: true } | { ok: false; retryMinutes: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  while (allHits.length && now - allHits[0] >= HOUR_MS) allHits.shift();

  if (recent.length >= perKey) {
    hits.set(key, recent);
    return { ok: false, retryMinutes: Math.max(1, Math.ceil((recent[0] + HOUR_MS - now) / 60_000)) };
  }
  if (allHits.length >= perInstance) {
    return { ok: false, retryMinutes: Math.max(1, Math.ceil((allHits[0] + HOUR_MS - now) / 60_000)) };
  }

  recent.push(now);
  hits.set(key, recent);
  allHits.push(now);
  // Forget idle keys now and then so the map can't grow forever.
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR_MS)) hits.delete(k);
  return { ok: true };
}
