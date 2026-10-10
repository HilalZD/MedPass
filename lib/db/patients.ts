// Patient records in the database. Server-only.
import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AccessAction, MedPassRecord } from "@/lib/types";
import type { Clinician } from "./auth";
import { db, logAccess, type PatientField, type PatientRow, type ReissueReason } from "./server";

// No 0/O, 1/I/L or U/V: easy to read aloud and to type from a printed card.
// 29 characters ^ 8 positions ≈ 500 billion possible IDs.
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";

export function generateMedPassId(): string {
  const pick = () => ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  const part = () => Array.from({ length: 4 }, pick).join("");
  return `MP-${part()}-${part()}`;
}

// bcrypt cost 10: ~100 ms per check on a server, so guessing PINs over the
// network is slow, on top of the 5-tries lockout.
export const hashPin = (pin: string) => bcrypt.hash(pin, 10);

// Save a new patient + write the "create" access log entry.
// `buildRecord` gets the new MedPass ID, so the ID inside the record and the
// database row always match. Retries with a new ID in the (very unlikely)
// case that the random ID already exists.
export async function createPatient(
  buildRecord: (id: string) => MedPassRecord,
  pin: string,
  clinician: Clinician,
): Promise<MedPassRecord> {
  const pinHash = await hashPin(pin);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const record = buildRecord(generateMedPassId());
    const { error } = await db().from("patients").insert({
      id: record.id,
      record,
      pin_hash: pinHash,
      card_version: record.cardVersion,
      created_by: clinician.userId,
    });
    if (error?.code === "23505") continue; // duplicate ID: try another one
    if (error) throw new Error(`patients insert failed: ${error.code}`);

    await logAccess({
      patientId: record.id,
      action: "create",
      clinicianId: clinician.userId,
      facilityId: clinician.facilityId,
    });
    return record;
  }
  throw new Error("Could not find a free MedPass ID");
}

// ---------------------------------------------------------------------------
// Opening an existing patient (Phase 4, reused by /me in Phase 5)
// ---------------------------------------------------------------------------

export const MAX_PIN_TRIES = 5;
const LOCK_MINUTES = 15;

// MedPass ID typed by a human → canonical form, or null if it can't be one.
// "mp 7k3q92xd" → "MP-7K3Q-92XD".
export function normalizeMedPassId(text: string): string | null {
  const s = text.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^MP/, "");
  return /^[A-Z0-9]{8}$/.test(s) ? `MP-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

export async function getPatient(id: string): Promise<PatientRow | null> {
  const { data, error } = await db().from("patients").select("*").eq("id", id).maybeSingle<PatientRow>();
  if (error) throw new Error(`patients select failed: ${error.code}`);
  return data;
}

export type PinCheck =
  | { ok: true }
  | { ok: false; locked: true; minutes: number }
  | { ok: false; locked: false; triesLeft: number };

// Check a PIN with the lockout rule: 5 wrong tries → locked for 15 minutes.
// Every wrong try is written to the access log as "failed_pin".
// `who` is the clinician, or null when the patient opens their own record (/me).
export async function checkPin(row: PatientRow, pin: string, who: Clinician | null): Promise<PinCheck> {
  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) {
    return { ok: false, locked: true, minutes: Math.ceil((Date.parse(row.locked_until) - now) / 60_000) };
  }

  if (await bcrypt.compare(pin, row.pin_hash)) {
    if (row.failed_attempts > 0 || row.locked_until) {
      await db().from("patients").update({ failed_attempts: 0, locked_until: null }).eq("id", row.id);
    }
    return { ok: true };
  }

  const attempts = row.failed_attempts + 1;
  const lock = attempts >= MAX_PIN_TRIES;
  await db()
    .from("patients")
    .update(
      lock
        ? { failed_attempts: 0, locked_until: new Date(now + LOCK_MINUTES * 60_000).toISOString() }
        : { failed_attempts: attempts },
    )
    .eq("id", row.id);
  await logAccess({ patientId: row.id, action: "failed_pin", clinicianId: who?.userId, facilityId: who?.facilityId });

  return lock ? { ok: false, locked: true, minutes: LOCK_MINUTES } : { ok: false, locked: false, triesLeft: MAX_PIN_TRIES - attempts };
}

// Plain-language message for a failed PinCheck.
export function pinErrorMessage(check: Exclude<PinCheck, { ok: true }>): string {
  if (check.locked) return `Too many wrong PINs. This record is locked for ${check.minutes} minute${check.minutes === 1 ? "" : "s"}.`;
  return `Wrong PIN. ${check.triesLeft} ${check.triesLeft === 1 ? "try" : "tries"} left before the record locks for ${LOCK_MINUTES} minutes.`;
}

export type AccessLogView = { at: string; action: AccessAction; facility: string | null; clinician: string | null };

export async function getAccessLog(patientId: string, limit = 50): Promise<AccessLogView[]> {
  const { data, error } = await db()
    .from("access_log")
    .select("at, action, clinicians(full_name), facilities(name)")
    .eq("patient_id", patientId)
    .order("at", { ascending: false })
    .limit(limit)
    .returns<{ at: string; action: AccessAction; clinicians: { full_name: string } | null; facilities: { name: string } | null }[]>();
  if (error) throw new Error(`access_log select failed: ${error.code}`);
  return data.map((r) => ({
    at: r.at,
    action: r.action,
    facility: r.facilities?.name ?? null,
    clinician: r.clinicians?.full_name ?? null,
  }));
}

const PATIENT_FIELDS: PatientField[] = ["name", "dateOfBirth", "sex", "bloodType"];

// Patient details that differ between two versions of a record.
export function changedPatientFields(before: MedPassRecord, after: MedPassRecord): PatientField[] {
  return PATIENT_FIELDS.filter((f) => (before.patient[f] ?? "") !== (after.patient[f] ?? ""));
}

// Save an edited record. `baseUpdatedAt` is the updated_at the clinician
// loaded: if someone else saved in between, nothing is written (returns null)
// so their changes are not silently overwritten.
// Patient details the clinician changed are marked clinician-verified here, on
// the server, by comparing with the saved record.
export async function saveRecord(
  row: PatientRow,
  record: MedPassRecord,
  baseUpdatedAt: string,
  clinician: Clinician,
): Promise<PatientRow | null> {
  const id = row.id;
  const verified = [...new Set([...(row.verified_fields ?? []), ...changedPatientFields(row.record, record)])];
  const { data, error } = await db()
    .from("patients")
    .update({ record, verified_fields: verified })
    .eq("id", id)
    .eq("updated_at", baseUpdatedAt)
    .select("*")
    .maybeSingle<PatientRow>();
  if (error?.code === "PGRST204") {
    throw new Error("patients update failed: column missing. Run the verified_fields line from supabase/schema.sql");
  }
  if (error) throw new Error(`patients update failed: ${error.code}`);
  if (!data) return null;
  await logAccess({ patientId: id, action: "edit", clinicianId: clinician.userId, facilityId: clinician.facilityId });
  return data;
}

// New card: card_version + 1 (in the row AND inside the record). Old cards then
// show "This card was replaced" when scanned online. Returns null if the card
// version changed in between (someone else reissued at the same time).
// The MedPass ID never changes: only card_version goes up.
export async function reissueCard(row: PatientRow, clinician: Clinician, reason: ReissueReason): Promise<PatientRow | null> {
  const next = row.card_version + 1;
  const { data, error } = await db()
    .from("patients")
    .update({ card_version: next, record: { ...row.record, cardVersion: next } })
    .eq("id", row.id)
    .eq("card_version", row.card_version)
    .select("*")
    .maybeSingle<PatientRow>();
  if (error) throw new Error(`patients reissue failed: ${error.code}`);
  if (!data) return null;
  await logAccess({ patientId: row.id, action: "reissue", clinicianId: clinician.userId, facilityId: clinician.facilityId, reason });
  return data;
}

// Why the newest card was issued ("lost" / "update"), or null if never reissued.
// Used to explain why an older scanned card is out of date.
export async function lastReissueReason(patientId: string): Promise<ReissueReason | null> {
  const { data } = await db()
    .from("access_log")
    .select("reason")
    .eq("patient_id", patientId)
    .eq("action", "reissue")
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle<{ reason: ReissueReason | null }>();
  return data?.reason ?? null;
}

// What the portal page gets for an unlocked patient. NEVER includes pin_hash.
export async function portalPayload(row: PatientRow, unlockedUntil: number, clinician: Clinician) {
  return {
    record: row.record,
    cardVersion: row.card_version,
    lastReissueReason: await lastReissueReason(row.id),
    updatedAt: row.updated_at,
    verifiedFields: row.verified_fields ?? [],
    unlockedUntil,
    facilityName: clinician.facilityName,
    log: await getAccessLog(row.id),
  };
}

// ---------------------------------------------------------------------------
// Validation of an edited record sent by the portal (with size limits).
// ---------------------------------------------------------------------------

const text = (max = 300) => z.string().trim().max(max);
const verified = z.enum(["patient", "clinician"]);

export const editedRecordSchema = z.object({
  v: z.literal(2),
  id: z.string(),
  cardVersion: z.number().int().min(1),
  patient: z.object({
    name: text(120).min(1),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sex: z.enum(["F", "M"]).optional(),
    bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional(),
  }),
  emergency: z.object({
    allergies: z.array(text(120).min(1)).max(30),
    critical: z.array(text(120).min(1)).max(30),
  }),
  conditions: z.array(z.object({ name: text(120).min(1), verified })).max(50),
  meds: z
    .array(
      z.object({
        name: text(120).min(1),
        ingredient: text(200).optional(),
        strength: text(60).optional(),
        frequency: text(120).optional(),
        drugId: text(60).optional(),
        status: z.enum(["green", "yellow", "unreadable"]),
        verified,
      }),
    )
    .max(50),
  referrals: z
    .array(z.object({ to: text(120).min(1), reason: text(300).optional(), status: z.enum(["open", "done"]) }))
    .max(30),
  visits: z
    .array(z.object({ date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/), place: text(120), note: text(300) }))
    .max(100),
  updated: z.string(),
});

// Compile-time check: a valid edited record is a MedPassRecord.
const _editedMatchesType: (r: z.infer<typeof editedRecordSchema>) => MedPassRecord = (r) => r;
void _editedMatchesType;
