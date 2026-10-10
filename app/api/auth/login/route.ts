import { z } from "zod";
import { authClient, loadClinician } from "@/lib/db/auth";

// Body: { email, password }. On success the login cookie is set on the response.
const bodySchema = z.object({
  email: z.string().trim().max(200).pipe(z.email()),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Please enter your email and password." }, { status: 400 });
  }

  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword(body);
  if (error || !data.user) {
    // Same message for "no such user" and "wrong password", so nobody can
    // find out which emails have accounts.
    const tooMany = error?.status === 429;
    return Response.json(
      { error: tooMany ? "Too many tries. Please wait a few minutes." : "Wrong email or password." },
      { status: tooMany ? 429 : 401 },
    );
  }

  // A valid login is not enough: the account must be linked to a facility
  // by an admin (the clinicians table). Otherwise log it straight out again.
  const clinician = await loadClinician(data.user.id);
  if (!clinician) {
    await supabase.auth.signOut();
    return Response.json(
      { error: "This account is not approved for the portal yet. Ask your administrator." },
      { status: 403 },
    );
  }

  return Response.json({ ok: true });
}
