/**
 * Seeds the judges' demo patient: "Fatima Haidar" (فاطمة حيدر), FICTIONAL,
 * from fixtures/sample-record.json, MedPass ID MP-Z8EX-SN4Y, PIN 123456.
 *
 * Her access log already tells the story:
 *   2 days ago  Registered by Nurse Rana Khalil, Tyre Primary Healthcare Centre
 *   yesterday   Viewed + Edited by Dr. Karim Nasr, Beirut Governmental Hospital
 *               (he added a follow-up visit and verified her hypertension)
 *
 * Safe to run twice: it resets Fatima's record, PIN, lockout and card version,
 * and writes the story log entries only the first time. It never touches any
 * other patient (e.g. Hilal's own card MP-7K3Q-92XD).
 *
 * Run from the repo root:
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { DEMO_PATIENT } from "../lib/demo";
import type { MedPassRecord } from "../lib/types";

const TYRE = "11111111-1111-1111-1111-111111111111"; // facilities seeded in supabase/schema.sql
const BEIRUT = "22222222-2222-2222-2222-222222222222";

const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const date = (msAgo: number) => iso(msAgo).slice(0, 10);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Run with --env-file=.env.local (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // The two demo clinicians, found by facility (no emails in this script).
  const clinicianAt = async (facility: string) => {
    const { data } = await db.from("clinicians").select("user_id, full_name").eq("facility_id", facility).limit(1).maybeSingle();
    if (!data) throw new Error(`No clinician linked to facility ${facility}. Link the demo users first (supabase/schema.sql).`);
    return data as { user_id: string; full_name: string };
  };
  const nurse = await clinicianAt(TYRE);
  const doctor = await clinicianAt(BEIRUT);

  // Fatima's record: the sample record + her Arabic name + the doctor's edit.
  const sample = JSON.parse(readFileSync("fixtures/sample-record.json", "utf8")) as MedPassRecord;
  const record: MedPassRecord = {
    ...sample,
    id: DEMO_PATIENT.id,
    cardVersion: 1,
    patient: { ...sample.patient, nameAr: "فاطمة حيدر" },
    conditions: sample.conditions.map((c) => (c.name === "Hypertension" ? { ...c, verified: "clinician" } : c)),
    visits: [
      { date: date(1 * DAY), place: "Beirut Governmental Hospital", note: "Follow-up: BP 135/85, stable. Eye check still due." },
      ...sample.visits,
    ],
    updated: date(1 * DAY),
  };

  const { data: existing } = await db.from("patients").select("id").eq("id", record.id).maybeSingle();

  const { error } = await db.from("patients").upsert({
    id: record.id,
    record,
    pin_hash: await bcrypt.hash(DEMO_PATIENT.pin, 10),
    failed_attempts: 0,
    locked_until: null,
    card_version: record.cardVersion,
    created_by: nurse.user_id,
    verified_fields: ["name", "nameAr"],
  });
  if (error) throw new Error(`patients upsert failed: ${error.code} ${error.message}`);

  if (!existing) {
    const { error: logError } = await db.from("access_log").insert([
      { patient_id: record.id, action: "create", clinician_id: nurse.user_id, facility_id: TYRE, at: iso(2 * DAY) },
      { patient_id: record.id, action: "view", clinician_id: doctor.user_id, facility_id: BEIRUT, at: iso(1 * DAY + 20 * 60_000) },
      { patient_id: record.id, action: "edit", clinician_id: doctor.user_id, facility_id: BEIRUT, at: iso(1 * DAY) },
    ]);
    if (logError) throw new Error(`access_log insert failed: ${logError.code}`);
  }

  console.log(`${existing ? "Reset" : "Created"} ${record.patient.name} (${record.id}), PIN ${DEMO_PATIENT.pin}.`);
  console.log(`  Registered by ${nurse.full_name} (Tyre); viewed + edited by ${doctor.full_name} (Beirut).`);
  if (existing) console.log("  (Log entries were already there, so none were added.)");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
