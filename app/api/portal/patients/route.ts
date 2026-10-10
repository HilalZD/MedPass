import { z } from "zod";
import { requireClinician } from "@/lib/db/auth";
import { createPatient } from "@/lib/db/patients";
import { draftToRecord, reviewedDraftSchema, unresolvedMeds } from "@/lib/extract";

// POST /api/portal/patients  { draft: <reviewed ExtractedDraft>, pin: "123456" }
// → { record }  (the saved MedPassRecord, with its new MedPass ID)
// No photo here: card photos are never sent to or stored on our server.
const bodySchema = z.object({
  draft: reviewedDraftSchema,
  pin: z.string().regex(/^\d{6}$/),
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
    return Response.json({ record });
  } catch (err) {
    console.error("patients: save failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not save the patient. Please try again." }, { status: 500 });
  }
}
