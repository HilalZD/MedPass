"use client";

// Offline crisis viewer: scan → emergency info at once (not yet verified)
// → patient's PIN → decrypted snapshot on this device (verified).
// No login, no storage, no network calls (only /drugs.json for drug info,
// and the portal link if the user taps it while online).

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { decode, readEmergency, WRONG_PIN, type Emergency } from "@/lib/card";
import type { MedPassRecord } from "@/lib/types";
import EmergencyPanel from "./EmergencyPanel";
import PinPad from "./PinPad";
import QrReader from "./QrReader";
import RecordView from "./RecordView";
import { T, type Lang } from "./strings";

type Stage =
  | { kind: "scan" }
  | { kind: "not-a-card" }
  | { kind: "locked"; payload: string; em: Emergency; busy: boolean; error: string }
  | { kind: "open"; em: Emergency; record: MedPassRecord };

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => false,
  );
}

export default function ScanPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [stage, setStage] = useState<Stage>({ kind: "scan" });
  const [scanKey, setScanKey] = useState(0); // remounts the camera for "scan another"
  const online = useOnline();
  const t = T[lang];

  function onText(text: string) {
    try {
      const em = readEmergency(text); // no PIN needed
      setStage({ kind: "locked", payload: text, em, busy: false, error: "" });
    } catch {
      setStage({ kind: "not-a-card" });
    }
  }

  async function unlock(pin: string) {
    if (stage.kind !== "locked") return;
    const { payload, em } = stage;
    setStage({ ...stage, busy: true, error: "" });
    try {
      const record = await decode(payload, pin); // ~1-2 s on cheap phones (600k PBKDF2 rounds)
      setStage({ kind: "open", em, record });
    } catch (e) {
      const wrong = e instanceof Error && e.message === WRONG_PIN;
      setStage({ kind: "locked", payload, em, busy: false, error: wrong ? t.wrongPin : t.damaged });
    }
  }

  function again() {
    setStage({ kind: "scan" });
    setScanKey((k) => k + 1);
  }

  const againButton = (
    <button type="button" onClick={again} className="min-h-14 w-full rounded-2xl bg-gray-900 px-4 text-lg font-semibold text-white">
      {t.scanAgain}
    </button>
  );

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto flex w-full max-w-xl flex-col gap-5 bg-gray-50 p-4 text-gray-900">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">MedPass</h1>
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          className="min-h-12 rounded-xl border-2 border-gray-900 bg-white px-4 text-lg font-semibold"
        >
          {t.langSwitch}
        </button>
      </header>

      {stage.kind === "scan" && (
        <>
          <div>
            <h2 className="text-xl font-bold">{t.title}</h2>
            <p className="text-lg text-gray-700">{t.hint}</p>
          </div>
          <QrReader key={scanKey} onText={onText} t={t} />
        </>
      )}

      {stage.kind === "not-a-card" && (
        <>
          <p className="rounded-2xl bg-red-100 p-4 text-xl font-semibold text-red-900">{t.notACard}</p>
          {againButton}
        </>
      )}

      {stage.kind === "locked" && (
        <>
          <EmergencyPanel em={stage.em} verified={false} t={t} />
          {stage.busy ? (
            <div className="flex flex-col items-center gap-3 py-6" role="status">
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
              <p className="text-xl font-semibold">{t.unlocking}</p>
              <p className="text-gray-600">{t.unlockingHelp}</p>
            </div>
          ) : (
            <>
              {stage.error && <p className="rounded-2xl bg-red-100 p-4 text-lg font-semibold text-red-900">{stage.error}</p>}
              <PinPad onSubmit={unlock} disabled={stage.busy} t={t} />
            </>
          )}
          {againButton}
        </>
      )}

      {stage.kind === "open" && (
        <>
          <EmergencyPanel em={stage.em} verified t={t} />
          <RecordView record={stage.record} lang={lang} t={t} />
          {online && (
            <div className="flex flex-col gap-1">
              <Link
                href={`/portal/patient/${encodeURIComponent(stage.record.id)}`}
                className="flex min-h-14 items-center justify-center rounded-2xl border-2 border-gray-900 bg-white px-4 text-lg font-semibold"
              >
                {t.portal}
              </Link>
              <p className="text-center text-sm text-gray-600">{t.portalHelp}</p>
            </div>
          )}
          {againButton}
        </>
      )}
    </main>
  );
}
