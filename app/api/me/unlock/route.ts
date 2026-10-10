import { z } from "zod";
import { checkPin, compareDummy, getPatient, normalizeMedPassId, patientPayload } from "@/lib/db/patients";
import { clearPatientSession, setPatientSession } from "@/lib/db/patient-session";
import { logAccess } from "@/lib/db/server";

// POST /api/me/unlock { id, pin }: the patient opens their own record.
// No clinician login. Same lockout rules as the portal (5 wrong → 15 minutes,
// each failure logged as "failed_pin").
//
// Every failure gets the SAME answer: unknown ID, wrong PIN, or locked. A
// different message would tell a stranger which MedPass IDs exist.
const FAIL = "ID or PIN is incorrect. After 5 wrong tries, the record locks for 15 minutes.";
const bodySchema = z.object({ id: z.string().max(40), pin: z.string().regex(/^\d{6}$/) });

// Every failure answers after the same minimum time. A wrong PIN for a real ID
// does more work (count the try, write the log) than an unknown ID, and that
// time difference alone would reveal which IDs exist.
const FAIL_MS = 1500;
async function fail(started: number) {
  const wait = FAIL_MS - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return Response.json({ error: FAIL }, { status: 401 });
}

export async function POST(request: Request) {
  const started = Date.now();
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Type your MedPass ID and your 6-digit PIN." }, { status: 400 });
  }

  const id = normalizeMedPassId(body.id);
  const row = id ? await getPatient(id) : null;
  if (!row) {
    await compareDummy(body.pin);
    return fail(started);
  }

  const check = await checkPin(row, body.pin, null);
  if (!check.ok) return fail(started);

  const until = await setPatientSession(row.id);
  // One "view" entry per unlock, with no clinician and no facility = the patient.
  await logAccess({ patientId: row.id, action: "view" });
  return Response.json(await patientPayload(row, until));
}

// DELETE /api/me/unlock: "Lock" button, or the 10 minutes ran out.
export async function DELETE() {
  await clearPatientSession();
  return Response.json({ ok: true });
}
