"use client";

// Small shared pieces for the "New patient" screens.

import { useEffect, useMemo, useState } from "react";
import { loadDrugs, normalize, type DrugRow } from "@/lib/match";
import type { Status } from "@/lib/types";

export const btn = {
  primary: "rounded-xl bg-blue-700 px-5 py-4 text-xl font-semibold text-white disabled:opacity-40",
  secondary: "rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-lg font-semibold disabled:opacity-40",
  small: "rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-base font-semibold",
  danger: "rounded-lg border-2 border-red-300 bg-white px-3 py-2 text-base font-semibold text-red-800",
};

export const input =
  "w-full rounded-xl border-2 border-gray-300 p-3 text-lg focus:border-blue-600 focus:outline-none";

export const statusStyle: Record<Status, string> = {
  green: "border-green-600 bg-green-50",
  yellow: "border-yellow-500 bg-yellow-50",
  unreadable: "border-gray-500 bg-gray-100",
};

export const statusLabel: Record<Status, string> = {
  green: "OK",
  yellow: "Check",
  unreadable: "Unreadable",
};

export function FromPaper({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-sm text-gray-700">
      {n === 0 ? "added in review" : `from paper ${n}`}
    </span>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-100 p-4 text-lg text-red-900">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// "Did you mean...?" for unreadable meds.
// TODO: replace this stub with suggest() from lib/match.ts once my teammate
// pushes it. Until then there are never suggestions, and the clinician uses
// Edit (typed name, autocompleted from the MoPH list) or Remove.
// ---------------------------------------------------------------------------
export function suggest(rawText: string, limit: number): DrugRow[] {
  void rawText;
  void limit;
  return [];
}

// drugs.json, loaded once in the browser (the service worker caches it).
export function useDrugs(): DrugRow[] {
  const [drugs, setDrugs] = useState<DrugRow[]>([]);
  useEffect(() => {
    loadDrugs().then(setDrugs).catch(() => setDrugs([]));
  }, []);
  return drugs;
}

// Text box whose suggestions come ONLY from the MoPH list (public/drugs.json).
// Picking a row calls onPick; typing calls onType (then nothing is matched).
export function DrugNameInput({
  value,
  onType,
  onPick,
  drugs,
}: {
  value: string;
  onType: (text: string) => void;
  onPick: (drug: DrugRow) => void;
  drugs: DrugRow[];
}) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const q = normalize(value);
    if (q.length < 2) return [];
    const starts: DrugRow[] = [];
    const contains: DrugRow[] = [];
    const seen = new Set<string>();
    for (const d of drugs) {
      const key = `${d.brand}|${d.strength}|${d.form}`;
      if (seen.has(key)) continue;
      const brand = normalize(d.brand);
      if (brand.startsWith(q)) starts.push(d);
      else if (brand.includes(q) || normalize(d.ingredient).startsWith(q)) contains.push(d);
      else continue;
      seen.add(key);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [value, drugs]);

  return (
    <div className="relative">
      <input
        className={input}
        dir="ltr"
        value={value}
        placeholder="Start typing the medicine name"
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border-2 border-gray-300 bg-white shadow-lg">
          {options.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="w-full px-3 py-3 text-start text-lg hover:bg-blue-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(d);
                  setOpen(false);
                }}
              >
                <span className="font-semibold">{d.brand}</span> {d.strength}
                <span className="block text-sm text-gray-600">
                  {d.ingredient} · {d.form}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
