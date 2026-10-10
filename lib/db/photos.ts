// Patient photos: optional, with consent, printed on the card only.
// Stored in the PRIVATE Supabase Storage bucket "patient-photos" as {MedPass ID}.jpg.
// Only reachable through server routes that have checked the clinician login
// AND the patient's PIN unlock. Never a public URL, never in the QR, never sent to the AI.
import "server-only";
import { z } from "zod";
import { db } from "./server";

const BUCKET = "patient-photos";
const MAX_BYTES = 60_000; // the browser makes them < 50 KB; a little room on top

// What the browser sends: the photo as base64 JPEG (a "data:" prefix is allowed)
// plus the consent tick, which must be true.
export const photoInputSchema = z.object({
  photo: z
    .string()
    .transform((s) => s.replace(/^data:image\/jpeg;base64,/, ""))
    .pipe(z.string().min(100).max(Math.ceil((MAX_BYTES * 4) / 3)).regex(/^[A-Za-z0-9+/=]+$/)),
  consent: z.literal(true),
});

// base64 → JPEG bytes, or null if it isn't really a JPEG.
export function jpegBytes(base64: string): Buffer | null {
  const bytes = Buffer.from(base64, "base64");
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return isJpeg && bytes.length <= MAX_BYTES ? bytes : null;
}

const pathFor = (patientId: string) => `${patientId}.jpg`;

// Save (or replace) the photo and remember it on the patient row.
export async function savePhoto(patientId: string, bytes: Buffer): Promise<void> {
  const path = pathFor(patientId);
  const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  const { error: rowError } = await db().from("patients").update({ photo_path: path }).eq("id", patientId);
  if (rowError) throw new Error(`photo_path update failed: ${rowError.code}`);
}

export async function readPhoto(photoPath: string): Promise<ArrayBuffer | null> {
  const { data, error } = await db().storage.from(BUCKET).download(photoPath);
  if (error || !data) return null;
  return data.arrayBuffer();
}

export async function deletePhoto(patientId: string): Promise<void> {
  await db().storage.from(BUCKET).remove([pathFor(patientId)]);
  const { error } = await db().from("patients").update({ photo_path: null }).eq("id", patientId);
  if (error) throw new Error(`photo_path update failed: ${error.code}`);
}
