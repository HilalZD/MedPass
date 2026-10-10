/**
 * Tests for lib/read.ts ("Read my prescription"). Run from the repo root:
 *   npx tsx lib/read.test.ts
 */

import { explain, plainEnglish, scheduleFrom, toLines, type ReadPaper } from "./read";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

// --- Schedule: only WRITTEN times fill slots --------------------------------
const s = (f: string) => JSON.stringify(scheduleFrom(f));
check("every morning → morning", s("1 tablet every morning") === '{"slots":["morning"]}');
check("at bedtime → bedtime", s("at bedtime") === '{"slots":["bedtime"]}');
check("when needed → when needed", s("when needed") === '{"slots":["asNeeded"]}');
check("morning and evening → both", s("1 tablet in the morning and in the evening") === '{"slots":["morning","evening"]}');
check("twice daily → 2 a day, NO guessed slots", s("twice daily after meals") === '{"slots":[],"timesPerDay":2}', s("twice daily after meals"));
check("1 tablet daily → once a day", s("1 tablet daily") === '{"slots":[],"timesPerDay":1}', s("1 tablet daily"));
check("nothing written → nothing", s("") === '{"slots":[]}');

// --- Explanations: only what is written --------------------------------------
check("plain English wording only", plainEnglish("1 tablet twice daily after meals") === "1 tablet twice a day after meals");
const med = (o: object) => ({ raw: "x", name: "Glucophage", strength: "850 mg", status: "green" as const, ...o });
const ex = explain(med({ frequency: "1 tablet twice daily after meals" }), "en");
check("example sentence", ex === "Glucophage 850 mg: 1 tablet twice a day after meals.", ex);
check("Arabic uses the Arabic frequency", explain(med({ frequency: "twice daily", frequencyAr: "مرتين في اليوم" }), "ar") === "Glucophage 850 mg: مرتين في اليوم.");
check("unreadable line never names a drug", !explain(med({ status: "unreadable" }), "en").includes("Glucophage"));
check("unreadable line → pharmacist", /pharmacist/.test(explain(med({ status: "unreadable" }), "en")));
check("uncertain line says so", /unclear/.test(explain(med({ status: "yellow", frequency: "once daily" }), "en")));
check("no frequency → ask the pharmacist, no invented dose", explain(med({}), "en") === "Glucophage 850 mg. How often to take it is not written. Ask your pharmacist.");

// --- Lines: purpose only if written, no badge without a sure match ----------
const paper: ReadPaper = {
  patient: { name: "" },
  emergency: { allergies: [], critical: [] },
  conditions: [],
  referrals: [],
  visits: [],
  meds: [
    { raw: "a", name: "Glucophage", strength: "850 mg", frequency: "twice daily", status: "green" },
    { raw: "b", name: "Panadol", strength: "500 mg", frequency: "when needed", status: "green", purpose: "for pain", purposeAr: "للألم" },
    { raw: "L?t?r 20mg", name: "Unreadable", status: "unreadable" },
  ],
};
const lines = toLines(paper, "en", () => null, () => []);
check("no purpose unless written", lines[0].purpose === undefined);
check("purpose when written", lines[1].purpose === "for pain");
check("Arabic purpose", toLines(paper, "ar", () => null, () => [])[1].purpose === "للألم");
check("unreadable: no name, letters kept for the pharmacist", lines[2].name === undefined && lines[2].seen === "L?t?r 20mg");
check("no MoPH badge without a sure match", lines.every((l) => !l.registered));

console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
