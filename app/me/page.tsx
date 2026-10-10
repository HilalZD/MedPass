"use client";

// /me: the patient's own view. No clinician login.
// MedPass ID + PIN → read-only record + "Who opened my record".
// The session is a 10-minute httpOnly cookie; this page never sees the PIN after sending it.

import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Brand";
import DemoHint from "@/components/DemoHint";
import type { MedPassRecord, Verified } from "@/lib/types";

type LogEntry = { at: string; action: string; facility: string | null; clinician: string | null };
type Payload = { record: MedPassRecord; cardVersion: number; unlockedUntil: number; log: LogEntry[] };

const btnPrimary = "min-h-14 rounded-2xl bg-brand px-5 py-4 text-xl font-semibold text-white hover:bg-brand-dark disabled:opacity-40";
const btnSecondary = "min-h-12 rounded-2xl border-2 border-line bg-white px-4 py-3 text-lg font-semibold hover:border-brand";
const inputCls = "w-full rounded-2xl border-2 border-line bg-white p-4 text-2xl focus:border-brand focus:outline-none";

export default function MePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [checking, setChecking] = useState(true);

  // Still unlocked from a moment ago (e.g. page refresh)? Then show the record.
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setChecking(false));
  }, []);

  const lock = useCallback(() => {
    setData(null);
    fetch("/api/me/unlock", { method: "DELETE" }).catch(() => {});
  }, []);

  // Always light: big dark-on-white text is easiest to read on cheap phones in
  // sunlight, and the boxes were designed for it (even if the phone is in dark mode).
  return (
    <div className="flex flex-1 flex-col text-ink">
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4">
      <header className="flex flex-col items-center gap-2 pt-2 text-center">
        <Logo subtitle="My record · ملفي" />
        <h1 className="text-xl font-semibold">
          My medical record · <span lang="ar">ملفي الطبي</span>
        </h1>
      </header>

      {checking ? <p className="text-center text-lg">…</p> : data ? <Record data={data} onLock={lock} /> : <Login onOpen={setData} />}
    </main>
    </div>
  );
}

function Login({ onOpen }: { onOpen: (d: Payload) => void }) {
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/me/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pin }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      onOpen(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No internet connection.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-center text-lg text-gray-700">
        See your record and who opened it.
        <br />
        <span lang="ar" dir="rtl">
          شاهد ملفك ومن فتحه.
        </span>
      </p>

      <DemoHint />

      <label className="flex flex-col gap-2 text-lg font-medium">
        <span>
          Your MedPass ID · <span lang="ar">رقم ميدباس</span>
        </span>
        <input
          className={`${inputCls} font-mono uppercase`}
          dir="ltr"
          placeholder="MP-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <span className="text-base font-normal text-gray-600">It is printed on the front of your card.</span>
      </label>

      <label className="flex flex-col gap-2 text-lg font-medium">
        <span>
          Your 6-digit PIN · <span lang="ar">الرمز السري</span>
        </span>
        <input
          className={`${inputCls} text-center font-mono tracking-[0.5em]`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          dir="ltr"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-100 p-4 text-lg text-red-900">
          {error}
        </p>
      )}

      <button className={btnPrimary} disabled={busy || !id.trim() || pin.length !== 6}>
        {busy ? "Checking…" : "Open my record · افتح ملفي"}
      </button>
    </form>
  );
}

function Record({ data, onLock }: { data: Payload; onLock: () => void }) {
  const r = data.record;
  const p = r.patient;
  const openReferrals = r.referrals.filter((x) => x.status === "open");
  const visits = [...r.visits].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6">
      <Countdown until={data.unlockedUntil} onLock={onLock} />

      <section className="flex flex-col gap-1 rounded-2xl border-2 border-gray-200 p-4">
        <p className="text-2xl font-bold" dir="auto">
          {p.name}
        </p>
        {p.nameAr && (
          <p className="text-2xl font-bold" dir="rtl" lang="ar">
            {p.nameAr}
          </p>
        )}
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-lg">
          <Item label="Date of birth" value={p.dateOfBirth} />
          <Item label="Blood type" value={p.bloodType} />
          <Item label="MedPass ID" value={r.id} mono />
          <Item label="Current card" value={`Card ${data.cardVersion}`} />
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
        <h2 className="text-xl font-semibold">Emergency info · معلومات الطوارئ</h2>
        <p className="text-lg">
          <span className="text-gray-700">Allergies: </span>
          <span className="font-semibold">{r.emergency.allergies.join(", ") || "None recorded"}</span>
        </p>
        <p className="text-lg">
          <span className="text-gray-700">Critical conditions: </span>
          <span className="font-semibold">{r.emergency.critical.join(", ") || "None recorded"}</span>
        </p>
      </section>

      <Section title="Conditions · الأمراض" empty={r.conditions.length === 0}>
        {r.conditions.map((c, i) => (
          <Row key={i}>
            <span>{c.name}</span>
            <Badge v={c.verified} />
          </Row>
        ))}
      </Section>

      <Section title="Medicines · الأدوية" empty={r.meds.length === 0}>
        {r.meds.map((m, i) => (
          <Row key={i}>
            <span>
              <span className="font-semibold">{m.name}</span>
              {m.strength && ` ${m.strength}`}
              {m.frequency && <span className="block text-base text-gray-700">{m.frequency}</span>}
            </span>
            <Badge v={m.verified} />
          </Row>
        ))}
      </Section>

      <Section title="Open referrals · الإحالات" empty={openReferrals.length === 0}>
        {openReferrals.map((x, i) => (
          <Row key={i}>
            <span>
              <span className="font-semibold">{x.to}</span>
              {x.reason && <span className="block text-base text-gray-700">{x.reason}</span>}
            </span>
          </Row>
        ))}
      </Section>

      <Section title="Visits · الزيارات" empty={visits.length === 0}>
        {visits.map((v, i) => (
          <Row key={i}>
            <span>
              <span className="font-semibold" dir="ltr">
                {v.date || "No date"}
              </span>{" "}
              · {v.place}
              {v.note && <span className="block text-base text-gray-700">{v.note}</span>}
            </span>
          </Row>
        ))}
      </Section>

      <p className="rounded-2xl bg-gray-100 p-4 text-center text-lg">
        To change anything, visit any MedPass health facility.
        <br />
        <span lang="ar" dir="rtl">
          لتغيير أي معلومة، زُر أي مركز صحي يعمل بنظام ميدباس.
        </span>
      </p>

      <AccessLog log={data.log} />

      <button className={btnSecondary} onClick={onLock}>
        🔒 Lock · قفل
      </button>
    </div>
  );
}

// "Unlocked for 9:59" + Lock. Live clock only in the browser, from the server's expiry time.
function Countdown({ until, onLock }: { until: number; onLock: () => void }) {
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
  const mm = left === null ? 10 : Math.max(0, Math.floor(left / 60000));
  const ss = left === null ? 0 : Math.max(0, Math.floor((left % 60000) / 1000));

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 p-3 text-lg">
      <span>
        🔓 Open for{" "}
        <span className="font-mono font-semibold">
          {mm}:{String(ss).padStart(2, "0")}
        </span>
      </span>
      <button className={btnSecondary} onClick={onLock}>
        Lock
      </button>
    </div>
  );
}

const ACTIONS: Record<string, { en: string; ar: string }> = {
  create: { en: "Registered", ar: "تسجيل" },
  view: { en: "Viewed", ar: "اطّلاع" },
  edit: { en: "Edited", ar: "تعديل" },
  reissue: { en: "Printed a new card", ar: "طباعة بطاقة جديدة" },
  failed_pin: { en: "Wrong PIN attempt", ar: "محاولة برمز خاطئ" },
};

// The main point of this page: every time someone opened or changed the record.
function AccessLog({ log }: { log: LogEntry[] }) {
  const wrong = log.filter((e) => e.action === "failed_pin").length;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Who opened my record · من فتح ملفي</h2>
      {wrong > 0 && (
        <p className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-3 text-lg text-amber-900">
          {wrong} wrong PIN attempt{wrong === 1 ? "" : "s"}. If this was not you, keep your card safe and ask a MedPass
          facility for help.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {log.map((e, i) => {
          const a = ACTIONS[e.action] ?? { en: e.action, ar: "" };
          const isWrong = e.action === "failed_pin";
          // No clinician = done on this patient page. A wrong PIN there may not be the patient.
          const who = e.clinician ?? (isWrong ? "Someone on this patient page" : "You");
          return (
            <li
              key={i}
              className={`flex flex-col gap-1 rounded-2xl border-2 p-3 text-lg ${isWrong ? "border-amber-500 bg-amber-50" : "border-gray-200"}`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`font-semibold ${isWrong ? "text-amber-900" : ""}`}>
                  {isWrong && "⚠ "}
                  {a.en} · <span lang="ar">{a.ar}</span>
                </span>
                <span className="text-base text-gray-600" dir="ltr">
                  {new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </span>
              <span className="text-gray-800">
                {who}
                {e.facility ? ` · ${e.facility}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Item({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-base text-gray-600">{label}</dt>
      <dd className={`font-semibold ${mono ? "font-mono" : ""}`} dir="ltr">
        {value || "—"}
      </dd>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {empty ? <p className="text-lg text-gray-600">None recorded.</p> : <ul className="flex flex-col gap-2">{children}</ul>}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start justify-between gap-3 rounded-2xl border-2 border-gray-200 p-3 text-lg">{children}</li>;
}

function Badge({ v }: { v: Verified }) {
  return v === "clinician" ? (
    <span className="shrink-0 rounded-full bg-green-700 px-2 py-0.5 text-sm font-semibold text-white">✓ Clinician-verified</span>
  ) : (
    <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-sm text-gray-800">Patient-confirmed</span>
  );
}
