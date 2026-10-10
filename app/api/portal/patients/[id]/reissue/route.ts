import { z } from "zod";
import { requireClinician } from "@/lib/db/auth";
import { getPatient, portalPayload, reissueCard } from "@/lib/db/patients";
import { requireUnlock } from "@/lib/db/unlock";

type Ctx = RouteContext<"/api/portal/patients/[id]/reissue">;

// POST { cardVersion, reason } → card_version + 1 and one "reissue" log entry
// with the reason: "update" (Save & print updated card) or "lost" (Reissue lost
// card). cardVersion is the version the clinician is looking at, so two
// reissues at once can't clash. The MedPass ID never changes.
const bodySchema = z.object({ cardVersion: z.number().int().min(1), reason: z.enum(["lost", "update"]) });

export async function POST(request: Request, ctx: Ctx) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  const { id } = await ctx.params;
  const until = await requireUnlock(id, clinician);
  if (until instanceof Response) return until;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const row = await getPatient(id);
  if (!row) return Response.json({ error: "No patient with this MedPass ID." }, { status: 404 });

  const reissued = row.card_version === body.cardVersion ? await reissueCard(row, clinician, body.reason) : null;
  if (!reissued) {
    return Response.json({ error: "This card was just reissued by someone else. Reload the page." }, { status: 409 });
  }
  return Response.json(await portalPayload(reissued, until, clinician));
}
