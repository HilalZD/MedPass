import { getPatient, patientPayload } from "@/lib/db/patients";
import { getPatientSession } from "@/lib/db/patient-session";

// GET /api/me: the record of the patient whose 10-minute session is open.
// Reading again (e.g. a page refresh) does not add another "view" entry.
export async function GET() {
  const session = await getPatientSession();
  if (!session) return Response.json({ error: "Locked." }, { status: 401 });

  const row = await getPatient(session.patientId);
  if (!row) return Response.json({ error: "Locked." }, { status: 401 });

  return Response.json(await patientPayload(row, session.until));
}
