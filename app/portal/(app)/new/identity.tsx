"use client";

// Identity rules shared by "create patient" (details step) and "edit patient":
//   - name filled
//   - date of birth: a full date "YYYY-MM-DD" or the year only "YYYY"
//   - sex chosen
//   - blood type chosen, where "Unknown" is a real, explicit answer
//     (stored as no bloodType, printed as "Unknown / غير معروف")
// lib/types.ts is unchanged: dateOfBirth is a string, bloodType is optional.

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
    <p className="text-base font-semibold text-red-800" role="alert">
      {issue.en} <span lang="ar" dir="rtl">{issue.ar}</span>
    </p>
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
      className={`min-h-11 flex-1 rounded-xl border-2 px-2 text-base font-semibold ${mode === m ? "border-brand bg-brand-50 text-brand-dark" : "border-line bg-white"}`}
    >
      {en} · <span lang="ar">{ar}</span>
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

export function SexSelect({ value, onChange }: { value: string | undefined; onChange: (v: "F" | "M") => void }) {
  return (
    <select className={input} value={value ?? ""} onChange={(e) => onChange(e.target.value as "F" | "M")}>
      <option value="" disabled>
        Choose… · اختر
      </option>
      <option value="F">Female · أنثى</option>
      <option value="M">Male · ذكر</option>
    </select>
  );
}

// "" = not chosen yet; "unknown" = explicitly Unknown (stored as no bloodType).
export function BloodSelect({
  value,
  chosen,
  onChange,
}: {
  value: string | undefined;
  chosen: boolean;
  onChange: (bloodType: string | undefined) => void;
}) {
  const valid = value && (BLOOD_TYPES as readonly string[]).includes(value);
  const selected = valid ? value : chosen && !value ? "unknown" : "";
  return (
    <select className={input} value={selected} onChange={(e) => onChange(e.target.value === "unknown" ? undefined : e.target.value)}>
      <option value="" disabled>
        Choose… · اختر
      </option>
      {BLOOD_TYPES.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
      <option value="unknown">Unknown · غير معروف</option>
    </select>
  );
}
