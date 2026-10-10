import { z } from "zod";
import type { MedMatch } from "./match";
import type { Med, MedPassRecord } from "./types";

// ---------------------------------------------------------------------------
// Types
//
// The AI reads ONE paper per call. Each paper becomes an ExtractedDraft where
// every med / condition / allergy / critical condition / referral remembers
// which paper it came from (sourcePaper, 1-based), so the review screen can
// say "from paper 2". mergeDrafts() then combines the papers in plain code.
//
// v, id and cardVersion are NOT here: the portal sets them when the patient
// is saved. draftToRecord() turns a reviewed draft into a MedPassRecord and
// strips everything that must not be saved (sourcePaper, raw, ageWritten).
// ---------------------------------------------------------------------------

type Sourced = { sourcePaper: number }; // 1-based paper number; 0 = added by hand during review

// note: a message for the review screen only (e.g. "Not found in the MoPH list").
export type DraftMed = Med & Sourced & { note?: string };
export type DraftItem = { name: string } & Sourced; // an allergy or a critical condition
export type DraftCondition = MedPassRecord["conditions"][number] & Sourced;
export type DraftReferral = MedPassRecord["referrals"][number] & Sourced;

export type ExtractedDraft = {
  // ageWritten: an age exactly as written on the paper ("64"). Never turned into a birth date.
  patient: MedPassRecord["patient"] & { ageWritten?: string };
  emergency: { allergies: DraftItem[]; critical: DraftItem[] };
  conditions: DraftCondition[];
  meds: DraftMed[];
  referrals: DraftReferral[];
  visits: MedPassRecord["visits"];
  updated: string;
};

// ---------------------------------------------------------------------------
// Zod schema for what the model returns for ONE paper (no sourcePaper yet,
// allergies as plain strings). tagPaper() turns it into an ExtractedDraft.
// ---------------------------------------------------------------------------

const status = z.enum(["green", "yellow", "unreadable"]);

const med = z.object({
  // `raw` is optional in MedPassRecord (it is stripped before saving),
  // but the AI must ALWAYS give it so the patient can compare with the paper.
  raw: z.string(),
  name: z.string(),
  ingredient: z.string().optional(),
  strength: z.string().optional(),
  frequency: z.string().optional(),
  status,
});

export const paperSchema = z.object({
  patient: z.object({
    name: z.string(),
    // Only a full date ("1962-04-18"). Anything else (e.g. just "1962") is
    // dropped instead of failing the whole reply; the patient can add it in review.
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
    sex: z.enum(["F", "M"]).optional().catch(undefined),
    bloodType: z.string().optional(),
    // The model may write 64 or "64"; keep it as text.
    ageWritten: z.union([z.string(), z.number()]).transform(String).optional(),
  }),
  emergency: z.object({
    allergies: z.array(z.string()),
    critical: z.array(z.string()),
  }),
  conditions: z.array(z.object({ name: z.string() })),
  meds: z.array(med),
  referrals: z.array(
    z.object({
      to: z.string(),
      reason: z.string().optional(),
      status: z.enum(["open", "done"]),
    }),
  ),
  visits: z.array(z.object({ date: z.string(), place: z.string(), note: z.string() })),
});

export type ExtractedPaper = z.infer<typeof paperSchema>;

// The model sometimes writes `null` for a missing field. Our type uses
// "field is absent" instead, so remove nulls before validating.
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null) out[k] = dropNulls(v);
    }
    return out;
  }
  return value;
}

// Pull the JSON object out of the model's reply (it may add ```json fences)
// and validate it. Throws if the JSON is broken or has the wrong shape.
export function parsePaper(text: string): ExtractedPaper {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in reply");
  const json = JSON.parse(text.slice(start, end + 1));
  return paperSchema.parse(dropNulls(json));
}

// Paper number n (1-based) → ExtractedDraft. Everything is "verified: patient"
// because nothing from the AI is clinician-verified.
export function tagPaper(paper: ExtractedPaper, n: number, updated: string): ExtractedDraft {
  return {
    patient: { ...paper.patient },
    emergency: {
      allergies: paper.emergency.allergies.map((name) => ({ name, sourcePaper: n })),
      critical: paper.emergency.critical.map((name) => ({ name, sourcePaper: n })),
    },
    conditions: paper.conditions.map((c) => ({ name: c.name, verified: "patient", sourcePaper: n })),
    meds: paper.meds.map((m) => ({ ...m, verified: "patient", sourcePaper: n })),
    referrals: paper.referrals.map((r) => ({ ...r, sourcePaper: n })),
    visits: paper.visits.map((v) => ({ ...v })),
    updated,
  };
}

// ---------------------------------------------------------------------------
// Merging several papers (pure function, tested in lib/extract.test.ts)
// ---------------------------------------------------------------------------

// Case-insensitive, extra spaces ignored. "Glucophage  850 MG" == "glucophage 850 mg".
const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const medKey = (m: Med) => `${norm(m.name)}|${norm(m.strength)}|${norm(m.frequency)}`;

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Rules:
// - Everything from every paper is kept (union).
// - Meds: an EXACT duplicate (same name + strength + frequency, case-insensitive)
//   is listed once. Same drug name with a different strength or frequency:
//   both are kept and both become "yellow" so a human must decide.
//   Unreadable meds are never merged (two unreadable lines are not the same drug).
// - Allergies are NEVER dropped, not even exact duplicates. (draftToRecord
//   removes exact duplicates only at save time, after a human has reviewed them.)
// - Conditions, critical conditions, referrals, visits: exact duplicates listed once.
// - Patient details: the first paper that has a value wins; if papers disagree
//   (e.g. two different names), a warning is returned for the review screen.
//
// `papers` has one slot per uploaded paper, in order (slot 0 = paper 1).
// A paper that could not be read is null, so paper numbers stay correct.
export function mergeDrafts(papers: (ExtractedDraft | null)[]): { draft: ExtractedDraft; warnings: string[] } {
  const numbered = papers.flatMap((d, i) => (d ? [{ d: structuredClone(d), paper: i + 1 }] : []));
  const all = numbered.map((x) => x.d); // copies: never change the caller's objects
  const warnings: string[] = [];

  // Meds
  const meds: DraftMed[] = [];
  const conflicted = new Set<string>();
  for (const m of all.flatMap((d) => d.meds)) {
    if (m.status !== "unreadable") {
      const readable = meds.filter((o) => o.status !== "unreadable");
      const duplicate = readable.find((o) => medKey(o) === medKey(m));
      if (duplicate) {
        // Keep the more careful status of the two.
        if (m.status === "yellow" && duplicate.status === "green") duplicate.status = "yellow";
        continue;
      }
      const sameName = readable.filter((o) => norm(o.name) === norm(m.name));
      if (sameName.length > 0) {
        for (const o of [...sameName, m]) if (o.status === "green") o.status = "yellow";
        if (!conflicted.has(norm(m.name))) {
          conflicted.add(norm(m.name));
          warnings.push(`The papers disagree about ${m.name}. Check the strength and how often it is taken.`);
        }
      }
    }
    meds.push(m);
  }

  // Patient details
  const patient: ExtractedDraft["patient"] = { name: "" };
  const fields = [
    ["name", "name"],
    ["dateOfBirth", "date of birth"],
    ["sex", "sex"],
    ["bloodType", "blood type"],
    ["ageWritten", "age"],
  ] as const;
  for (const [field, label] of fields) {
    const values = numbered
      .map(({ d, paper }) => ({ value: d.patient[field], paper }))
      .filter((x): x is { value: string; paper: number } => Boolean(x.value?.trim()));
    if (values.length === 0) continue;
    (patient as Record<string, string>)[field] = values[0].value;
    const distinct = uniqueBy(values, (x) => norm(x.value));
    if (distinct.length > 1) {
      const list = distinct.map((x) => `"${x.value}" (paper ${x.paper})`).join(", ");
      warnings.push(`The papers show different ${label}s: ${list}. Check with the patient.`);
    }
  }

  return {
    draft: {
      patient,
      emergency: {
        allergies: all.flatMap((d) => d.emergency.allergies),
        critical: uniqueBy(all.flatMap((d) => d.emergency.critical), (c) => norm(c.name)),
      },
      conditions: uniqueBy(all.flatMap((d) => d.conditions), (c) => norm(c.name)),
      meds,
      referrals: uniqueBy(all.flatMap((d) => d.referrals), (r) => `${norm(r.to)}|${norm(r.reason)}`),
      visits: uniqueBy(all.flatMap((d) => d.visits), (v) => `${v.date}|${norm(v.place)}|${norm(v.note)}`),
      updated: all[0]?.updated ?? new Date().toISOString().slice(0, 10),
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Zod schema for a REVIEWED draft coming back from the browser on save.
// Limits keep a broken or hostile request from storing huge data.
// ---------------------------------------------------------------------------

const text = (max = 300) => z.string().trim().max(max);
const sourcePaper = z.number().int().min(0).max(3); // 0 = added by hand during review
const verified = z.enum(["patient", "clinician"]);

export const reviewedDraftSchema = z.object({
  patient: z.object({
    name: text(120).min(1),
    nameAr: text(120).optional(),
    // Required when saving: a full date or the year only.
    dateOfBirth: z.string().regex(/^\d{4}(-\d{2}-\d{2})?$/),
    sex: z.enum(["F", "M"]),
    bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional(),
    ageWritten: text(20).optional(),
  }),
  emergency: z.object({
    allergies: z.array(z.object({ name: text(120).min(1), sourcePaper })).max(30),
    critical: z.array(z.object({ name: text(120).min(1), sourcePaper })).max(30),
  }),
  conditions: z.array(z.object({ name: text(120).min(1), verified, sourcePaper })).max(50),
  meds: z
    .array(
      z.object({
        raw: text(500).optional(),
        name: text(120).min(1),
        ingredient: text(200).optional(),
        strength: text(60).optional(),
        frequency: text(120).optional(),
        drugId: text(60).optional(),
        status,
        verified,
        sourcePaper,
        note: text(200).optional(),
      }),
    )
    .max(50),
  referrals: z
    .array(z.object({ to: text(120).min(1), reason: text(300).optional(), status: z.enum(["open", "done"]), sourcePaper }))
    .max(30),
  visits: z.array(z.object({ date: text(10), place: text(120), note: text(300) })).max(50),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Compile-time check: a reviewed draft is a valid ExtractedDraft.
const _reviewedMatchesType: (d: z.infer<typeof reviewedDraftSchema>) => ExtractedDraft = (d) => d;
void _reviewedMatchesType;

// Save is only allowed once a human resolved every yellow / unreadable med.
export const unresolvedMeds = (draft: ExtractedDraft) => draft.meds.filter((m) => m.status !== "green").length;

// ---------------------------------------------------------------------------
// Matching against the MoPH list (public/drugs.json)
// ---------------------------------------------------------------------------

export const NOT_IN_MOPH_LIST = "Not found in the MoPH list, please check";

// For every readable med: a sure ("high") match fills drugId and the MoPH
// ingredient; no match or an unsure ("low") one turns the med yellow so a human
// checks it. Unreadable meds are left alone: the review screen offers
// "Did you mean...?" and a human picks. Returns a new draft (pure).
export function applyMatches(draft: ExtractedDraft, matchMed: (med: Med) => MedMatch | null): ExtractedDraft {
  return {
    ...draft,
    meds: draft.meds.map((med) => {
      if (med.status === "unreadable") return { ...med };
      const m = matchMed(med);
      if (!m || m.confidence === "low") return { ...med, status: "yellow", note: NOT_IN_MOPH_LIST };
      return { ...med, drugId: m.drug.id, ingredient: m.drug.ingredient };
    }),
  };
}

// ---------------------------------------------------------------------------
// Reviewed draft → MedPassRecord, ready to save. Strips sourcePaper, raw and
// ageWritten. Exact duplicate allergies (case-insensitive) are listed once here.
// ---------------------------------------------------------------------------

export function draftToRecord(
  draft: ExtractedDraft,
  ids: { id: string; cardVersion: number },
): MedPassRecord {
  const { ageWritten: _age, ...patient } = draft.patient;
  void _age;
  return {
    v: 2,
    id: ids.id,
    cardVersion: ids.cardVersion,
    patient,
    emergency: {
      allergies: uniqueBy(draft.emergency.allergies, (a) => norm(a.name)).map((a) => a.name),
      critical: draft.emergency.critical.map((c) => c.name),
    },
    conditions: draft.conditions.map(({ name, verified }) => ({ name, verified })),
    meds: draft.meds.map(({ sourcePaper: _s, raw: _r, note: _n, ...m }) => {
      void _s;
      void _r;
      void _n;
      return m;
    }),
    referrals: draft.referrals.map(({ sourcePaper: _s, ...r }) => {
      void _s;
      return r;
    }),
    visits: draft.visits.map((v) => ({ ...v })),
    updated: draft.updated,
  };
}

// ---------------------------------------------------------------------------
// System prompt for the vision model. One call = one paper.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You transcribe ONE photographed medical paper (a prescription, discharge note, lab or clinic letter) into structured JSON for MedPass, a medical ID card for Lebanon. A clinician and the patient will check every item you produce against the original paper, so a wrong item is dangerous and a missing one is safe.

TRANSCRIBE ONLY
- Write down only what is written on the paper. Never infer, suggest, complete or correct a dose, a diagnosis, an allergy or a drug.
- If a field is not on the paper, leave it out of the JSON. Do not use null.

MEDICATIONS (meds)
- Only lines that name a medicine go in meds. A line telling the patient to see a doctor or specialist, or to have a test, is a referral, not a medicine.
- NEVER skip a medicine line. If a line looks like a medicine but you cannot read it, still add it as "unreadable".
- One entry per medication line. "raw" is REQUIRED: the exact text of that line as written, in its original language and spelling, including the doctor's shorthand.
- "name": the drug name copied letter by letter as written (brand or generic). NEVER replace it with a different, similar-looking drug name you know, even if the written word is not a drug you recognise.
- "ingredient": only if the paper itself states the active ingredient. "strength": e.g. "850 mg", "18 units".
- "frequency": you may expand standard doctor shorthand into plain English, e.g. "1x2" or "bid" -> "twice daily", "1x3" or "tid" -> "three times daily", "1x1" or "od" -> "once daily", "hs" -> "at bedtime", "prn" -> "when needed". Write "IU" as "units". "raw" stays exactly as written.
- "status":
  - "unreadable" only if letters of the drug name are genuinely illegible (smudged, cut off, scribbled). If you can clearly read the word, copy it as written and do NOT mark it unreadable, even if you do not recognise it as a drug. Then set "name" to "Unreadable", put every character you CAN see in "raw" (e.g. "Ca?dor 10mg"), and still fill "strength" and "frequency" if those are clearly readable. A human will identify the drug; you never pick one.
  - "yellow" if the name is readable but the strength or frequency is missing, partly readable or uncertain.
  - "green" only if name, strength and frequency are all clearly readable.

ALLERGIES, CONDITIONS, CRITICAL CONDITIONS
- These come ONLY from words actually written on the paper. NEVER derive them from a medicine: insulin (e.g. Lantus) does NOT mean "insulin-dependent diabetes", an anticoagulant does NOT mean a heart condition, an antiepileptic does NOT mean epilepsy. The clinician adds those during review.
- emergency.allergies: every allergy written on the paper (e.g. "Penicillin").
- conditions: every diagnosis written on the paper.
- emergency.critical: only conditions written on the paper that are life-critical in an emergency (e.g. the paper says "insulin-dependent diabetes", "epilepsy", "on anticoagulants"). They also stay in conditions.

PATIENT
- name: as written, or "" if it is not there.
- dateOfBirth: only if a full date of birth is written, as YYYY-MM-DD.
- ageWritten: if an age is written (e.g. "Age 64"), copy the number as text, e.g. "64". NEVER calculate a birth date from an age.
- sex: "F" or "M", only if written. Never guess it from the name.
- bloodType: only if written.

OTHER FIELDS
- referrals: referrals or follow-up appointments written on the paper (e.g. "see an eye doctor for a regular check-up" -> to "Ophthalmology", reason "Regular check-up"), status "open" unless the paper says it was done.
- visits: only if the paper records a dated visit or admission: date (YYYY-MM-DD), place, short note.

LANGUAGE
- Papers may be in Arabic, English or French. Write every field value in English, except "raw", which stays in the original language and script.

OUTPUT
Reply with ONLY one JSON object, no other text, in exactly this shape:
{
  "patient": { "name": "", "dateOfBirth": "1962-04-18", "ageWritten": "64", "sex": "F", "bloodType": "A+" },
  "emergency": { "allergies": [], "critical": [] },
  "conditions": [ { "name": "" } ],
  "meds": [ { "raw": "", "name": "", "ingredient": "", "strength": "", "frequency": "", "status": "green" } ],
  "referrals": [ { "to": "", "reason": "", "status": "open" } ],
  "visits": [ { "date": "", "place": "", "note": "" } ]
}
Arrays may be empty. Optional fields (dateOfBirth, ageWritten, sex, bloodType, ingredient, strength, frequency, reason) are left out when they are not on the paper.`;
