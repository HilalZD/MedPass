import { z } from "zod";
import { requireClinician } from "@/lib/db/auth";
import { checkPin, getPatient, pinErrorMessage, portalPayload } from "@/lib/db/patients";
import { logAccess } from "@/lib/db/server";
import { clearUnlock, setUnlock, unlockedUntil } from "@/lib/db/unlock";

type Ctx = RouteContext<"/api/portal/patients/[id]/unlock">;
const bodySchema = z.object({ pin: z.string().regex(/^\d{6}$/) });

// POST { pin } → checks the PIN (5 wrong → 15-minute lockout), sets the
// 15-minute unlock cookie and returns the record. Writes ONE "view" entry per
// unlock: typing the PIN again while still unlocked (e.g. to print after a
// page refresh) does not add another.
export async function POST(request: Request, ctx: Ctx) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  const { id } = await ctx.params;
  let pin: string;
  try {
    pin = bodySchema.parse(await request.json()).pin;
  } catch {
    return Response.json({ error: "The PIN is 6 digits." }, { status: 400 });
  }

  const row = await getPatient(id);
  if (!row) return Response.json({ error: "No patient with this MedPass ID. Check the ID on the card." }, { status: 404 });

  const check = await checkPin(row, pin, clinician);
  if (!check.ok) return Response.json({ error: pinErrorMessage(check) }, { status: check.locked ? 423 : 401 });

  const wasUnlocked = (await unlockedUntil(id, clinician)) !== null;
  const until = await setUnlock(id, clinician);
  if (!wasUnlocked) {
    await logAccess({ patientId: id, action: "view", clinicianId: clinician.userId, facilityId: clinician.facilityId });
  }
  return Response.json(await portalPayload(row, until, clinician));
}

// DELETE → lock again now ("Lock" button, or the countdown ran out).
export async function DELETE() {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;
  await clearUnlock();
  return Response.json({ ok: true });
}
