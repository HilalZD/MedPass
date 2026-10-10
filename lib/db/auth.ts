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

// For API routes under /api/portal. Use it as the FIRST line:
//   const clinician = await requireClinician();
//   if (clinician instanceof Response) return clinician;
export async function requireClinician(): Promise<Clinician | Response> {
  const clinician = await getClinician();
  if (!clinician) {
    return Response.json({ error: "Please log in again." }, { status: 401 });
  }
  return clinician;
}
