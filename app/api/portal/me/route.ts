import { requireClinician } from "@/lib/db/auth";

// GET /api/portal/me → who is logged in and at which facility.
// Also the template for every /api/portal route: requireClinician() comes first.
export async function GET() {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  return Response.json({ clinician });
}
