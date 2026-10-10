// Who is logged in? Server-only helpers for clinician login.
//
// Two different Supabase clients are involved:
// - authClient(): uses the PUBLIC anon key + the browser's login cookies.
//   It can only do auth things (log in, log out, "who is this?"). Because of RLS
//   it cannot read any table.
// - db() from ./server: uses the SERVICE ROLE key. We only call it after
//   authClient() has told us who the user is.
import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db, type ClinicianRow } from "./server";

export async function authClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components may not set cookies. That's fine: proxy.ts refreshes
            // the login cookie on every /portal request anyway.
          }
        },
      },
    },
  );
}

// What the rest of the app knows about the logged-in clinician.
export type Clinician = {
  userId: string;
  fullName: string;
  role: ClinicianRow["role"];
  facilityId: string;
  facilityName: string;
};

// Returns the logged-in clinician, or null if nobody is logged in or the
// login is not linked to a facility in the clinicians table.
export async function getClinician(): Promise<Clinician | null> {
  // Wait for the real request FIRST. With Partial Prefetching, cookies() alone
  // does not stop prerendering (session data is part of the App Shell), and
  // getClaims() checks the token's expiry with Date.now(). connection() makes
  // everything after it request-time only, so it is never prerendered or cached.
  await connection();
  const supabase = await authClient();
  // getClaims() checks the login token's signature, so it can't be faked by
  // editing the cookie.
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) return null;
  return loadClinician(userId);
}

// Looks up a Supabase Auth user in the clinicians table (with the facility name).
export async function loadClinician(userId: string): Promise<Clinician | null> {
  const { data: row } = await db()
    .from("clinicians")
    .select("user_id, full_name, role, facility_id, facilities(name)")
    .eq("user_id", userId)
    .maybeSingle<ClinicianRow & { facilities: { name: string } | null }>();
  if (!row || !row.facilities) return null;

  return {
    userId: row.user_id,
    fullName: row.full_name,
    role: row.role,
    facilityId: row.facility_id,
    facilityName: row.facilities.name,
  };
}

// Log a clinician in (sets the login cookie). Used by the normal login form and
// by the demo buttons, so both go through exactly the same checks.
export async function signInClinician(email: string, password: string): Promise<Response> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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

// For API routes under /api/portal. Use it as the FIRST line:
//   const clinician = await requireClinician();
//   if (clinician instanceof Response) return clinician;
export async function requireClinician(): Promise<Clinician | Response> {
  const clinician = await getClinician();
  if (!clinician) {
    return Response.json({ error: "Your login expired. Please log in again." }, { status: 401 });
  }
  return clinician;
}
