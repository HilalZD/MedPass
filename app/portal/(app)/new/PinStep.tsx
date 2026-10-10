"use client";

// Step 4: the patient types a 6-digit PIN twice, then we save.
// The PIN goes to our server once, over HTTPS, and is stored only as a bcrypt
// hash. The browser keeps it in memory until the card is printed.

import { useMemo, useState } from "react";
import { fitRecord } from "@/lib/card";
import { draftToRecord, type ExtractedDraft } from "@/lib/extract";
import type { MedPassRecord } from "@/lib/types";
import CardMeter from "./CardMeter";
import { ErrorBox, btn, input } from "./ui";

const sixDigits = (s: string) => /^\d{6}$/.test(s);

export default function PinStep({
  draft,
  onBack,
  onSaved,
}: {
  draft: ExtractedDraft;
  onBack: () => void;
  onSaved: (record: MedPassRecord, pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Card size check before saving. The real MedPass ID is created on save; a
  // placeholder of the same length gives the same size.
  const fit = useMemo(() => {
    try {
      return fitRecord(draftToRecord(draft, { id: "MP-XXXX-XXXX", cardVersion: 1 }));
    } catch {
      return null;
    }
  }, [draft]);

  const mismatch = sixDigits(pin) && again.length === 6 && pin !== again;
  const ready = sixDigits(pin) && pin === again;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/portal/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No photo here: the card photo stays in this browser and only goes to /print.
        body: JSON.stringify({ draft: { ...draft, updated: new Date().toISOString().slice(0, 10) }, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`);
      onSaved(data.record as MedPassRecord, pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No internet connection. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const pinInput = (value: string, set: (v: string) => void, label: string) => (
    <label className="flex flex-col gap-1 text-lg font-medium">
      {label}
      <input
        className={`${input} text-center font-mono text-3xl tracking-[0.5em]`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        dir="ltr"
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </label>
  );

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">4. Patient chooses a PIN</h1>
      <p className="text-lg text-gray-700">Hand the phone to the patient. Only the patient should see the PIN.</p>

      {pinInput(pin, setPin, "6-digit PIN")}
      {pinInput(again, setAgain, "Type the same PIN again")}
      {mismatch && <ErrorBox>The two PINs are not the same. Please type them again.</ErrorBox>}

      <div className="rounded-xl border-2 border-brand-100 bg-brand-50 p-4 text-lg">
        <p>Remember this PIN. Nobody, not even the hospital, can recover it from your card.</p>
        <p dir="rtl" lang="ar" className="mt-2">
          احفظ هذا الرمز. لا أحد، ولا حتى المستشفى، يستطيع استرجاعه من بطاقتك.
        </p>
      </div>

      {fit && <CardMeter fit={fit} />}

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid grid-cols-3 gap-3">
        <button className={btn.secondary} onClick={onBack} disabled={saving}>
          Back
        </button>
        <button className={`${btn.primary} col-span-2`} disabled={!ready || saving} onClick={save}>
          {saving ? "Saving…" : "Save patient"}
        </button>
      </div>
    </section>
  );
}
