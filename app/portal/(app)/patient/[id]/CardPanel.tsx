"use client";

// "Save & print updated card" and "Reissue lost card".
// Both: unsaved changes are saved FIRST (nothing is printed if that fails)
// → card-size check (fitRecord + meter + dropped-visits confirmation)
// → card_version + 1 on the server ("reissue" log entry with the reason)
// → encrypt with the PIN from memory → sessionStorage "medpass:print" → /print.
// Only the encrypted payload goes to /print: never the record or the PIN.
// The MedPass ID never changes; only the card version goes up.
// The card photo is never stored, so it is asked again before every print
// (take / upload with consent, or "No photo" with a reason).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRINT_KEY, setPrintExtra } from "@/components/MedPassCard";
import { encode, fitRecord } from "@/lib/card";
import type { MedPassRecord } from "@/lib/types";
import CardMeter, { cardIsFull } from "../../new/CardMeter";
import PhotoField, { EMPTY_PHOTO, photoDecided, type PhotoValue } from "../../new/PhotoField";
import { btn, ErrorBox, networkErrorMessage, portalFetch } from "../../new/ui";
import { PinGate, type LockReason, type Payload } from "./PatientView";

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
  onLock: (why?: LockReason) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [okDropped, setOkDropped] = useState(false);
  const [okLost, setOkLost] = useState(false);
  const [photo, setPhoto] = useState<PhotoValue>(EMPTY_PHOTO); // browser memory only
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
    setPhoto(EMPTY_PHOTO);
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
      const res = await portalFetch(`/api/portal/patients/${encodeURIComponent(id)}/reissue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardVersion: data.cardVersion, reason: mode === "lost" ? "lost" : "update" }),
      });
      const body = await res.json();
      if (res.status === 403 && body.needPin) return onLock("expired");
      if (!res.ok) throw new Error(body.error ?? "Could not issue the new card.");
      setData(body);

      const fitted = fitRecord(body.record);
      const payload = await encode(fitted.record, pin); // about a second: strong PIN protection
      sessionStorage.setItem(PRINT_KEY, payload);
      // Printed on the card but not inside the QR: Arabic name and sex. Never the PIN.
      const printed = body.record as MedPassRecord;
      setPrintExtra({ nameAr: printed.patient.nameAr, sex: printed.patient.sex, photo: photo.photo && photo.consent ? photo.photo : undefined });
      router.push("/print");
    } catch (e) {
      setError(e instanceof Error ? e.message : networkErrorMessage());
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
    !photoDecided(photo) ||
    (dirty && !canSave);

  return (
    <section className="flex flex-col gap-4 rounded-xl border-2 border-brand p-4">
      <h2 className="text-xl font-semibold">{mode === "update" ? "Print updated card" : "Reissue lost card"}</h2>
      {dirty && <p className="text-lg font-semibold text-brand-dark">Your unsaved changes will be saved first.</p>}
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
      <PhotoField value={photo} onChange={setPhoto} />

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
