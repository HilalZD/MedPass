import { z } from "zod";
import type { MedPassRecord } from "./types";

// ---------------------------------------------------------------------------
// Zod schema that mirrors MedPassRecord in lib/types.ts.
// If you change lib/types.ts, the type check below the schema will fail
// until this schema is updated too.
// ---------------------------------------------------------------------------

const status = z.enum(["green", "yellow", "unreadable"]);
const verified = z.enum(["patient", "clinician"]);

const med = z.object({
  // `raw` is optional in MedPassRecord (it is stripped before encoding),
  // but the AI must ALWAYS give it so the patient can compare with the paper.
  raw: z.string(),
  name: z.string(),
  ingredient: z.string().optional(),
  strength: z.string().optional(),
  frequency: z.string().optional(),
  drugId: z.string().optional(),
  status,
  verified,
});

export const recordSchema = z.object({
  v: z.literal(1),
  patient: z.object({
    name: z.string(),
    birthYear: z.number().int().optional(),
    bloodType: z.string().optional(),
  }),
  emergency: z.object({
    allergies: z.array(z.string()),
    critical: z.array(z.string()),
  }),
  conditions: z.array(z.object({ name: z.string(), verified })),
  meds: z.array(med),
  referrals: z.array(
    z.object({
      to: z.string(),
      reason: z.string().optional(),
      status: z.enum(["open", "done"]),
    }),
  ),
  visits: z.array(z.object({ date: z.string(), place: z.string(), note: z.string() })),
  updated: z.string(),
});

export type ExtractedRecord = z.infer<typeof recordSchema>;

// Compile-time check: anything the schema accepts is a valid MedPassRecord.
// If this line shows a red error, the schema and lib/types.ts disagree.
const _schemaMatchesType: (r: ExtractedRecord) => MedPassRecord = (r) => r;
void _schemaMatchesType;

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
export function parseRecord(text: string): ExtractedRecord {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in reply");
  const json = JSON.parse(text.slice(start, end + 1));
  return recordSchema.parse(dropNulls(json));
}

// ---------------------------------------------------------------------------
// System prompt for the vision model.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You transcribe photographed medical papers (prescriptions, discharge notes, lab or clinic letters) into a structured health record for MedPass, a patient-held health card for displaced people in Lebanon. A patient will check every item you produce against the original paper, and a clinician may later rely on it, so a wrong dose is dangerous and a missing one is safe.

TRANSCRIBE ONLY
- Write down only what is written on the paper. Never infer, suggest, complete or correct a dose, a diagnosis or a drug.
- Never guess a drug name from a partial or smudged word. If you cannot read the drug name with confidence, it is unreadable.
- If a field is not on the paper, leave it out of the JSON. Do not use null.

MEDICATIONS (meds)
- One entry per medication line. "raw" is REQUIRED: the exact text of that line as written, in its original language and spelling, including the doctor's shorthand.
- "name": the drug name as written (brand or generic). "ingredient": only if the paper itself states the active ingredient. "strength": e.g. "850 mg", "18 units".
- "frequency": you may expand standard doctor shorthand into plain English, e.g. "1x2" or "bid" -> "twice daily", "1x3" or "tid" -> "three times daily", "od" -> "once daily", "hs" -> "at bedtime", "prn" -> "when needed". Write "IU" as "units". "raw" stays exactly as written.
- "status":
  - "unreadable" if the drug name cannot be read. Then set "name" to "Unreadable" and still fill "raw" with whatever characters you can see.
  - "yellow" if the name is readable but the strength or frequency is missing, partly readable or uncertain.
  - "green" only if name, strength and frequency are all clearly readable.
- Leave "drugId" out; the app fills it in later.

EMERGENCY INFO
- Every allergy mentioned goes in emergency.allergies (e.g. "Penicillin").
- Conditions that are life-critical in an emergency also go in emergency.critical, in addition to conditions: insulin-dependent diabetes, epilepsy, use of an anticoagulant (blood thinner), severe heart conditions. Only add them if the paper shows them, either stated directly or through an insulin, anti-epileptic or anticoagulant prescription.

OTHER FIELDS
- conditions: diagnoses written on the paper.
- referrals: referrals written on the paper, status "open" unless the paper says it was done.
- visits: only if the paper records a dated visit or admission: date (YYYY-MM-DD if readable), place, short note.
- patient.name: as written on the paper, or "" if it is not there. birthYear and bloodType only if written.

LANGUAGE
- Papers may be in Arabic, English or French. Write every field value in English, except "raw", which stays in the original language and script.

SEVERAL PAPERS
- When you get more than one image, merge them into ONE record. List each medication once.
- If two papers disagree about the same drug (different strength or frequency), keep both entries and mark both "yellow".

FIXED VALUES
- "v" is 1. Every "verified" field is "patient". "updated" is the date given in the user message.

OUTPUT
Reply with ONLY one JSON object, no other text, in exactly this shape:
{
  "v": 1,
  "patient": { "name": "", "birthYear": 1962, "bloodType": "A+" },
  "emergency": { "allergies": [], "critical": [] },
  "conditions": [ { "name": "", "verified": "patient" } ],
  "meds": [ { "raw": "", "name": "", "ingredient": "", "strength": "", "frequency": "", "status": "green", "verified": "patient" } ],
  "referrals": [ { "to": "", "reason": "", "status": "open" } ],
  "visits": [ { "date": "", "place": "", "note": "" } ],
  "updated": "YYYY-MM-DD"
}
Arrays may be empty. Optional fields (birthYear, bloodType, ingredient, strength, frequency, reason) are left out when they are not on the paper.`;
