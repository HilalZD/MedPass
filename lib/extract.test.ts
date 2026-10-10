/**
 * Tests for the pure parts of lib/extract.ts (no AI calls). Run from the repo root:
 *   npx tsx lib/extract.test.ts
 *
 * The 3 papers below are the real per-paper AI outputs for our 3 test papers
 * (fictional patient), from the run on 2026-10-10:
 *   paper 1 = Arabic discharge note (penicillin allergy, 2 conditions, eye referral, Panadol)
 *   paper 2 = Dr. K. Nasr prescription (Amlor, Lantus, Coversyl, 1 scribbled line)
 *   paper 3 = "scrambled" prescription (Glucophage, Concor, Lytor, Aspirin)
 */

import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import {
  NOT_IN_MOPH_LIST,
  lowMatchNote,
  applyMatches,
  draftToRecord,
  mergeDrafts,
  parsePaper,
  tagPaper,
  type ExtractedPaper,
} from "./extract";
import { createMatcher, type DrugRow } from "./match";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

const TODAY = "2026-10-10";
const empty = (): ExtractedPaper => ({
  patient: { name: "" },
  emergency: { allergies: [], critical: [] },
  conditions: [],
  meds: [],
  referrals: [],
  visits: [],
});

const arabicPaper: ExtractedPaper = {
  ...empty(),
  patient: { name: "Fatima Haddad" },
  emergency: { allergies: ["Penicillin"], critical: [] },
  conditions: [{ name: "Type 2 diabetes" }, { name: "Hypertension" }],
  meds: [{ raw: "panadol500 عند اللزوم", name: "panadol", strength: "500", frequency: "when needed", status: "yellow" }],
  referrals: [{ to: "Ophthalmology", reason: "Regular check-up", status: "open" }],
};

const amlorPaper: ExtractedPaper = {
  ...empty(),
  meds: [
    { raw: "Amlor 5mg 1x1.", name: "Amlor", strength: "5 mg", frequency: "once daily", status: "green" },
    { raw: "Lantus 18IU hs", name: "Lantus", strength: "18 units", frequency: "at bedtime", status: "green" },
    { raw: "Coversyl 5 1x1", name: "Coversyl", strength: "5", frequency: "once daily", status: "yellow" },
    { raw: "S?pple??? ? g???? ??? ??? ?a?? day", name: "Unreadable", frequency: "each day", status: "unreadable" },
  ],
  visits: [{ date: "2026-08-20", place: "Dr. K. Nasr", note: "Prescription issued" }],
};

const glucophagePaper: ExtractedPaper = {
  ...empty(),
  patient: { name: "Fatima Haddad", ageWritten: "64" },
  meds: [
    { raw: "1. Glucophage 850mg: 1 tab twice daily after meals", name: "Glucophage", strength: "850 mg", frequency: "twice daily after meals", status: "green" },
    { raw: "2. Concor 5mg: 1 tab every morning", name: "Concor", strength: "5 mg", frequency: "once daily, every morning", status: "green" },
    { raw: "3. Lytor 20mg: 1 tab at bedtime", name: "Unreadable", strength: "20 mg", frequency: "at bedtime", status: "unreadable" },
    { raw: "4. Aspirin 81mg: 1 tab dail.", name: "Aspirin", strength: "81 mg", frequency: "once daily", status: "green" },
  ],
};

const tag = (papers: ExtractedPaper[]) => papers.map((p, i) => tagPaper(p, i + 1, TODAY));

// --- 1. The 3 real papers ----------------------------------------------------
{
  const { draft, warnings } = mergeDrafts(tag([arabicPaper, amlorPaper, glucophagePaper]));
  check("3 papers: all 9 meds kept", draft.meds.length === 9, `got ${draft.meds.length}`);
  check(
    "3 papers: penicillin allergy kept, from paper 1",
    draft.emergency.allergies.some((a) => a.name === "Penicillin" && a.sourcePaper === 1),
  );
  deepStrictEqual(draft.conditions.map((c) => c.name), ["Type 2 diabetes", "Hypertension"]);
  check("3 papers: both conditions kept", true);
  check("3 papers: referral kept", draft.referrals.length === 1 && draft.referrals[0].to === "Ophthalmology");
  check("3 papers: nothing invented as critical", draft.emergency.critical.length === 0);
  deepStrictEqual(draft.meds.map((m) => m.sourcePaper), [1, 2, 2, 2, 2, 3, 3, 3, 3]);
  check("3 papers: every med says which paper it came from", true);
  check("3 papers: no statuses changed", draft.meds.filter((m) => m.status === "green").length === 5);
  check("3 papers: age kept as written", draft.patient.ageWritten === "64" && !draft.patient.dateOfBirth);
  check("3 papers: no warnings", warnings.length === 0, warnings.join(" / "));
}

// --- 2. Exact duplicates are listed once (case-insensitive) ------------------
{
  const a = { ...empty(), meds: [{ raw: "x", name: "Concor", strength: "5 mg", frequency: "once daily", status: "green" as const }] };
  const b = { ...empty(), meds: [{ raw: "y", name: "CONCOR", strength: "5  MG", frequency: "Once daily", status: "green" as const }] };
  const { draft, warnings } = mergeDrafts(tag([a, b]));
  check("exact duplicate med listed once", draft.meds.length === 1 && draft.meds[0].sourcePaper === 1);
  check("exact duplicate gives no warning", warnings.length === 0);
}

// --- 3. Same drug, different strength → keep both, both yellow ---------------
{
  const a = { ...empty(), meds: [{ raw: "x", name: "Concor", strength: "5 mg", frequency: "once daily", status: "green" as const }] };
  const b = { ...empty(), meds: [{ raw: "y", name: "Concor", strength: "10 mg", frequency: "once daily", status: "green" as const }] };
  const { draft, warnings } = mergeDrafts(tag([a, b]));
  check("conflicting doses: both kept", draft.meds.length === 2);
  check("conflicting doses: both yellow", draft.meds.every((m) => m.status === "yellow"));
  check("conflicting doses: one warning", warnings.length === 1 && warnings[0].includes("Concor"));
}

// --- 4. Unreadable meds are never merged -------------------------------------
{
  const u = { raw: "??", name: "Unreadable", status: "unreadable" as const };
  const { draft } = mergeDrafts(tag([{ ...empty(), meds: [u, u] }, { ...empty(), meds: [u] }]));
  check("unreadable meds never merged", draft.meds.length === 3 && draft.meds.every((m) => m.status === "unreadable"));
}

// --- 5. Allergies are never dropped, even exact duplicates -------------------
{
  const a = { ...empty(), emergency: { allergies: ["Penicillin"], critical: [] } };
  const b = { ...empty(), emergency: { allergies: ["penicillin", "Sulfa"], critical: [] } };
  const { draft } = mergeDrafts(tag([a, b]));
  check("allergies never dropped in merge", draft.emergency.allergies.length === 3);
}

// --- 6. A failed paper keeps paper numbers correct ---------------------------
{
  const p1 = tagPaper({ ...empty(), patient: { name: "Fatima Haidar" } }, 1, TODAY);
  const p3 = tagPaper({ ...empty(), patient: { name: "Fatima Haddad" }, meds: [{ raw: "z", name: "Aspirin", status: "yellow" }] }, 3, TODAY);
  const { draft, warnings } = mergeDrafts([p1, null, p3]);
  check("failed paper: med still says paper 3", draft.meds[0].sourcePaper === 3);
  check(
    "failed paper: name warning names papers 1 and 3",
    warnings.length === 1 && warnings[0].includes("(paper 1)") && warnings[0].includes("(paper 3)"),
    warnings.join(" / "),
  );
  check("failed paper: first name wins", draft.patient.name === "Fatima Haidar");
}

// --- 7. mergeDrafts does not change its input --------------------------------
{
  const input = tag([amlorPaper, { ...amlorPaper, meds: [{ ...amlorPaper.meds[0], strength: "10 mg" }] }]);
  const before = JSON.stringify(input);
  mergeDrafts(input);
  check("mergeDrafts does not change its input", JSON.stringify(input) === before);
}

// --- 8. draftToRecord strips review-only fields -------------------------------
{
  const { draft } = mergeDrafts(tag([arabicPaper, glucophagePaper, { ...empty(), emergency: { allergies: ["PENICILLIN"], critical: [] } }]));
  const record = draftToRecord(draft, { id: "MP-7K3Q-92XD", cardVersion: 1 });
  const json = JSON.stringify(record);
  check("record: v, id, cardVersion set", record.v === 2 && record.id === "MP-7K3Q-92XD" && record.cardVersion === 1);
  check("record: no sourcePaper anywhere", !json.includes("sourcePaper"));
  check("record: no raw anywhere", !json.includes('"raw"'));
  check("record: no ageWritten", !json.includes("ageWritten"));
  check("record: duplicate allergy listed once at save time", record.emergency.allergies.length === 1);
}

// --- 9. parsePaper cleans up the model's reply -------------------------------
{
  const reply =
    '```json\n{"patient":{"name":"A","dateOfBirth":"1962","ageWritten":64,"sex":"Female","bloodType":null},' +
    '"emergency":{"allergies":[],"critical":[]},"conditions":[],"meds":[],"referrals":[],"visits":[]}\n```';
  const p = parsePaper(reply);
  check("parse: age number becomes text", p.patient.ageWritten === "64");
  check("parse: year-only birth date dropped", p.patient.dateOfBirth === undefined);
  check("parse: invalid sex dropped", p.patient.sex === undefined);
  check("parse: null removed", !("bloodType" in p.patient));
}

// --- 10. MoPH matching with the real drugs.json -----------------------------
{
  const { matchMed } = createMatcher(JSON.parse(readFileSync("public/drugs.json", "utf8")) as DrugRow[]);
  const { draft } = mergeDrafts(tag([arabicPaper, amlorPaper, glucophagePaper]));
  const matched = applyMatches(draft, matchMed);
  const byName = (n: string) => matched.meds.find((m) => m.name === n)!;
  console.log(
    "      " + matched.meds.map((m) => `${m.name}:${m.status}${m.drugId ? "+id" : ""}${m.note ? "(not found)" : ""}`).join("  "),
  );
  check("match: Amlor 5 mg found, drugId + ingredient filled", Boolean(byName("Amlor").drugId) && /amlodipine/i.test(byName("Amlor").ingredient ?? ""));
  check("match: sure match keeps green", byName("Amlor").status === "green");
  check("match: unreadable meds untouched", matched.meds.filter((m) => m.status === "unreadable").length === 2);
  check("match: unreadable meds get no drugId", matched.meds.filter((m) => m.status === "unreadable").every((m) => !m.drugId));
  check("match: input draft not changed", draft.meds.every((m) => !m.drugId));

  const fake = applyMatches(tag([{ ...empty(), meds: [{ raw: "x", name: "Zzqxor", strength: "5 mg", frequency: "once daily", status: "green" }] }])[0], matchMed);
  check("match: unknown drug → yellow + note", fake.meds[0].status === "yellow" && fake.meds[0].note === NOT_IN_MOPH_LIST);
  check("match: note stripped at save", !JSON.stringify(draftToRecord(fake, { id: "MP-AAAA-BBBB", cardVersion: 1 })).includes("note"));
}

// --- 11. Wording of unsure ("low") matches -------------------------------------
{
  const { matchMed } = createMatcher(JSON.parse(readFileSync("public/drugs.json", "utf8")) as DrugRow[]);
  const aspirin = applyMatches(
    tag([{ ...empty(), meds: [{ raw: "Aspirin 81mg", name: "Aspirin", strength: "81 mg", frequency: "once daily", status: "green" }] }])[0],
    matchMed,
  ).meds[0];
  console.log(`      Aspirin 81 mg → ${aspirin.status}: "${aspirin.note}"`);
  check("low match: yellow", aspirin.status === "yellow");
  check("low match: names the closest MoPH product", /Closest MoPH product: ASPIRIN/.test(aspirin.note ?? ""));
  check("low match: says the strength differs", /Strength differs/.test(aspirin.note ?? ""));
  check("low match: no drugId set", !aspirin.drugId);

  const same = lowMatchNote({ name: "Coversyl", strength: "5 mg", status: "green", verified: "patient" }, { brand: "COVERSYL ARGININE", strength: "5mg" });
  check("low match, same strength: 'Not a sure match'", same === "Closest MoPH product: COVERSYL ARGININE 5mg. Not a sure match, please check.", same);
  const noStrength = lowMatchNote({ name: "Panadol", status: "green", verified: "patient" }, { brand: "PANADOL ADVANCE", strength: "500mg" });
  check("low match, no strength on paper: 'Not a sure match'", /Not a sure match/.test(noStrength), noStrength);
}

console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
