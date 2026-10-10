"use client";

// Step 5: saved. Show the MedPass ID big and hand the card over to /print.
// Handoff = ONLY the encrypted payload string, in sessionStorage (this tab only).
// Never the record or the PIN, and never in the URL.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRINT_KEY, setPrintExtra } from "@/components/MedPassCard";
import { encode, fitRecord } from "@/lib/card";
import type { MedPassRecord } from "@/lib/types";
import CardMeter, { cardIsFull } from "./CardMeter";
import { ErrorBox, btn } from "./ui";

export default function DoneStep({ record, pin, onAnother }: { record: MedPassRecord; pin: string; onAnother: () => void }) {
  const router = useRouter();
  const [okDropped, setOkDropped] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fit = useMemo(() => {
    try {
      return fitRecord(record);
    } catch {
      return null;
    }
  }, [record]);

  const blocked = !fit || cardIsFull(fit) || (fit.droppedVisits.length > 0 && !okDropped);

  async function print() {
    if (!fit) return;
    setBusy(true);
    setError("");
    try {
      const payload = await encode(fit.record, pin); // takes about a second: strong PIN protection
      sessionStorage.setItem(PRINT_KEY, payload);
      // Printed on the card but not inside the QR: Arabic name and sex. Never the PIN.
      setPrintExtra({ nameAr: record.patient.nameAr, sex: record.patient.sex });
      router.push("/print");
    } catch {
      setError("Could not prepare the card. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <h1 className="text-2xl font-bold text-green-800">✓ Patient saved</h1>
      <p className="text-lg">{record.patient.name}</p>
      <div className="w-full rounded-2xl border-4 border-gray-900 p-5">
        <p className="text-lg text-gray-600">MedPass ID</p>
        <p className="font-mono text-4xl font-bold tracking-wider" dir="ltr">
          {record.id}
        </p>
      </div>

      <div className="w-full text-start">
        {fit ? <CardMeter fit={fit} /> : <ErrorBox>Could not check the card size.</ErrorBox>}
        {fit && !cardIsFull(fit) && fit.droppedVisits.length > 0 && (
          <label className="mt-3 flex items-center gap-3 text-lg">
            <input type="checkbox" className="h-6 w-6" checked={okDropped} onChange={(e) => setOkDropped(e.target.checked)} />
            OK, print without these visits
          </label>
        )}
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <button className={`${btn.primary} w-full`} disabled={blocked || busy} onClick={print}>
        {busy ? "Preparing the card…" : "Print ID card"}
      </button>
      <button className={`${btn.secondary} w-full`} onClick={onAnother} disabled={busy}>
        New patient
      </button>
    </section>
  );
}
