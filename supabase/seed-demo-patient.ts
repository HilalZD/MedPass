/**
 * Puts the demo patient (fixtures/demo-record.json, PIN 246810) into Supabase,
 * so the printed demo card also works online (portal + /me).
 * Fictional medical data. Safe to run again: it resets the demo patient's
 * record, PIN, lockout and card version, and adds a "create" log entry the first time.
 *
 * Run from the repo root:
 *   npx tsx --env-file=.env.local supabase/seed-demo-patient.ts
 *
 * Optional: clean the demo card's access log (e.g. test entries before judging):
 *   npx tsx --env-file=.env.local supabase/seed-demo-patient.ts --reset-log
 * This deletes the access-log entries of MP-HZ26-DM8X ONLY (hard-wired below,
 * never any other patient), then writes one fresh "create" entry.
 *
 * (Talks to Supabase directly with the service role key, because lib/db/* is
 * marked server-only for Next.js and can't be imported from a plain script.)
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import type { MedPassRecord } from "../lib/types";

const PIN = "246810";
const TYRE_FACILITY = "11111111-1111-1111-1111-111111111111"; // seeded in schema.sql

// The ONLY patient whose log --reset-log may delete. Not taken from the fixture
// file on purpose: editing the JSON can never point the delete at someone else.
const DEMO_CARD_ID = "MP-HZ26-DM8X";
const RESET_LOG = process.argv.includes("--reset-log");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Run with --env-file=.env.local (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const record = JSON.parse(readFileSync("fixtures/demo-record.json", "utf8")) as MedPassRecord;
  if (record.id !== DEMO_CARD_ID) throw new Error(`fixtures/demo-record.json must have id ${DEMO_CARD_ID}, found ${record.id}. Stopping.`);

  // Registered "by" the Tyre clinician, so the access log looks like the real flow.
  const { data: clinician } = await db.from("clinicians").select("user_id").eq("facility_id", TYRE_FACILITY).limit(1).maybeSingle();

  const { data: existing } = await db.from("patients").select("id").eq("id", DEMO_CARD_ID).maybeSingle();

  const { error } = await db.from("patients").upsert({
    id: DEMO_CARD_ID,
    record,
    pin_hash: await bcrypt.hash(PIN, 10),
    failed_attempts: 0,
    locked_until: null,
    card_version: record.cardVersion,
    created_by: clinician?.user_id ?? null,
    verified_fields: ["name"],
  });
  if (error) throw new Error(`patients upsert failed: ${error.code} ${error.message}`);

  let deleted = 0;
  if (RESET_LOG) {
    const { error: delError, count } = await db
      .from("access_log")
      .delete({ count: "exact" })
      .eq("patient_id", DEMO_CARD_ID); // exact match on the one demo card, nothing else
    if (delError) throw new Error(`access_log delete failed: ${delError.code}`);
    deleted = count ?? 0;
  }

  if (!existing || RESET_LOG) {
    const { error: logError } = await db.from("access_log").insert({
      patient_id: DEMO_CARD_ID,
      action: "create",
      clinician_id: clinician?.user_id ?? null,
      facility_id: TYRE_FACILITY,
    });
    if (logError) throw new Error(`access_log insert failed: ${logError.code}`);
  }

  console.log(`${existing ? "Reset" : "Created"} demo patient ${DEMO_CARD_ID} (${record.patient.name}), PIN ${PIN}.`);
  if (RESET_LOG) console.log(`  Access log cleaned: ${deleted} entries deleted for ${DEMO_CARD_ID} only, 1 fresh "create" entry added.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
