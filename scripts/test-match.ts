/**
 * Tests for lib/match.ts against the real public/drugs.json. Run from the repo root:
 *   npx tsx scripts/test-match.ts
 */

import { readFileSync } from "node:fs";
import { createMatcher, type DrugRow, type MedMatch } from "../lib/match";
import type { Med, MedPassRecord } from "../lib/types";

const drugs = JSON.parse(readFileSync("public/drugs.json", "utf8")) as DrugRow[];
const fixture = JSON.parse(readFileSync("fixtures/sample-record.json", "utf8")) as MedPassRecord;
const { matchMed, alternatives } = createMatcher(drugs);

let failures = 0;
const med = (name: string, strength?: string): Med => ({ name, strength, status: "green", verified: "patient" });
const show = (m: MedMatch | null) =>
  m ? `${m.confidence.toUpperCase().padEnd(4)} ${m.drug.brand} ${m.drug.strength || "-"} | ${m.drug.ingredient || "?"} | ${m.drug.atc || "-"} | ${m.drug.price.toLocaleString("en-US")} LBP${m.drug.covered ? " | AMAN" : ""}` : "null";

function expect(label: string, m: MedMatch | null, want: "high" | "low" | null, brand?: string) {
  const ok = (m?.confidence ?? null) === want && (!brand || m?.drug.brand === brand);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(26)} -> ${show(m)}`);
}

console.log(`drugs.json: ${drugs.length} rows\n`);
console.log("== fixture meds ==");
expect("Glucophage 850 mg", matchMed(fixture.meds[0]), "high", "GLUCOPHAGE");
expect("Concor 5 mg", matchMed(fixture.meds[1]), "high", "CONCOR");
expect("Lantus 18 IU", matchMed(fixture.meds[2]), "high", "LANTUS");
expect("Coversyl 5 mg", matchMed(fixture.meds[3]), "high", "COVERSYL ARGININE");

console.log("\n== edge cases ==");
expect("Glucophag 850mg (typo)", matchMed(med("Glucophag", "850mg")), "low", "GLUCOPHAGE");
expect("Lipitor 20mg", matchMed(med("Lipitor", "20mg")), null);
expect("Aspirin 100mg", matchMed(med("Aspirin", "100mg")), "high", "ASPIRIN PROTECT");
expect("Panadol (no strength)", matchMed(med("Panadol")), "low");
expect("Lantus 18 IU", matchMed(med("Lantus", "18 IU")), "high", "LANTUS");
expect("Glucophage 850mg in name", matchMed(med("Glucophage 850mg")), "high", "GLUCOPHAGE");
expect("Concor 7 mg (no such)", matchMed(med("Concor", "7 mg")), "low");
expect("Xyzzyqq (nonsense)", matchMed(med("Xyzzyqq", "10mg")), null);

console.log("\n== alternatives (same ATC + strength + form family, cheapest first) ==");
for (const [label, m] of [
  ["Glucophage 850mg", matchMed(fixture.meds[0])],
  ["Concor 5mg", matchMed(fixture.meds[1])],
  ["Lantus", matchMed(fixture.meds[2])],
] as const) {
  const alts = m ? alternatives(m.drug) : [];
  console.log(`  ${label} (${m?.drug.atc}, ${m?.drug.strength}, ${m?.drug.price.toLocaleString("en-US")} LBP):`);
  for (const a of alts) console.log(`     - ${a.brand} ${a.strength} | ${a.form} | ${a.price.toLocaleString("en-US")} LBP`);
  if (!alts.length) console.log("     (none)");
  if (label === "Lantus") {
    const toujeo = alts.some((a) => a.brand.toUpperCase().includes("TOUJEO"));
    if (toujeo) failures++;
    console.log(`${toujeo ? "FAIL" : "PASS"}  Toujeo (300 U/ml) is not offered as a Lantus alternative`);
  }
  const self = alts.some((a) => a.id === m?.drug.id);
  if (self) failures++;
  if (self) console.log(`FAIL  ${label} lists itself`);
}
const noAtc = alternatives({ ...drugs[0], atc: "" });
if (noAtc.length) failures++;
console.log(`${noAtc.length ? "FAIL" : "PASS"}  empty atc -> no alternatives`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
