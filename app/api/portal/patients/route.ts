import { z } from "zod";
import { requireClinician } from "@/lib/db/auth";
import { createPatient } from "@/lib/db/patients";
import { jpegBytes, photoInputSchema, savePhoto } from "@/lib/db/photos";
import { draftToRecord, reviewedDraftSchema, unresolvedMeds } from "@/lib/extract";

// POST /api/portal/patients  { draft: <reviewed ExtractedDraft>, pin: "123456", photo?: { photo, consent: true } }
// → { record, photoSaved }  (the saved MedPassRecord, with its new MedPass ID)
const bodySchema = z.object({
  draft: reviewedDraftSchema,
  pin: z.string().regex(/^\d{6}$/),
  photo: photoInputSchema.optional(), // optional; consent must be ticked
});

export async function POST(request: Request) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Some patient details are missing or not valid. Go back and check them." },
      { status: 400 },
    );
  }

  // The review screen blocks Save until every med is resolved; check again here.
  if (unresolvedMeds(body.draft) > 0) {
    return Response.json({ error: "Some medicines still need checking (yellow or unreadable)." }, { status: 400 });
  }

  try {
    // draftToRecord strips raw text, "from paper N" and other review-only fields.
    const record = await createPatient(
      (id) => draftToRecord(body.draft, { id, cardVersion: 1 }),
      body.pin,
      clinician,
    );

    // The photo is saved separately (private storage). If it fails, the patient
    // is still saved; the clinician can add the photo later from the record.
    let photoSaved = false;
    const bytes = body.photo ? jpegBytes(body.photo.photo) : null;
    if (bytes) {
      try {
        await savePhoto(record.id, bytes);
        photoSaved = true;
      } catch (err) {
        console.error("patients: photo save failed", err instanceof Error ? err.message : "unknown");
      }
    }
    return Response.json({ record, photoSaved });
  } catch (err) {
    console.error("patients: save failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not save the patient. Please try again." }, { status: 500 });
  }
}
