import { requireClinician } from "@/lib/db/auth";
import { getPatient } from "@/lib/db/patients";
import { deletePhoto, jpegBytes, photoInputSchema, readPhoto, savePhoto } from "@/lib/db/photos";
import { logAccess } from "@/lib/db/server";
import { requireUnlock } from "@/lib/db/unlock";

// /api/portal/patients/MP-XXXX-XXXX/photo
// Every method needs BOTH keys: the clinician login and this patient's PIN unlock.
type Ctx = RouteContext<"/api/portal/patients/[id]/photo">;

async function guard(ctx: Ctx) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;
  const { id } = await ctx.params;
  const until = await requireUnlock(id, clinician);
  if (until instanceof Response) return until;
  const row = await getPatient(id);
  if (!row) return Response.json({ error: "No patient with this MedPass ID." }, { status: 404 });
  return { clinician, row };
}

// GET → the JPEG. Private: the browser must not keep it in a shared cache.
export async function GET(_request: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if (g instanceof Response) return g;
  if (!g.row.photo_path) return Response.json({ error: "No photo." }, { status: 404 });

  const bytes = await readPhoto(g.row.photo_path);
  if (!bytes) return Response.json({ error: "No photo." }, { status: 404 });
  return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
}

// PUT { photo, consent: true } → add or replace the photo. One "edit" log entry.
export async function PUT(request: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if (g instanceof Response) return g;

  const parsed = photoInputSchema.safeParse(await request.json().catch(() => null));
  const bytes = parsed.success ? jpegBytes(parsed.data.photo) : null;
  if (!parsed.success || !bytes) {
    return Response.json({ error: "Tick the consent box and use a JPEG photo under 60 KB." }, { status: 400 });
  }

  try {
    await savePhoto(g.row.id, bytes);
    await logAccess({ patientId: g.row.id, action: "edit", clinicianId: g.clinician.userId, facilityId: g.clinician.facilityId });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("photo: save failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not save the photo. Please try again." }, { status: 500 });
  }
}

// DELETE → remove the photo (e.g. the patient withdraws consent). One "edit" log entry.
export async function DELETE(_request: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if (g instanceof Response) return g;
  try {
    await deletePhoto(g.row.id);
    await logAccess({ patientId: g.row.id, action: "edit", clinicianId: g.clinician.userId, facilityId: g.clinician.facilityId });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("photo: delete failed", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Could not remove the photo. Please try again." }, { status: 500 });
  }
}
