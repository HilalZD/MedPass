// Patient records in the database. Server-only.
import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { MedPassRecord } from "@/lib/types";
import type { Clinician } from "./auth";
import { db, logAccess } from "./server";

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
