"use client";

// Step 3: patient details, allergies and critical conditions.
// The AI's name and date of birth are only suggestions: they stay yellow until
// the clinician confirms them (or types over them) after checking the patient's ID.

import type { ExtractedDraft } from "@/lib/extract";
import { NameList } from "./ReviewStep";
import { btn, input } from "./ui";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export type Confirmed = { name: boolean; dob: boolean };

export default function DetailsStep({
  draft,
  setDraft,
  confirmed,
  setConfirmed,
  onBack,
  onNext,
}: {
  draft: ExtractedDraft;
  setDraft: (d: ExtractedDraft) => void;
  confirmed: Confirmed;
  setConfirmed: (c: Confirmed) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const p = draft.patient;
  const setPatient = (patch: Partial<ExtractedDraft["patient"]>) => setDraft({ ...draft, patient: { ...p, ...patch } });
  const bloodTypeOk = !p.bloodType || (BLOOD_TYPES as readonly string[]).includes(p.bloodType);
  // An empty date of birth needs no confirmation (it is optional).
  const ready = p.name.trim() !== "" && confirmed.name && (!p.dateOfBirth || confirmed.dob) && bloodTypeOk;

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">3. Patient details</h1>

      <CheckedField
        label="Full name"
        confirmed={confirmed.name}
        onConfirm={() => setConfirmed({ ...confirmed, name: true })}
        showConfirm={p.name.trim() !== ""}
      >
        <input
          className={input}
          dir="auto"
          value={p.name}
          onChange={(e) => {
            setPatient({ name: e.target.value });
            setConfirmed({ ...confirmed, name: true }); // typing it = the clinician checked it
          }}
        />
      </CheckedField>

      <CheckedField
        label="Date of birth (optional)"
        confirmed={confirmed.dob || !p.dateOfBirth}
        onConfirm={() => setConfirmed({ ...confirmed, dob: true })}
        showConfirm={Boolean(p.dateOfBirth)}
      >
        <input
          className={input}
          type="date"
          value={p.dateOfBirth ?? ""}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => {
            setPatient({ dateOfBirth: e.target.value || undefined });
            setConfirmed({ ...confirmed, dob: true });
          }}
        />
        {p.ageWritten && <p className="text-base text-gray-700">The paper says age {p.ageWritten}. Ask the patient for the full date.</p>}
      </CheckedField>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-lg font-medium">
          Sex
          <select className={input} value={p.sex ?? ""} onChange={(e) => setPatient({ sex: (e.target.value || undefined) as "F" | "M" | undefined })}>
            <option value="">Not given</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-lg font-medium">
          Blood type
          <select className={input} value={bloodTypeOk ? (p.bloodType ?? "") : ""} onChange={(e) => setPatient({ bloodType: e.target.value || undefined })}>
            <option value="">Unknown</option>
            {BLOOD_TYPES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          {!bloodTypeOk && <span className="text-base text-yellow-900">The paper says &quot;{p.bloodType}&quot;. Pick the right one.</span>}
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-3">
        <p className="text-lg font-semibold">Printed on the card, readable without a PIN:</p>
        <NameList
          title="Allergies"
          items={draft.emergency.allergies}
          onChange={(allergies) => setDraft({ ...draft, emergency: { ...draft.emergency, allergies } })}
          make={(name) => ({ name, sourcePaper: 0 })}
        />
        <NameList
          title="Critical conditions"
          items={draft.emergency.critical}
          onChange={(critical) => setDraft({ ...draft, emergency: { ...draft.emergency, critical } })}
          make={(name) => ({ name, sourcePaper: 0 })}
        />
        <p className="text-base text-gray-700">
          Critical = what a paramedic must know: e.g. insulin-dependent diabetes, epilepsy, on blood thinners. Add them here
          after asking the patient; the AI never adds them from a medicine.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className={btn.secondary} onClick={onBack}>
          Back
        </button>
        <button className={`${btn.primary} col-span-2`} disabled={!ready} onClick={onNext}>
          Next: choose PIN
        </button>
      </div>
    </section>
  );
}

// A field that is yellow until the clinician confirms it against the patient's ID.
function CheckedField({
  label,
  confirmed,
  showConfirm,
  onConfirm,
  children,
}: {
  label: string;
  confirmed: boolean;
  showConfirm: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${confirmed ? "border-green-600 bg-green-50" : "border-yellow-500 bg-yellow-50"}`}>
      <span className="text-lg font-medium">{label}</span>
      {children}
      {!confirmed && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-yellow-900">Check spelling against the patient&apos;s ID</span>
          {showConfirm && (
            <button className={btn.small} onClick={onConfirm}>
              ✓ Matches the ID
            </button>
          )}
        </div>
      )}
    </div>
  );
}
