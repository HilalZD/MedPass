// The patient's own 10-minute session for /me (no clinician involved).
// Same idea as the clinician unlock token (lib/db/unlock.ts), but a separate
// cookie with a separately derived key, so one can never be used as the other.
//
// Cookie value: base64url(JSON { p: MedPass ID, exp }) + "." + HMAC-SHA256 signature.
// httpOnly (page JavaScript can't read it), signed (can't be edited), 10 minutes.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "mp_patient";
export const PATIENT_SESSION_SECONDS = 10 * 60;

// Derived from the service role key with its own label. In production this
// would be its own secret, rotated separately.
function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createHmac("sha256", secret).update("medpass-patient-session-v1").digest();
}

const sign = (data: string) => createHmac("sha256", key()).update(data).digest("base64url");

// Start the session after a correct PIN. Returns when it expires (ms since 1970).
export async function setPatientSession(patientId: string): Promise<number> {
  const exp = Date.now() + PATIENT_SESSION_SECONDS * 1000;
  const data = Buffer.from(JSON.stringify({ p: patientId, exp })).toString("base64url");
  (await cookies()).set(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: PATIENT_SESSION_SECONDS,
  });
  return exp;
}

export async function clearPatientSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// The MedPass ID and expiry of a valid session, or null.
export async function getPatientSession(): Promise<{ patientId: string; until: number } | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [data, sig] = value.split(".");
  if (!data || !sig) return null;

  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString()) as { p: string; exp: number };
    if (typeof s.p !== "string" || typeof s.exp !== "number" || s.exp < Date.now()) return null;
    return { patientId: s.p, until: s.exp };
  } catch {
    return null;
  }
}
