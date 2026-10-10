// Server-only database access.
// This file uses the Supabase SERVICE ROLE key, which bypasses Row Level Security,
// so it must never reach the browser. The "server-only" import makes the build
// fail if any client component tries to import this file.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccessAction, MedPassRecord } from "@/lib/types";

// Row shapes, matching supabase/schema.sql.
export type FacilityRow = { id: string; name: string; district: string | null };

export type ClinicianRow = {
  user_id: string;
  facility_id: string;
  full_name: string;
  role: "doctor" | "nurse" | "pharmacist" | "admin";
};

export type PatientRow = {
  id: string;                 // MedPass ID
  record: MedPassRecord;
  pin_hash: string;           // NEVER send this to the browser
  failed_attempts: number;
  locked_until: string | null;
  card_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  verified_fields: PatientField[]; // patient details a clinician has checked/changed
};

export type PatientField = "name" | "dateOfBirth" | "sex" | "bloodType";

export type AccessLogRow = {
  id: number;
  patient_id: string;
  at: string;
  clinician_id: string | null;
  facility_id: string | null;
  action: AccessAction;
};

let client: SupabaseClient | null = null;

// Returns one shared admin client. Created on first use (not at import time),
// so `npm run build` works even on a machine without the env variables.
export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  client = createClient(url, serviceKey, {
    // This client acts as the server itself, not as a logged-in user,
    // so it must not store or refresh any login session.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Write one access log entry. Used by every create / view / edit / reissue / failed PIN.
export async function logAccess(entry: {
  patientId: string;
  action: AccessAction;
  clinicianId?: string | null;
  facilityId?: string | null;
}): Promise<void> {
  const { error } = await db().from("access_log").insert({
    patient_id: entry.patientId,
    action: entry.action,
    clinician_id: entry.clinicianId ?? null,
    facility_id: entry.facilityId ?? null,
  });
  // Never log the record itself, only that the write failed.
  if (error) throw new Error(`access_log insert failed: ${error.code}`);
}
