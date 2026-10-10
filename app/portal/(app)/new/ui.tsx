"use client";

// Small shared pieces for the "New patient" screens.

import { useEffect, useMemo, useState } from "react";
import { Bi } from "@/components/Bi";
import { loadDrugs, normalize, type DrugRow } from "@/lib/match";
import type { Status } from "@/lib/types";

// MedPass look (see app/globals.css): big touch targets (at least 48 px high),
// deep green for the main action, white with a soft green-grey border otherwise.
export const btn = {
  primary:
    "min-h-14 rounded-2xl bg-brand px-5 py-4 text-xl font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-40",
  secondary:
    "min-h-12 rounded-2xl border-2 border-line bg-white px-4 py-3 text-lg font-semibold text-ink transition-colors hover:border-brand disabled:opacity-40",
  small: "min-h-11 rounded-xl border-2 border-line bg-white px-3 py-2 text-base font-semibold text-ink hover:border-brand",
  danger: "min-h-11 rounded-xl border-2 border-red-300 bg-white px-3 py-2 text-base font-semibold text-red-800",
};

export const input =
  "w-full rounded-2xl border-2 border-line bg-white p-3 text-lg text-ink focus:border-brand focus:outline-none";

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
// Friendly network handling for every portal request.
// ---------------------------------------------------------------------------

const SESSION_EVENT = "medpass:session-expired";

// The message to show when a request couldn't reach the server at all.
export function networkErrorMessage(): string {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "You're offline. Scanning still works; saving needs internet."
    : "Could not reach the server. Check the connection and try again.";
}

// fetch() for portal API calls:
// - no connection → throws an Error with a plain-language message
// - 401 (login expired) → tells <SessionWatcher> to show "Log in again"
// The caller still gets the response and shows its own error text.
export async function portalFetch(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(networkErrorMessage());
  }
  if (res.status === 401) window.dispatchEvent(new Event(SESSION_EVENT));
  return res;
}

// Banner in the portal layout when the clinician's login has expired.
// "Log in again" opens a NEW tab, so nothing typed on this page is lost:
// log in there, come back, and press Save again.
export function SessionWatcher() {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const on = () => setExpired(true);
    window.addEventListener(SESSION_EVENT, on);
    return () => window.removeEventListener(SESSION_EVENT, on);
  }, []);
  if (!expired) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 border-b-2 border-red-300 bg-red-50 px-4 py-3 text-center text-lg text-red-900">
      <Bi
        as="div"
        center
        enClassName="font-semibold"
        en="Your login expired. Nothing on this page is lost."
        ar="انتهت صلاحية تسجيل الدخول. لم يُفقد شيء من هذه الصفحة."
      />
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <a href="/portal/login" target="_blank" rel="noopener" className={btn.small}>
          Log in again (new tab)
        </a>
        <button className={btn.small} onClick={() => setExpired(false)}>
          I logged in, continue
        </button>
      </div>
    </div>
  );
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
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border-2 border-line bg-white shadow-lg">
          {options.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="w-full px-3 py-3 text-start text-lg hover:bg-brand-50"
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
