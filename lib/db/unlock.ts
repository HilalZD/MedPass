// The "unlock token": proof that THIS clinician typed THIS patient's correct
// PIN less than 15 minutes ago. Every view/edit/reissue API call needs it on
// top of the clinician login (the "two keys" rule).
//
// It is a small signed cookie: base64url(JSON) + "." + HMAC-SHA256 signature.
// httpOnly → page JavaScript cannot read or steal it.
// The signature → nobody can edit the patient ID or the expiry time.
// One patient is unlocked at a time; unlocking another replaces it.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Clinician } from "./auth";

const COOKIE = "mp_unlock";
export const UNLOCK_SECONDS = 15 * 60;

type Unlock = { p: string; c: string; exp: number }; // patient ID, clinician user ID, expiry (ms)

// Signing key derived from the service role key (server-only secret), so there
// is no extra env variable to manage. The label makes it a different key.
// In production this would be its own secret (UNLOCK_TOKEN_SECRET), rotated separately.
function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createHmac("sha256", secret).update("medpass-unlock-token-v1").digest();
}

const sign = (data: string) => createHmac("sha256", key()).update(data).digest("base64url");

// Set the cookie after a correct PIN. Returns when it expires (ms since 1970).
export async function setUnlock(patientId: string, clinician: Clinician): Promise<number> {
  const exp = Date.now() + UNLOCK_SECONDS * 1000;
  const data = Buffer.from(JSON.stringify({ p: patientId, c: clinician.userId, exp } satisfies Unlock)).toString("base64url");
  (await cookies()).set(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: UNLOCK_SECONDS,
  });
  return exp;
}

export async function clearUnlock(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// Returns the expiry time if the cookie is valid for this patient + clinician, else null.
export async function unlockedUntil(patientId: string, clinician: Clinician): Promise<number | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [data, sig] = value.split(".");
  if (!data || !sig) return null;

  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  // timingSafeEqual: comparing takes the same time whether 1 or 20 characters match.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const u = JSON.parse(Buffer.from(data, "base64url").toString()) as Unlock;
    if (u.p !== patientId || u.c !== clinician.userId || u.exp < Date.now()) return null;
    return u.exp;
  } catch {
    return null;
  }
}

// For API routes: returns the expiry, or a 403 Response asking for the PIN.
export async function requireUnlock(patientId: string, clinician: Clinician): Promise<number | Response> {
  const until = await unlockedUntil(patientId, clinician);
  if (!until) {
    return Response.json({ error: "Please enter the patient's PIN again.", needPin: true }, { status: 403 });
  }
  return until;
}
