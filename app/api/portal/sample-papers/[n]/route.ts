import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireClinician } from "@/lib/db/auth";

// GET /api/portal/sample-papers/1..3 → one of the 3 fictional demo papers in
// fixtures/papers/, for the "Try with sample papers" button (judges).
export async function GET(_request: Request, ctx: RouteContext<"/api/portal/sample-papers/[n]">) {
  const clinician = await requireClinician();
  if (clinician instanceof Response) return clinician;

  const { n } = await ctx.params;
  if (!["1", "2", "3"].includes(n)) return Response.json({ error: "No such sample paper." }, { status: 404 });

  const file = await readFile(path.join(process.cwd(), "fixtures", "papers", `paper-${n}.jpg`));
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
