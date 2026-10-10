"use client";

// Open a patient: PIN gate → 15-minute unlock → record editor.
// The PIN is kept ONLY in this component's state (needed to encrypt a new card).
// Leaving the page, locking, or the countdown running out forgets it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MedPassRecord } from "@/lib/types";
import { btn, ErrorBox, input, networkErrorMessage, portalFetch } from "../../new/ui";
import RecordEditor from "./RecordEditor";

// Why the record was locked again: the clinician pressed "Lock now", or the
// 15-minute unlock ran out (then the PIN screen says so).
export type LockReason = "manual" | "expired";

export type PatientField = "name" | "nameAr" | "dateOfBirth" | "sex" | "bloodType";
export type ReissueReason = "lost" | "update";

export type LogEntry = { at: string; action: string; facility: string | null; clinician: string | null };

export type Payload = {
  record: MedPassRecord;
  cardVersion: number;
  lastReissueReason: ReissueReason | null;
  updatedAt: string;
  verifiedFields: PatientField[]; // patient details a clinician has checked/changed
  unlockedUntil: number;
  facilityName: string;
  log: LogEntry[];
};

type State =
  | { kind: "loading" }
  | { kind: "notFound"; message: string }
  | { kind: "pin"; cardVersion: number | null; reason: ReissueReason | null }
  | { kind: "open"; data: Payload }
  | { kind: "error"; message: string };

export default function PatientView({ id, scannedCardVersion }: { id: string; scannedCardVersion: number | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pin, setPin] = useState<string | null>(null);
  const [lockNotice, setLockNotice] = useState("");

  // First load: if still unlocked from earlier (e.g. a page refresh), open
  // straight away; otherwise ask for the PIN.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await portalFetch(`/api/portal/patients/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setState({ kind: "open", data });
        else if (res.status === 404) setState({ kind: "notFound", message: data.error });
        else if (res.status === 403) setState({ kind: "pin", cardVersion: data.cardVersion ?? null, reason: data.lastReissueReason ?? null });
        else setState({ kind: "error", message: data.error ?? "Something went wrong." });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: e instanceof Error ? e.message : networkErrorMessage() });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const lock = useCallback(async (why: LockReason = "manual") => {
    setPin(null);
    setLockNotice(
      why === "expired"
        ? "The 15-minute unlock ended, so the record was locked to protect the patient. Ask the patient to type their PIN again. Unsaved changes were not kept."
        : "",
    );
    setState((s) =>
      s.kind === "open"
        ? { kind: "pin", cardVersion: s.data.cardVersion, reason: s.data.lastReissueReason }
        : { kind: "pin", cardVersion: null, reason: null },
    );
    await fetch(`/api/portal/patients/${encodeURIComponent(id)}/unlock`, { method: "DELETE" }).catch(() => {});
  }, [id]);

  if (state.kind === "loading") return <p className="text-lg">Loading…</p>;
  if (state.kind === "notFound" || state.kind === "error") {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBox>{state.message}</ErrorBox>
        <Link href="/portal" className={`${btn.secondary} text-center`}>
          Back to search
        </Link>
      </div>
    );
  }

  const dbCardVersion = state.kind === "open" ? state.data.cardVersion : state.cardVersion;
  const reason = state.kind === "open" ? state.data.lastReissueReason : state.reason;
  const replaced = scannedCardVersion !== null && dbCardVersion !== null && scannedCardVersion < dbCardVersion;
  // Why the scanned card is out of date, from the newest reissue's reason.
  const replacedMessage =
    reason === "lost"
      ? "This card was replaced (reported lost)."
      : reason === "update"
        ? "A newer version of this card exists. Ask the patient for it."
        : "This card was replaced. Ask the patient for their newest card.";

  return (
    <div className="flex flex-col gap-5">
      {replaced && (
        <p className="rounded-xl border-2 border-orange-500 bg-orange-50 p-4 text-lg font-semibold text-orange-900">
          {replacedMessage} (Scanned card {scannedCardVersion}, newest is card {dbCardVersion}.)
        </p>
      )}

      {state.kind === "pin" ? (
        <PinGate
          id={id}
          notice={lockNotice}
          onOpen={(data, typedPin) => {
            setPin(typedPin);
            setLockNotice("");
            setState({ kind: "open", data });
          }}
        />
      ) : (
        <RecordEditor
          id={id}
          data={state.data}
          setData={(data) => setState({ kind: "open", data })}
          pin={pin}
          setPin={setPin}
          onLock={lock}
        />
      )}
    </div>
  );
}

// Ask for the patient's PIN. Also used inside the card panel when the page was
// refreshed (the PIN is not kept across refreshes).
export function PinGate({
  id,
  onOpen,
  title = "Patient's PIN",
  note = "Ask the patient to type their 6-digit PIN.",
  notice = "",
}: {
  id: string;
  onOpen: (data: Payload, pin: string) => void;
  title?: string;
  note?: string;
  notice?: string; // e.g. "the 15-minute unlock ended"
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await portalFetch(`/api/portal/patients/${encodeURIComponent(id)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      onOpen(data, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : networkErrorMessage());
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="font-mono text-xl" dir="ltr">
        {id}
      </p>
      {notice && (
        <p role="status" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-lg text-amber-950">
          {notice}
          <span lang="ar" dir="rtl" className="block">
            انتهت مدة فتح الملف (١٥ دقيقة). اطلب من المريض إدخال رمزه السري مرة أخرى.
          </span>
        </p>
      )}
      <p className="text-lg text-gray-700">{note}</p>
      <input
        className={`${input} text-center font-mono text-3xl tracking-[0.5em]`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        dir="ltr"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      <button className={btn.primary} disabled={value.length !== 6 || busy}>
        {busy ? "Checking…" : "Open record"}
      </button>
    </form>
  );
}
