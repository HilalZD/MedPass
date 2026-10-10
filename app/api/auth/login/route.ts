import { z } from "zod";
import { signInClinician } from "@/lib/db/auth";

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
  return signInClinician(body.email, body.password);
}
