import { z } from "zod";
import { signInClinician } from "@/lib/db/auth";
import { DEMO_MODE } from "@/lib/demo";

// POST /api/auth/demo-login { who: "nurse" | "doctor" }
// One-tap login for the judges, ONLY when NEXT_PUBLIC_DEMO_MODE=true.
// The browser only says WHICH demo user; the email and password come from
// server-only env vars and never reach the browser.
const bodySchema = z.object({ who: z.enum(["nurse", "doctor"]) });

const ACCOUNTS = {
  nurse: { email: "DEMO_NURSE_EMAIL", password: "DEMO_NURSE_PASSWORD" },
  doctor: { email: "DEMO_DOCTOR_EMAIL", password: "DEMO_DOCTOR_PASSWORD" },
} as const;

export async function POST(request: Request) {
  if (!DEMO_MODE) return Response.json({ error: "Demo mode is off." }, { status: 404 });

  let who: z.infer<typeof bodySchema>["who"];
  try {
    who = bodySchema.parse(await request.json()).who;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const email = process.env[ACCOUNTS[who].email];
  const password = process.env[ACCOUNTS[who].password];
  if (!email || !password) {
    return Response.json({ error: "The demo account is not set up on this server. Tell the MedPass team." }, { status: 500 });
  }
  return signInClinician(email, password);
}
