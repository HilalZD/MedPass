"use client";

// Identity rules shared by "create patient" (details step) and "edit patient":
//   - name filled
//   - date of birth: a full date "YYYY-MM-DD" or the year only "YYYY"
//   - sex chosen
//   - blood type chosen, where "Unknown" is a real, explicit answer
//     (stored as no bloodType, printed as "Unknown / غير معروف")
// lib/types.ts is unchanged: dateOfBirth is a string, bloodType is optional.

import { Bi } from "@/components/Bi";
import { BLOOD_TYPES } from "./DetailsStep";
import { input } from "./ui";

const thisYear = () => new Date().getFullYear();
const today = () => new Date().toISOString().slice(0, 10);

// "1962" or "1962-04-18", not in the future, not before 1900.
export function isValidDob(s: string | undefined): boolean {
  if (!s) return false;
  if (/^\d{4}$/.test(s)) return Number(s) >= 1900 && Number(s) <= thisYear();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "1900-01-01" && s <= today();
}

export type IdentityIssue = { field: "name" | "dob" | "sex" | "blood"; en: string; ar: string };

export function identityIssues(p: { name: string; dateOfBirth?: string; sex?: string }, bloodChosen: boolean): IdentityIssue[] {
  const out: IdentityIssue[] = [];
  if (!p.name.trim()) out.push({ field: "name", en: "Enter the patient's name.", ar: "أدخل اسم المريض." });
  if (!isValidDob(p.dateOfBirth))
    out.push({ field: "dob", en: "Enter the date of birth, or at least the year.", ar: "أدخل تاريخ الولادة، أو السنة على الأقل." });
  if (p.sex !== "F" && p.sex !== "M") out.push({ field: "sex", en: "Choose the sex.", ar: "اختر الجنس." });
  if (!bloodChosen)
    out.push({ field: "blood", en: "Choose the blood type, or \"Unknown\".", ar: "اختر فئة الدم، أو \"غير معروف\"." });
  return out;
}

export function FieldError({ issue }: { issue?: IdentityIssue }) {
  if (!issue) return null;
  return (
    <Bi as="p" en={issue.en} ar={issue.ar} className="text-base font-semibold text-red-800" />
  );
}

// Date of birth: full date, or year only when the patient doesn't know the day.
export function DobInput({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const yearOnly = /^\d{4}$/.test(value ?? "") || value === "";
  const mode: "full" | "year" = value === undefined ? "full" : yearOnly ? "year" : "full";
  const tab = (m: "full" | "year", en: string, ar: string) => (
    <button
      type="button"
      onClick={() => onChange(m === "year" ? (value?.slice(0, 4) ?? "") : value && value.length === 10 ? value : undefined)}
      aria-pressed={mode === m}
      className={`min-h-12 flex-1 rounded-xl border-2 px-2 py-1 text-base font-semibold ${mode === m ? "border-brand bg-brand-50 text-brand-dark" : "border-line bg-white"}`}
    >
      <Bi center en={en} ar={ar} />
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {tab("full", "Full date", "التاريخ الكامل")}
        {tab("year", "Year only", "السنة فقط")}
      </div>
      {mode === "full" ? (
        <input className={input} type="date" min="1900-01-01" max={today()} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />
      ) : (
        <input
          className={`${input} font-mono`}
          inputMode="numeric"
          placeholder="YYYY"
          maxLength={4}
          dir="ltr"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      )}
    </div>
  );
}

// A big tap button for one choice, English and Arabic on two lines.
function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center rounded-xl border-2 px-2 py-1 text-lg font-semibold ${
        selected ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}

export function SexSelect({ value, onChange, labelId }: { value: string | undefined; onChange: (v: "F" | "M") => void; labelId?: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
      <Choice selected={value === "F"} onClick={() => onChange("F")}>
        <Bi center en="Female" ar="أنثى" />
      </Choice>
      <Choice selected={value === "M"} onClick={() => onChange("M")}>
        <Bi center en="Male" ar="ذكر" />
      </Choice>
    </div>
  );
}

// "" = not chosen yet; "unknown" = explicitly Unknown (stored as no bloodType).
export function BloodSelect({
  value,
  chosen,
  onChange,
  labelId,
}: {
  value: string | undefined;
  chosen: boolean;
  onChange: (bloodType: string | undefined) => void;
  labelId?: string;
}) {
  const valid = value && (BLOOD_TYPES as readonly string[]).includes(value);
  const selected = valid ? value : chosen && !value ? "unknown" : "";
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-4 gap-2">
      {BLOOD_TYPES.map((b) => (
        <Choice key={b} selected={selected === b} onClick={() => onChange(b)}>
          <span dir="ltr">{b}</span>
        </Choice>
      ))}
      <div className="col-span-4 grid">
        <Choice selected={selected === "unknown"} onClick={() => onChange(undefined)}>
          <Bi center en="Unknown" ar="غير معروف" />
        </Choice>
      </div>
    </div>
  );
}
