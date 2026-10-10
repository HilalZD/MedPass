"use client";

// "Save & print updated card" and "Reissue lost card".
// Both: unsaved changes are saved FIRST (nothing is printed if that fails)
// → card-size check (fitRecord + meter + dropped-visits confirmation)
// → card_version + 1 on the server ("reissue" log entry with the reason)
// → encrypt with the PIN from memory → sessionStorage "medpass:print" → /print.
// Only the encrypted payload goes to /print: never the record or the PIN.
// The MedPass ID never changes; only the card version goes up.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { encode, fitRecord } from "@/lib/card";
import type { MedPassRecord } from "@/lib/types";
import CardMeter, { cardIsFull } from "../../new/CardMeter";
import { ErrorBox, btn } from "../../new/ui";
import { PinGate, type Payload } from "./PatientView";

type Mode = "update" | "lost";

export default function CardPanel({
  id,
  data,
  setData,
  record,
  dirty,
  canSave,
  save,
  pin,
  setPin,
  onLock,
}: {
  id: string;
  data: Payload;
  setData: (d: Payload) => void;
  record: MedPassRecord; // the record as it will be printed (including unsaved changes)
  dirty: boolean;
  canSave: boolean;
  save: () => Promise<boolean>; // true only if the save worked
  pin: string | null;
  setPin: (p: string) => void;
  onLock: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [okDropped, setOkDropped] = useState(false);
  const [okLost, setOkLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Size check on the card as it WILL be printed (unsaved changes, next card version).
  const fit = useMemo(() => {
    try {
      return fitRecord({ ...record, cardVersion: data.cardVersion + 1 });
    } catch {
      return null;
    }
  }, [record, data.cardVersion]);

  const close = () => {
    setMode(null);
    setOkDropped(false);
    setOkLost(false);
    setError("");
  };

  async function print() {
    if (!pin || !mode) return;
    setBusy(true);
    setError("");
    try {
      // 1. Save first. If the save fails, stop: never print a card with unsaved data.
      if (dirty && !(await save())) {
        setError("The changes were not saved, so no card was printed. Fix the problem shown above and try again.");
        setBusy(false);
        return;
      }
      // 2. New card version (same MedPass ID), logged with the reason.
      const res = await fetch(`/api/portal/patients/${encodeURIComponent(id)}/reissue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardVersion: data.cardVersion, reason: mode === "lost" ? "lost" : "update" }),
      });
      const body = await res.json();
      if (res.status === 403 && body.needPin) return onLock();
      if (!res.ok) throw new Error(body.error ?? "Could not issue the new card.");
      setData(body);

      const fitted = fitRecord(body.record);
      const payload = await encode(fitted.record, pin); // about a second: strong PIN protection
      sessionStorage.setItem("medpass:print", payload);
      router.push("/print");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No internet connection.");
      setBusy(false);
    }
  }

  if (!mode) {
    return (
      <section className="flex flex-col gap-3 border-t-2 border-gray-200 pt-4">
        <h2 className="text-xl font-semibold">ID card</h2>
        {dirty && !canSave && <p className="text-lg text-yellow-900">Finish checking the record above before printing.</p>}
        <button className={btn.primary} disabled={dirty && !canSave} onClick={() => setMode("update")}>
          {dirty ? "Save & print updated card" : "Print updated card"}
        </button>
        <button className={btn.secondary} disabled={dirty && !canSave} onClick={() => setMode("lost")}>
          {dirty ? "Save & reissue lost card" : "Reissue lost card"}
        </button>
      </section>
    );
  }

  const blocked =
    !fit ||
    cardIsFull(fit) ||
    (fit.droppedVisits.length > 0 && !okDropped) ||
    (mode === "lost" && !okLost) ||
    !pin ||
    (dirty && !canSave);

  return (
    <section className="flex flex-col gap-4 rounded-xl border-2 border-blue-600 p-4">
      <h2 className="text-xl font-semibold">{mode === "update" ? "Print updated card" : "Reissue lost card"}</h2>
      {dirty && <p className="text-lg font-semibold text-blue-900">Your unsaved changes will be saved first.</p>}
      <p className="text-lg">
        This will be card {data.cardVersion + 1}. Card {data.cardVersion} and older will show &quot;This card was replaced&quot;
        when scanned online. They still work offline with the PIN.
      </p>

      {fit ? <CardMeter fit={fit} /> : <ErrorBox>Could not check the card size.</ErrorBox>}
      {fit && !cardIsFull(fit) && fit.droppedVisits.length > 0 && (
        <label className="flex items-center gap-3 text-lg">
          <input type="checkbox" className="h-6 w-6" checked={okDropped} onChange={(e) => setOkDropped(e.target.checked)} />
          OK, print without these visits
        </label>
      )}
      {mode === "lost" && (
        <label className="flex items-center gap-3 text-lg">
          <input type="checkbox" className="h-6 w-6" checked={okLost} onChange={(e) => setOkLost(e.target.checked)} />
          The patient lost card {data.cardVersion}. When it is scanned online it will show &quot;This card was replaced&quot;.
        </label>
      )}

      {!pin && (
        <PinGate
          id={id}
          title="PIN needed to print"
          note="The page was reloaded, so ask the patient to type their PIN again. The new card is locked with it."
          onOpen={(fresh, typed) => {
            setData(fresh);
            setPin(typed);
          }}
        />
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid grid-cols-3 gap-3">
        <button className={btn.secondary} onClick={close} disabled={busy}>
          Cancel
        </button>
        <button className={`${btn.primary} col-span-2`} disabled={blocked || busy} onClick={print}>
          {busy ? "Preparing the card…" : dirty ? "Save & print card" : "Print card"}
        </button>
      </div>
    </section>
  );
}
