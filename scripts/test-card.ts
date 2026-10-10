/**
 * Tests for lib/card.ts. Run from the repo root:
 *   npx tsx scripts/test-card.ts
 */

import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { deflateRaw } from "pako";
import QRCode from "qrcode";
import { decode, encode, readEmergency } from "../lib/card";
import type { MedPassRecord } from "../lib/types";

const PIN = "123456";
const fixture = JSON.parse(readFileSync("fixtures/sample-record.json", "utf8")) as MedPassRecord;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function throwsMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const qrVersion = (payload: string) => QRCode.create(payload, { errorCorrectionLevel: "M" }).version;

/** Fixture grown to a "heavy" patient: 12 meds, 5 conditions, 4 visits. */
function heavyRecord(): MedPassRecord {
  const extraMeds: [string, string, string, string, string][] = [
    ["Lipitor", "Atorvastatin", "20 mg", "once daily at night", "4891"],
    ["Aspirin Protect", "Acetylsalicylic acid", "100 mg", "once daily", "10617"],
    ["Losec", "Omeprazole", "20 mg", "once daily before breakfast", "7120"],
    ["Norvasc", "Amlodipine", "5 mg", "once daily", "8034"],
    ["Lasix", "Furosemide", "40 mg", "every morning", "6511"],
    ["Euthyrox", "Levothyroxine", "50 mcg", "every morning on empty stomach", "3907"],
    ["Diamicron MR", "Gliclazide", "60 mg", "with breakfast", "3388"],
    ["Plavix", "Clopidogrel", "75 mg", "once daily", "9246"],
  ];
  return {
    ...fixture,
    conditions: [
      ...fixture.conditions,
      { name: "Hyperlipidemia", verified: "patient" },
      { name: "Chronic kidney disease stage 3", verified: "clinician" },
      { name: "Hypothyroidism", verified: "patient" },
    ],
    meds: [
      ...fixture.meds.map((m, i) => ({ ...m, drugId: String(4699 + i) })),
      ...extraMeds.map(([name, ingredient, strength, frequency, drugId]) => ({
        name, ingredient, strength, frequency, drugId, status: "green" as const, verified: "patient" as const,
      })),
    ],
    visits: [
      ...fixture.visits,
      { date: "2026-06-02", place: "Nabatieh primary care center", note: "BP 150/95, Coversyl continued" },
      { date: "2026-03-20", place: "Saida shelter clinic", note: "Ran out of insulin for 5 days" },
      { date: "2025-12-11", place: "Tyre hospital", note: "HbA1c 9.1%, Lantus dose raised" },
    ],
  };
}

async function main() {
  // 1. Round trip. Add `raw` text to every med: it must be stripped from the card.
  const withRaw: MedPassRecord = {
    ...fixture,
    meds: fixture.meds.map((m) => ({ ...m, raw: `${m.name} ${m.strength ?? ""} 1x2 (handwritten)` })),
  };
  const payload = await encode(withRaw, PIN);
  const back = await decode(payload, PIN);
  let equal = true;
  try {
    deepStrictEqual(back, fixture);
  } catch {
    equal = false;
  }
  check("1. round trip equals fixture (raw stripped)", equal);

  // 2. Wrong PIN.
  const wrong = await throwsMessage(() => decode(payload, "654321"));
  check('2. wrong PIN throws "Wrong PIN"', wrong === "Wrong PIN", `got: ${wrong}`);

  // 3. Tamper with the plaintext part: drop the penicillin allergy, keep the secret part.
  const [prefix, , secretPart] = payload.split(".");
  const forgedEmergency = { name: fixture.patient.name, allergies: [], critical: fixture.emergency.critical };
  const forgedPart = Buffer.from(deflateRaw(JSON.stringify(forgedEmergency))).toString("base64url");
  const tampered = `${prefix}.${forgedPart}.${secretPart}`;
  const tamperErr = await throwsMessage(() => decode(tampered, PIN));
  check("3. tampered allergy makes decode throw", tamperErr !== null, `got: ${tamperErr}`);

  // 4. Emergency info without PIN.
  const em = readEmergency(payload);
  check(
    "4. readEmergency works without PIN",
    em.name === fixture.patient.name &&
      JSON.stringify(em.allergies) === JSON.stringify(fixture.emergency.allergies) &&
      JSON.stringify(em.critical) === JSON.stringify(fixture.emergency.critical),
    JSON.stringify(em),
  );

  // 5. Size of the sample card.
  console.log(`INFO  5. sample payload: ${payload.length} chars, QR version ${qrVersion(payload)} (level M)`);

  // 6. Size of a heavy card (and it must still round-trip).
  const heavy = heavyRecord();
  const heavyPayload = await encode(heavy, PIN);
  let heavyEqual = true;
  try {
    deepStrictEqual(await decode(heavyPayload, PIN), heavy);
  } catch {
    heavyEqual = false;
  }
  check("6. heavy record round trip", heavyEqual);
  console.log(
    `INFO  6. heavy payload (12 meds, 5 conditions, 4 visits): ${heavyPayload.length} chars, QR version ${qrVersion(heavyPayload)} (level M)`,
  );

  // 7. Decode time (dominated by the 200k PBKDF2 iterations).
  const t0 = performance.now();
  await decode(payload, PIN);
  console.log(`INFO  7. decode took ${(performance.now() - t0).toFixed(0)} ms on this machine`);

  // Extra: garbage input is rejected clearly.
  const garbage = await throwsMessage(() => decode("https://example.com/not-a-card", PIN));
  check('extra. garbage throws "Not a MedPass card"', garbage === "Not a MedPass card", `got: ${garbage}`);

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

main();
