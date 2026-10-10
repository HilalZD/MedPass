"use client";

// Step 2: clinician + patient check every item against the paper.
// "Next" stays locked until every yellow and unreadable medicine is resolved:
// confirmed (Correct), fixed (Edit / pick a suggestion) or removed.

import { useState } from "react";
import { unresolvedMeds, type DraftMed, type ExtractedDraft } from "@/lib/extract";
import type { DrugRow } from "@/lib/match";
import { DrugNameInput, FromPaper, btn, input, statusLabel, statusStyle, suggest, useDrugs } from "./ui";

type Props = {
  draft: ExtractedDraft;
  setDraft: (d: ExtractedDraft) => void;
  warnings: string[];
  photos: string[];
  onBack: () => void;
  onNext: () => void;
};

export default function ReviewStep({ draft, setDraft, warnings, photos, onBack, onNext }: Props) {
  const drugs = useDrugs();
  const [zoom, setZoom] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const left = unresolvedMeds(draft);

  const setMeds = (meds: DraftMed[]) => setDraft({ ...draft, meds });
  const updateMed = (i: number, med: DraftMed | null) =>
    setMeds(med ? draft.meds.map((m, j) => (j === i ? med : m)) : draft.meds.filter((_, j) => j !== i));

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">2. Check every item against the paper</h1>

      {photos.length > 0 && (
        <div className="flex gap-2">
          {photos.map((src, i) => (
            <button key={i} onClick={() => setZoom(i)} className="w-24 text-center text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Paper ${i + 1}`} className="aspect-square w-24 rounded-lg border object-cover" />
              Paper {i + 1}
            </button>
          ))}
        </div>
      )}
      {zoom !== null && (
        <button className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/80 p-2" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[zoom]} alt={`Paper ${zoom + 1}`} className="max-h-[90vh] max-w-full rounded-lg bg-white" />
          <span className="text-lg text-white">Paper {zoom + 1} · tap to close</span>
        </button>
      )}

      {warnings.map((w) => (
        <p key={w} className="rounded-xl border-2 border-yellow-500 bg-yellow-50 p-3 text-lg">
          {w}
        </p>
      ))}

      <h2 className="text-xl font-semibold">Medicines ({draft.meds.length})</h2>
      <ul className="flex flex-col gap-3">
        {draft.meds.map((m, i) => (
          <MedItem key={i} med={m} drugs={drugs} onChange={(next) => updateMed(i, next)} />
        ))}
      </ul>
      {adding ? (
        <MedForm
          med={{ name: "", status: "green", verified: "patient", sourcePaper: 0 }}
          drugs={drugs}
          onSave={(med) => {
            setMeds([...draft.meds, med]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button className={btn.secondary} onClick={() => setAdding(true)}>
          + Add a medicine
        </button>
      )}

      <NameList
        title="Conditions"
        items={draft.conditions}
        onChange={(conditions) => setDraft({ ...draft, conditions })}
        make={(name) => ({ name, verified: "patient" as const, sourcePaper: 0 })}
      />

      <h2 className="text-xl font-semibold">Referrals</h2>
      <ul className="flex flex-col gap-2">
        {draft.referrals.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg">
            <span>
              {r.to}
              {r.reason && ` · ${r.reason}`} <FromPaper n={r.sourcePaper} />
            </span>
            <button className={btn.danger} onClick={() => setDraft({ ...draft, referrals: draft.referrals.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <AddLine
        placeholder="Add a referral, e.g. Cardiology"
        onAdd={(to) => setDraft({ ...draft, referrals: [...draft.referrals, { to, status: "open", sourcePaper: 0 }] })}
      />

      {draft.visits.length > 0 && (
        <>
          <h2 className="text-xl font-semibold">Visits</h2>
          <ul className="flex flex-col gap-2">
            {draft.visits.map((v, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg">
                <span>
                  {v.date || "No date"} · {v.place || "No place"} · {v.note}
                </span>
                <button className={btn.danger} onClick={() => setDraft({ ...draft, visits: draft.visits.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="sticky bottom-0 flex flex-col gap-2 border-t-2 border-gray-200 bg-white py-3">
        {left > 0 && (
          <p className="text-center text-lg font-semibold text-yellow-800">
            {left} medicine{left === 1 ? "" : "s"} still to check
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <button className={btn.secondary} onClick={onBack}>
            Back
          </button>
          <button className={`${btn.primary} col-span-2`} disabled={left > 0} onClick={onNext}>
            Next: patient details
          </button>
        </div>
      </div>
    </section>
  );
}

// One medicine: "written on paper → we read it as", status, and the actions.
function MedItem({ med, drugs, onChange }: { med: DraftMed; drugs: DrugRow[]; onChange: (m: DraftMed | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [rejected, setRejected] = useState(false);

  if (editing) {
    return (
      <li>
        <MedForm
          med={med}
          drugs={drugs}
          onSave={(m) => {
            onChange(m);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  const unreadable = med.status === "unreadable";
  const candidates = unreadable && med.raw && !rejected ? suggest(med.raw, 3) : [];

  return (
    <li className={`flex flex-col gap-2 rounded-xl border-s-8 border-2 p-3 ${statusStyle[med.status]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold uppercase">{statusLabel[med.status]}</span>
        <FromPaper n={med.sourcePaper} />
      </div>

      {med.raw && (
        <p className="text-lg">
          <span className="text-gray-600">Written on paper: </span>
          <span className="font-mono" dir="auto">
            {med.raw}
          </span>
        </p>
      )}
      <p className="text-xl">
        <span className="text-base text-gray-600">{med.raw ? "→ We read it as: " : "Medicine: "}</span>
        <span className="font-semibold">{unreadable ? "Could not read the name" : med.name}</span>
        {med.strength && ` ${med.strength}`}
        {med.frequency && ` · ${med.frequency}`}
      </p>
      {med.ingredient && <p className="text-base text-gray-700">Ingredient (MoPH list): {med.ingredient}</p>}
      {med.note && med.status !== "green" && <p className="text-base font-semibold text-yellow-900">{med.note}</p>}

      {unreadable && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold">Did you mean…?</p>
          {candidates.length === 0 && (
            <p className="text-base text-gray-700">No suggestions. Use Edit to type the name, or Remove.</p>
          )}
          {candidates.map((d) => (
            <button key={d.id} className={`${btn.small} text-start`} onClick={() => onChange(fromDrug(med, d))}>
              {d.brand} {d.strength} <span className="text-sm text-gray-600">({d.ingredient})</span>
            </button>
          ))}
          {candidates.length > 0 && (
            <button className={btn.small} onClick={() => setRejected(true)}>
              None of these
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {med.status === "yellow" && (
          <button className={btn.small} onClick={() => onChange({ ...med, status: "green" })}>
            ✓ Correct
          </button>
        )}
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

// A picked MoPH row fills name, ingredient and drugId. The paper's strength is
// kept if it has one (e.g. "18 units" of Lantus is a dose, not the product strength).
function fromDrug(med: DraftMed, d: DrugRow): DraftMed {
  return {
    ...med,
    name: d.brand,
    ingredient: d.ingredient,
    drugId: d.id,
    strength: med.strength || d.strength,
    status: "green",
    note: undefined,
  };
}

// Edit or add a medicine. The name autocompletes from the MoPH list only.
function MedForm({
  med,
  drugs,
  onSave,
  onCancel,
}: {
  med: DraftMed;
  drugs: DrugRow[];
  onSave: (m: DraftMed) => void;
  onCancel: () => void;
}) {
  const [m, setM] = useState<DraftMed>({ ...med, name: med.status === "unreadable" ? "" : med.name });

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-blue-600 bg-white p-3">
      {med.raw && (
        <p className="text-lg">
          <span className="text-gray-600">Written on paper: </span>
          <span className="font-mono" dir="auto">
            {med.raw}
          </span>
        </p>
      )}
      <label className="flex flex-col gap-1 text-lg">
        Medicine name
        <DrugNameInput
          value={m.name}
          drugs={drugs}
          onType={(name) => setM({ ...m, name, drugId: undefined, ingredient: undefined })}
          onPick={(d) => setM(fromDrug(m, d))}
        />
      </label>
      {m.name && !m.drugId && <p className="text-base text-yellow-900">Not picked from the MoPH list.</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-lg">
          Strength
          <input className={input} dir="ltr" value={m.strength ?? ""} onChange={(e) => setM({ ...m, strength: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1 text-lg">
          How often
          <input className={input} value={m.frequency ?? ""} onChange={(e) => setM({ ...m, frequency: e.target.value || undefined })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className={btn.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          className={btn.primary}
          disabled={!m.name.trim()}
          onClick={() => onSave({ ...m, name: m.name.trim(), status: "green", note: undefined })}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// A list of { name, sourcePaper } items with Remove and Add.
export function NameList<T extends { name: string; sourcePaper: number }>({
  title,
  items,
  onChange,
  make,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  make: (name: string) => T;
}) {
  return (
    <>
      <h2 className="text-xl font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-lg text-gray-600">None written on the papers.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-xl border-2 border-gray-200 p-3 text-lg">
            <span>
              {it.name} <FromPaper n={it.sourcePaper} />
            </span>
            <button className={btn.danger} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <AddLine placeholder={`Add to ${title.toLowerCase()}`} onAdd={(name) => onChange([...items, make(name)])} />
    </>
  );
}

export function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim());
        setText("");
      }}
    >
      <input className={input} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <button className={btn.secondary} type="submit">
        Add
      </button>
    </form>
  );
}
