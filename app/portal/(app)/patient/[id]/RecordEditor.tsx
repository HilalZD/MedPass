"use client";

// The full record, editable. Changes stay local until "Save changes"
// (one "edit" log entry per save). Every new or edited medicine is checked
// against the MoPH list (same yellow rule as when creating a patient).

import { useEffect, useMemo, useState } from "react";
import DrugInfo from "@/components/DrugInfo";
import { NOT_IN_MOPH_LIST } from "@/lib/extract";
import { createMatcher, type Matcher } from "@/lib/match";
import type { Med, MedPassRecord, Verified } from "@/lib/types";
import { BLOOD_TYPES } from "../../new/DetailsStep";
import { AddLine, MedForm } from "../../new/ReviewStep";
import { ErrorBox, btn, input, statusLabel, statusStyle, useDrugs } from "../../new/ui";
import CardPanel from "./CardPanel";
import type { PatientField, Payload } from "./PatientView";

type EditMed = Med & { note?: string };
type Working = Omit<MedPassRecord, "meds"> & { meds: EditMed[] };

const today = () => new Date().toISOString().slice(0, 10);

// A medicine a clinician added or edited: picked from the list → fine;
// typed → matchMed(); not found or unsure → yellow until someone confirms it.
function checkMed(med: EditMed, matcher: Matcher | null): EditMed {
  const base: EditMed = { ...med, verified: "clinician", status: "green", note: undefined };
  if (med.drugId) return base;
  const m = matcher?.matchMed(med);
  if (!m || m.confidence === "low") return { ...base, status: "yellow", note: NOT_IN_MOPH_LIST };
  return { ...base, drugId: m.drug.id, ingredient: m.drug.ingredient };
}

export default function RecordEditor({
  id,
  data,
  setData,
  pin,
  setPin,
  onLock,
}: {
  id: string;
  data: Payload;
  setData: (d: Payload) => void;
  pin: string | null;
  setPin: (p: string | null) => void;
  onLock: () => void;
}) {
  const drugs = useDrugs();
  const matcher = useMemo(() => (drugs.length ? createMatcher(drugs) : null), [drugs]);
  const [w, setW] = useState<Working>(data.record);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // New data from the server (save / reissue) replaces the working copy.
  const [loaded, setLoaded] = useState(data.record);
  if (loaded !== data.record) {
    setLoaded(data.record);
    setW(data.record);
  }

  const dirty = JSON.stringify(w) !== JSON.stringify(data.record);
  const unresolved = w.meds.filter((m) => m.status !== "green").length;
  const changedFields = FIELDS.filter((f) => (w.patient[f.key] ?? "") !== (data.record.patient[f.key] ?? ""));
  const r = w;

  // The working copy as a plain MedPassRecord (review notes removed).
  const workingRecord: MedPassRecord = useMemo(
    () => ({ ...w, meds: w.meds.map(({ note: _n, ...m }) => (void _n, m)) }),
    [w],
  );
  const canSave = unresolved === 0 && w.patient.name.trim() !== "";

  // Returns true only if the record was saved.
  async function save(): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/patients/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: workingRecord, baseUpdatedAt: data.updatedAt }),
      });
      const body = await res.json();
      if (res.status === 403 && body.needPin) {
        onLock();
        return false;
      }
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      setData(body);
      setSavedMsg("Saved ✓");
      setTimeout(() => setSavedMsg(""), 3000);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No internet connection.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const setMed = (i: number, m: EditMed | null) =>
    setW({ ...w, meds: m ? w.meds.map((x, j) => (j === i ? m : x)) : w.meds.filter((_, j) => j !== i) });

  return (
    <div className="flex flex-col gap-6">
      <Header record={r} cardVersion={data.cardVersion} until={data.unlockedUntil} onLock={onLock} />

      <PatientDetails
        patient={r.patient}
        verified={data.verifiedFields}
        changed={changedFields}
        onChange={(patient) => setW({ ...w, patient })}
      />

      <section className="flex flex-col gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-3">
        <h2 className="text-xl font-semibold">Emergency info (printed on the card)</h2>
        <StringList
          title="Allergies"
          items={r.emergency.allergies}
          onChange={(allergies) => setW({ ...w, emergency: { ...w.emergency, allergies } })}
        />
        <StringList
          title="Critical conditions"
          items={r.emergency.critical}
          onChange={(critical) => setW({ ...w, emergency: { ...w.emergency, critical } })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Medicines ({r.meds.length})</h2>
        <ul className="flex flex-col gap-3">
          {r.meds.map((m, i) => (
            <MedRow key={i} med={m} matcher={matcher} drugs={drugs} onChange={(next) => setMed(i, next)} />
          ))}
        </ul>
        <AddMed drugs={drugs} onAdd={(m) => setW({ ...w, meds: [...w.meds, checkMed(m, matcher)] })} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Conditions</h2>
        <ul className="flex flex-col gap-2">
          {r.conditions.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg">
              <span className="flex flex-wrap items-center gap-2">
                {c.name} <VerifiedBadge v={c.verified} />
              </span>
              <span className="flex gap-2">
                {c.verified === "patient" && (
                  <button
                    className={btn.small}
                    onClick={() => setW({ ...w, conditions: w.conditions.map((x, j) => (j === i ? { ...x, verified: "clinician" } : x)) })}
                  >
                    Mark clinician-verified
                  </button>
                )}
                <button className={btn.danger} onClick={() => setW({ ...w, conditions: w.conditions.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        <AddLine
          placeholder="Add a condition"
          onAdd={(name) => setW({ ...w, conditions: [...w.conditions, { name, verified: "clinician" }] })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Referrals</h2>
        <ul className="flex flex-col gap-2">
          {r.referrals.map((ref, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg">
              <span>
                {ref.to}
                {ref.reason && ` · ${ref.reason}`}{" "}
                <span className={`rounded-full px-2 py-0.5 text-sm ${ref.status === "open" ? "bg-brand-100 text-brand-dark" : "bg-gray-200"}`}>
                  {ref.status === "open" ? "Open" : "Done"}
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  className={btn.small}
                  onClick={() =>
                    setW({
                      ...w,
                      referrals: w.referrals.map((x, j) => (j === i ? { ...x, status: x.status === "open" ? "done" : "open" } : x)),
                    })
                  }
                >
                  Mark {ref.status === "open" ? "done" : "open"}
                </button>
                <button className={btn.danger} onClick={() => setW({ ...w, referrals: w.referrals.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        <AddLine placeholder="Refer to, e.g. Cardiology" onAdd={(to) => setW({ ...w, referrals: [...w.referrals, { to, status: "open" }] })} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Visits</h2>
        <AddVisit facility={data.facilityName} onAdd={(v) => setW({ ...w, visits: [v, ...w.visits] })} />
        <ul className="flex flex-col gap-2">
          {[...r.visits]
            .map((v, i) => ({ v, i }))
            .sort((a, b) => b.v.date.localeCompare(a.v.date))
            .map(({ v, i }) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg">
                <span>
                  <span className="font-semibold">{v.date || "No date"}</span> · {v.place} · {v.note}
                </span>
                <button className={btn.danger} onClick={() => setW({ ...w, visits: w.visits.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </li>
            ))}
        </ul>
      </section>

      {(dirty || savedMsg || error) && (
        <div className="sticky bottom-0 flex flex-col gap-2 border-t-2 border-gray-200 bg-white py-3">
          {error && <ErrorBox>{error}</ErrorBox>}
          {savedMsg && <p className="text-center text-lg font-semibold text-brand-dark">{savedMsg}</p>}
          {unresolved > 0 && (
            <p className="text-center text-lg font-semibold text-yellow-800">
              {unresolved} medicine{unresolved === 1 ? "" : "s"} still to check
            </p>
          )}
          {changedFields.length > 0 && (
            <div className="rounded-xl border-2 border-brand bg-brand-50 p-3 text-lg">
              <p className="font-semibold">Check before saving. Patient details changed:</p>
              <ul className="flex flex-col gap-1">
                {changedFields.map((f) => (
                  <li key={f.key}>
                    {f.label}: <span className="line-through">{show(f.key, data.record.patient[f.key])}</span> →{" "}
                    <span className="font-semibold">{show(f.key, w.patient[f.key])}</span>
                  </li>
                ))}
              </ul>
              <p className="text-base text-gray-700">These will be marked clinician-verified.</p>
            </div>
          )}
          {dirty && (
            <div className="grid grid-cols-3 gap-3">
              <button className={btn.secondary} onClick={() => setW(data.record)} disabled={saving}>
                Undo all
              </button>
              <button className={`${btn.primary} col-span-2`} disabled={saving || !canSave} onClick={save}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      )}

      <CardPanel
        id={id}
        data={data}
        setData={setData}
        record={workingRecord}
        dirty={dirty}
        canSave={canSave}
        save={save}
        pin={pin}
        setPin={setPin}
        onLock={onLock}
      />

      <AccessLog log={data.log} />
    </div>
  );
}

function Header({ record, cardVersion, until, onLock }: { record: MedPassRecord; cardVersion: number; until: number; onLock: () => void }) {
  // Live clock: computed only in the browser, from the expiry time the server sent.
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = until - Date.now();
      setLeft(ms);
      if (ms <= 0) onLock();
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [until, onLock]);
  const mm = left === null ? 15 : Math.max(0, Math.floor(left / 60000));
  const ss = left === null ? 0 : Math.max(0, Math.floor((left % 60000) / 1000));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 p-3 text-lg">
        <span>
          🔓 Unlocked for{" "}
          <span className="font-mono font-semibold">
            {mm}:{String(ss).padStart(2, "0")}
          </span>
        </span>
        <button className={btn.small} onClick={onLock}>
          Lock now
        </button>
      </div>
      <h1 className="text-3xl font-bold" dir="auto">
        {record.patient.name}
      </h1>
      <p className="font-mono text-lg" dir="ltr">
        {record.id} · card {cardVersion}
      </p>
    </section>
  );
}

type Patient = MedPassRecord["patient"];
const FIELDS: { key: PatientField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "nameAr", label: "Arabic name" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "sex", label: "Sex" },
  { key: "bloodType", label: "Blood type" },
];

function show(key: PatientField, value: string | undefined): string {
  if (!value) return "(empty)";
  if (key === "sex") return value === "F" ? "Female" : "Male";
  return value;
}

// Name, date of birth, sex, blood type. Each shows who checked it; a field
// the clinician changes becomes clinician-verified when saved.
function PatientDetails({
  patient,
  verified,
  changed,
  onChange,
}: {
  patient: Patient;
  verified: PatientField[];
  changed: { key: PatientField }[];
  onChange: (p: Patient) => void;
}) {
  const [editing, setEditing] = useState(false);
  const badge = (key: PatientField) =>
    changed.some((c) => c.key === key) ? (
      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-sm font-semibold text-brand-dark">Changed, not saved</span>
    ) : (
      <VerifiedBadge v={verified.includes(key) ? "clinician" : "patient"} />
    );

  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Patient details</h2>
        <button className={btn.small} onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit details"}
        </button>
      </div>
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-lg">
            <span className="text-gray-600">{label}:</span>
            {!editing && <span className="font-semibold" dir="auto">{show(key, patient[key])}</span>}
            {badge(key)}
          </div>
          {editing && key === "nameAr" && (
            <input
              className={input}
              dir="rtl"
              lang="ar"
              value={patient.nameAr ?? ""}
              onChange={(e) => onChange({ ...patient, nameAr: e.target.value || undefined })}
            />
          )}
          {editing && key === "name" && (
            <input className={input} dir="auto" value={patient.name} onChange={(e) => onChange({ ...patient, name: e.target.value })} />
          )}
          {editing && key === "dateOfBirth" && (
            <input
              className={input}
              type="date"
              max={today()}
              value={patient.dateOfBirth ?? ""}
              onChange={(e) => onChange({ ...patient, dateOfBirth: e.target.value || undefined })}
            />
          )}
          {editing && key === "sex" && (
            <select
              className={input}
              value={patient.sex ?? ""}
              onChange={(e) => onChange({ ...patient, sex: (e.target.value || undefined) as Patient["sex"] })}
            >
              <option value="">Not given</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          )}
          {editing && key === "bloodType" && (
            <select className={input} value={patient.bloodType ?? ""} onChange={(e) => onChange({ ...patient, bloodType: e.target.value || undefined })}>
              <option value="">Unknown</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
      ))}
      {editing && !patient.name.trim() && <ErrorBox>The name can&apos;t be empty.</ErrorBox>}
    </section>
  );
}

export function VerifiedBadge({ v }: { v: Verified }) {
  return v === "clinician" ? (
    <span className="rounded-full bg-green-700 px-2 py-0.5 text-sm font-semibold text-white">✓ Clinician-verified</span>
  ) : (
    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-sm text-gray-800">Patient-confirmed</span>
  );
}

function MedRow({
  med,
  matcher,
  drugs,
  onChange,
}: {
  med: EditMed;
  matcher: Matcher | null;
  drugs: Parameters<typeof MedForm>[0]["drugs"];
  onChange: (m: EditMed | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  if (editing) {
    return (
      <li>
        <MedForm
          med={{ ...med, sourcePaper: 0 }}
          drugs={drugs}
          onCancel={() => setEditing(false)}
          onSave={({ sourcePaper: _s, ...m }) => {
            void _s;
            onChange(checkMed(m, matcher));
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const match = matcher?.matchMed(med) ?? null;
  return (
    <li className={`flex flex-col gap-2 rounded-xl border-s-8 border-2 p-3 ${statusStyle[med.status]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xl">
          <span className="font-semibold">{med.name}</span>
          {med.strength && ` ${med.strength}`}
          {med.frequency && ` · ${med.frequency}`}
        </span>
        <VerifiedBadge v={med.verified} />
      </div>
      {med.status !== "green" && (
        <p className="text-base font-semibold text-yellow-900">
          {statusLabel[med.status]}: {med.note ?? "please check"}
        </p>
      )}
      {showInfo && <DrugInfo med={med} match={match} alternatives={match && matcher ? matcher.alternatives(match.drug) : []} />}
      <div className="flex flex-wrap gap-2">
        {med.status === "yellow" && (
          <button className={btn.small} onClick={() => onChange({ ...med, status: "green", note: undefined })}>
            ✓ Correct
          </button>
        )}
        {med.verified === "patient" && (
          <button className={btn.small} onClick={() => onChange({ ...med, verified: "clinician" })}>
            Mark clinician-verified
          </button>
        )}
        <button className={btn.small} onClick={() => setShowInfo(!showInfo)}>
          {showInfo ? "Hide" : "Price & alternatives"}
        </button>
        <button className={btn.small} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className={btn.danger} onClick={() => onChange(null)}>
          Remove
        </button>
      </div>
    </li>
  );
}

function AddMed({ drugs, onAdd }: { drugs: Parameters<typeof MedForm>[0]["drugs"]; onAdd: (m: EditMed) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className={btn.secondary} onClick={() => setOpen(true)}>
        + Add a medicine
      </button>
    );
  }
  return (
    <MedForm
      med={{ name: "", status: "green", verified: "clinician", sourcePaper: 0 }}
      drugs={drugs}
      onCancel={() => setOpen(false)}
      onSave={({ sourcePaper: _s, ...m }) => {
        void _s;
        onAdd(m);
        setOpen(false);
      }}
    />
  );
}

// Add a visit: date (today by default), place = this clinician's facility, a short note.
function AddVisit({ facility, onAdd }: { facility: string; onAdd: (v: MedPassRecord["visits"][number]) => void }) {
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border-2 border-brand-100 bg-brand-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) return;
        onAdd({ date, place: facility, note: note.trim() });
        setNote("");
        setDate(today());
      }}
    >
      <p className="text-lg font-semibold">Add a visit at {facility}</p>
      <div className="grid grid-cols-3 gap-2">
        <input className={input} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        <input
          className={`${input} col-span-2`}
          placeholder="Short note, e.g. BP 150/90, dose increased"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <button className={btn.secondary} type="submit" disabled={!note.trim()}>
        Add visit
      </button>
    </form>
  );
}

function StringList({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">{title}</h3>
      {items.length === 0 && <p className="text-lg text-gray-600">None</p>}
      <ul className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 rounded-full border-2 border-red-300 bg-white py-1 ps-3 pe-1 text-lg">
            {it}
            <button
              className="rounded-full px-2 text-red-800"
              aria-label={`Remove ${it}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <AddLine placeholder={`Add to ${title.toLowerCase()}`} onAdd={(t) => onChange([...items, t])} />
    </div>
  );
}

const actionLabel: Record<string, string> = {
  create: "Created",
  view: "Opened",
  edit: "Edited",
  reissue: "New card printed",
  failed_pin: "Wrong PIN",
};

function AccessLog({ log }: { log: Payload["log"] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">Who opened this record</h2>
      <ul className="flex flex-col divide-y-2 divide-gray-100 rounded-xl border-2 border-gray-200">
        {log.map((e, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 p-3 text-base">
            <span className={e.action === "failed_pin" ? "font-semibold text-red-800" : "font-semibold"}>{actionLabel[e.action] ?? e.action}</span>
            <span className="text-gray-700">
              {e.clinician ?? "The patient"} · {e.facility ?? "online"}
            </span>
            <span className="w-full text-gray-500" dir="ltr">
              {new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
