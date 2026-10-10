// "Read my prescription" (public /read page): turn ONE transcribed prescription
// into plain-language lines for the patient.
//
// Safety rules (everything here is plain code, so it can't improvise):
// - Explanations only repeat what is written: name, strength, how often.
//   No advice, no changed or suggested doses, no diagnosis.
// - "What it's for" only when the paper itself says so.
// - Unreadable or uncertain lines say so and send the patient to a pharmacist.
//   No guessed drug names and no "Did you mean" here.
// - The daily schedule only uses times that are WRITTEN ("in the morning",
//   "at bedtime"...). "Twice a day" without times is shown as "2 times a day,
//   times not written", never placed into slots by guessing.

import { z } from "zod";
import { SYSTEM_PROMPT, dropNulls, paperSchema } from "./extract";
import type { DrugRow, MedMatch } from "./match";

export type Lang = "en" | "ar";

// Same transcription rules as the portal, plus three fields for this page.
export const READ_PROMPT = `${SYSTEM_PROMPT}

EXTRA FIELDS FOR THE PATIENT'S "READ MY PRESCRIPTION" PAGE (for each medicine in "meds"):
- "purpose": ONLY if the paper itself writes what this medicine is for (e.g. "for pain", "للضغط"). In English. NEVER infer it from the drug name or from anything else. Otherwise leave it out.
- "purposeAr": the same purpose in simple Arabic, only when "purpose" is given.
- "frequencyAr": the "frequency" in simple Arabic, a direct translation with nothing added or removed (e.g. "twice daily after meals" -> "مرتين في اليوم بعد الأكل"). Leave it out when "frequency" is left out.
- Arabic doctor shorthand is shorthand too: "عند اللزوم" -> "when needed", "قبل النوم" -> "at bedtime", "صباحاً" -> "in the morning", "مساءً" -> "in the evening", "بعد الأكل" -> "after meals".`;

const readMed = paperSchema.shape.meds.element.extend({
  purpose: z.string().optional(),
  purposeAr: z.string().optional(),
  frequencyAr: z.string().optional(),
});
export const readPaperSchema = paperSchema.extend({ meds: z.array(readMed) });
export type ReadPaper = z.infer<typeof readPaperSchema>;
export type ReadMed = ReadPaper["meds"][number];

export function parseReadPaper(text: string): ReadPaper {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in reply");
  return readPaperSchema.parse(dropNulls(JSON.parse(text.slice(start, end + 1))));
}

// ---------------------------------------------------------------------------
// Daily schedule, only from WRITTEN times
// ---------------------------------------------------------------------------

export type Slot = "morning" | "noon" | "evening" | "bedtime" | "asNeeded";
export const SLOTS: Slot[] = ["morning", "noon", "evening", "bedtime", "asNeeded"];
export type Schedule = { slots: Slot[]; timesPerDay?: number };

export function scheduleFrom(frequency: string | undefined): Schedule {
  const f = (frequency ?? "").toLowerCase();
  const slots: Slot[] = [];
  if (/\bmorning\b|\bbreakfast\b/.test(f)) slots.push("morning");
  if (/\bnoon\b|\bmidday\b|\blunch\b/.test(f)) slots.push("noon");
  if (/\bevening\b|\bdinner\b|\bsupper\b|\bat night\b/.test(f)) slots.push("evening");
  if (/\bbedtime\b|\bbefore sleep\b|\bbefore bed\b/.test(f)) slots.push("bedtime");
  if (/\bwhen needed\b|\bas needed\b|\bif needed\b|\bprn\b|\bwhen required\b/.test(f)) slots.push("asNeeded");

  const words: Record<string, number> = { once: 1, twice: 2, "three times": 3, "four times": 4 };
  let timesPerDay: number | undefined;
  for (const [w, n] of Object.entries(words)) if (f.includes(w)) timesPerDay = n;
  const digits = f.match(/\b(\d)\s*times\b/);
  if (digits) timesPerDay = Number(digits[1]);
  // "1 tablet daily" / "every day" with no other count = once a day.
  if (timesPerDay === undefined && slots.length === 0 && /\bdaily\b|\bevery day\b|\ba day\b/.test(f)) timesPerDay = 1;
  return { slots, timesPerDay };
}

// ---------------------------------------------------------------------------
// Plain-language lines
// ---------------------------------------------------------------------------

export type ReadLine = {
  kind: "ok" | "partial" | "unreadable";
  name?: string; // never set for unreadable lines (no guessing)
  strength?: string;
  explanation: string; // in the chosen language
  purpose?: string; // in the chosen language, only if written on the paper
  seen?: string; // unreadable lines: the characters we could see, for the pharmacist
  schedule: Schedule;
  registered?: { drug: DrugRow; match: MedMatch; alternatives: DrugRow[] }; // sure MoPH match only
};

const T = {
  en: {
    unreadable: "We couldn't read this line clearly. Please show it to your pharmacist.",
    partial: "Part of this line was unclear. Please check it with your pharmacist.",
    noFrequency: "How often to take it is not written. Ask your pharmacist.",
  },
  ar: {
    unreadable: "لم نتمكن من قراءة هذا السطر بوضوح. يرجى عرضه على الصيدلي.",
    partial: "جزء من هذا السطر غير واضح. يرجى التأكد منه مع الصيدلي.",
    noFrequency: "عدد المرات غير مكتوب. اسأل الصيدلي.",
  },
} as const;

// Doctor-style English → everyday English. Only the wording changes, never the meaning.
export function plainEnglish(freq: string): string {
  return freq
    .replace(/\bonce daily\b/gi, "once a day")
    .replace(/\btwice daily\b/gi, "twice a day")
    .replace(/\bthree times daily\b/gi, "three times a day")
    .replace(/\bfour times daily\b/gi, "four times a day")
    .replace(/\b(\d) times daily\b/gi, "$1 times a day")
    .replace(/\bdaily\b/gi, "every day");
}

const sentence = (s: string) => {
  const t = s.trim().replace(/\.+$/, "");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : "";
};

// One medicine → one plain sentence, ONLY from what was transcribed.
export function explain(med: ReadMed, lang: Lang): string {
  if (med.status === "unreadable") return T[lang].unreadable;
  const name = [med.name, med.strength].filter(Boolean).join(" ");
  // Inside an Arabic sentence, isolate the (Latin) drug name so it doesn't flip
  // around the colon (U+2068 / U+2069 = the plain-text version of <bdi>).
  const head = lang === "ar" ? `\u2068${name}\u2069` : name;
  const freq = lang === "ar" ? (med.frequencyAr ?? med.frequency) : med.frequency;
  const body = freq ? `${head}: ${lang === "ar" ? `${freq.trim().replace(/\.+$/, "")}.` : sentence(plainEnglish(freq))}` : `${head}. ${T[lang].noFrequency}`;
  return med.status === "yellow" ? `${body} ${T[lang].partial}` : body;
}

export function toLines(
  paper: ReadPaper,
  lang: Lang,
  match: (med: ReadMed) => MedMatch | null,
  alternatives: (drug: DrugRow) => DrugRow[],
): ReadLine[] {
  return paper.meds.map((med) => {
    const kind = med.status === "green" ? "ok" : med.status === "yellow" ? "partial" : "unreadable";
    if (kind === "unreadable") {
      return { kind, explanation: explain(med, lang), seen: med.raw, schedule: { slots: [] } };
    }
    const m = match(med);
    return {
      kind,
      name: med.name,
      strength: med.strength,
      explanation: explain(med, lang),
      purpose: lang === "ar" ? (med.purposeAr ?? med.purpose) : med.purpose,
      schedule: scheduleFrom(med.frequency),
      registered: m && m.confidence === "high" ? { drug: m.drug, match: m, alternatives: alternatives(m.drug) } : undefined,
    };
  });
}
