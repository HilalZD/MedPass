"use client";

// Step 3: patient details, card photo, allergies and critical conditions.
// The AI's name and date of birth are only suggestions: they stay yellow until
// the clinician confirms them (or types over them) after checking the patient's ID.
// "Next" stays locked until name, date of birth (full or year), sex and blood
// type (or "Unknown") are given, and the photo question is answered.

import { Bi } from "@/components/Bi";
import type { ExtractedDraft } from "@/lib/extract";
import { BloodSelect, DobInput, FieldError, SexSelect, identityIssues } from "./identity";
import PhotoField, { photoDecided, type PhotoValue } from "./PhotoField";
import { NameList } from "./ReviewStep";
import { btn, input } from "./ui";

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// name/dob: the clinician checked the AI's value against the ID.
// blood: a blood type (or "Unknown") was explicitly chosen.
export type Confirmed = { name: boolean; dob: boolean; blood: boolean };

export default function DetailsStep({
  draft,
  setDraft,
  confirmed,
  setConfirmed,
  photo,
  setPhoto,
  onBack,
  onNext,
}: {
  draft: ExtractedDraft;
  setDraft: (d: ExtractedDraft) => void;
  confirmed: Confirmed;
  setConfirmed: (c: Confirmed) => void;
  photo: PhotoValue;
  setPhoto: (p: PhotoValue) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const p = draft.patient;
  const setPatient = (patch: Partial<ExtractedDraft["patient"]>) => setDraft({ ...draft, patient: { ...p, ...patch } });
  const bloodTypeOk = !p.bloodType || (BLOOD_TYPES as readonly string[]).includes(p.bloodType);
  // A valid blood type read from the paper counts as chosen; otherwise pick one or "Unknown".
  const bloodChosen = bloodTypeOk && (confirmed.blood || Boolean(p.bloodType));
  const issues = identityIssues(p, bloodChosen);
  const issue = (f: string) => issues.find((i) => i.field === f);
  const ready = issues.length === 0 && confirmed.name && confirmed.dob && photoDecided(photo);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">3. Patient details</h1>

      <CheckedField
        label={<Bi en="Full name" ar="الاسم الكامل" />}
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
        <FieldError issue={issue("name")} />
      </CheckedField>

      <label className="flex flex-col gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg font-medium">
        <Bi en="Arabic name (optional)" ar="الاسم بالعربية (اختياري)" />
        <input
          className={input}
          dir="rtl"
          lang="ar"
          placeholder="كما هو مكتوب على هوية المريض"
          value={p.nameAr ?? ""}
          onChange={(e) => setPatient({ nameAr: e.target.value || undefined })}
        />
        <span lang="en" dir="ltr" className="text-base font-normal text-gray-600">
          Type it as written on the patient&apos;s ID. It is printed on the card.
        </span>
      </label>

      <CheckedField
        label={<Bi en="Date of birth" ar="تاريخ الولادة" />}
        confirmed={confirmed.dob || !p.dateOfBirth}
        onConfirm={() => setConfirmed({ ...confirmed, dob: true })}
        showConfirm={Boolean(p.dateOfBirth)}
      >
        <DobInput
          value={p.dateOfBirth}
          onChange={(v) => {
            setPatient({ dateOfBirth: v });
            setConfirmed({ ...confirmed, dob: true });
          }}
        />
        {p.ageWritten && (
          <p className="text-base text-gray-700">
            The paper says age {p.ageWritten}. Ask the patient. If they only know the year, use &quot;Year only&quot;.
          </p>
        )}
        <FieldError issue={issue("dob")} />
      </CheckedField>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-lg font-medium">
          <Bi en="Sex" ar="الجنس" className="font-medium" />
          <SexSelect value={p.sex} onChange={(sex) => setPatient({ sex })} />
          <FieldError issue={issue("sex")} />
        </div>
        <div className="flex flex-col gap-2 text-lg font-medium">
          <Bi en="Blood type" ar="فئة الدم" className="font-medium" />
          <BloodSelect
            value={bloodTypeOk ? p.bloodType : undefined}
            chosen={bloodChosen}
            onChange={(bloodType) => {
              setPatient({ bloodType });
              setConfirmed({ ...confirmed, blood: true });
            }}
          />
          {!bloodTypeOk && <span className="text-base text-yellow-900">The paper says &quot;{p.bloodType}&quot;. Pick the right one.</span>}
          <FieldError issue={issue("blood")} />
        </div>
      </div>

      <PhotoField value={photo} onChange={setPhoto} />

      <div className="flex flex-col gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-3">
        <Bi as="p" en="Printed on the card, readable without a PIN:" ar="مطبوع على البطاقة، ويمكن قراءته بدون رمز سري:" className="text-lg font-semibold" />
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
  label: React.ReactNode;
  confirmed: boolean;
  showConfirm: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${confirmed ? "border-green-600 bg-green-50" : "border-yellow-500 bg-yellow-50"}`}>
      <div className="text-lg font-medium">{label}</div>
      {children}
      {!confirmed && (
        <div className="flex flex-wrap items-center gap-3">
          <Bi en="Check spelling against the patient's ID" ar="تحقّق من الإملاء مقابل هوية المريض" className="text-base font-semibold text-yellow-900" />
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
