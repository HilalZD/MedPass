import { z } from "zod";
import { requireClinician } from "@/lib/db/auth";
import { changedPatientFields, editedRecordSchema, getPatient, lastReissueReason, portalPayload, saveRecord } from "@/lib/db/patients";
import { requireUnlock, unlockedUntil } from "@/lib/db/unlock";

type Ctx = RouteContext<"/api/portal/patients/[id]">;

// GET /api/portal/patients/MP-XXXX-XXXX
// → 404 if no such patient
// → 403 { needPin, cardVersion, lastReissueReason } if not unlocked (for the "old card" message)
// → 200 { record, cardVersion, updatedAt, unlockedUntil, facilityName, log } if unlocked
// Reading while unlocked does NOT write a log entry: the "view" entry was
// written once, when the PIN unlocked the record.
export async function GET(_request: Request, ctx: Ctx) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  const { id } = await ctx.params;
  const row = await getPatient(id);
  if (!row) return Response.json({ error: "No patient with this MedPass ID. Check the ID on the card." }, { status: 404 });

  const until = await unlockedUntil(id, clinician);
  if (!until) {
    return Response.json(
      { needPin: true, cardVersion: row.card_version, lastReissueReason: await lastReissueReason(id) },
      { status: 403 },
    );
  }

  return Response.json(await portalPayload(row, until, clinician));
}

// PATCH { record, baseUpdatedAt } → save an edited record, one "edit" log entry.
const patchSchema = z.object({ record: editedRecordSchema, baseUpdatedAt: z.string() });

export async function PATCH(request: Request, ctx: Ctx) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  const { id } = await ctx.params;
  const until = await requireUnlock(id, clinician);
  if (until instanceof Response) return until;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Some details are missing or not valid. Check the record and try again." }, { status: 400 });
  }
  if (body.record.meds.some((m) => m.status !== "green")) {
    return Response.json({ error: "Some medicines still need checking (yellow or unreadable)." }, { status: 400 });
  }

  const row = await getPatient(id);
  if (!row) return Response.json({ error: "No patient with this MedPass ID." }, { status: 404 });

  // An edit can't change the ID or the card version (only a reissue changes the version).
  const record = {
    ...body.record,
    id: row.id,
    cardVersion: row.card_version,
    updated: new Date().toISOString().slice(0, 10),
  };

  // Same identity rules as creating a patient, whenever identity details change.
  if (changedPatientFields(row.record, record).length > 0 && (!record.patient.dateOfBirth || !record.patient.sex)) {
    return Response.json({ error: "Date of birth (or year) and sex are required." }, { status: 400 });
  }

  try {
    const saved = await saveRecord(row, record, body.baseUpdatedAt, clinician);
    if (!saved) {
      return Response.json(
        { error: "Someone else changed this record while you were editing. Reload the page to see their changes." },
        { status: 409 },
      );
    }
    return Response.json(await portalPayload(saved, until, clinician));
  } catch (err) {
    console.error("patients: edit failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
