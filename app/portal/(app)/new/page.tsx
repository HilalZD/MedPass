"use client";

// /portal/new: create a patient.
// 1 photos → 2 review → 3 details → 4 PIN + save → 5 done / print.
// Everything (photos, draft, PIN) lives only in this tab's memory until saved.

import { useState } from "react";
import type { ExtractedDraft } from "@/lib/extract";
import type { MedPassRecord } from "@/lib/types";
import DetailsStep, { type Confirmed } from "./DetailsStep";
import DoneStep from "./DoneStep";
import PhotoStep from "./PhotoStep";
import PinStep from "./PinStep";
import ReviewStep from "./ReviewStep";

type Step = "photos" | "review" | "details" | "pin" | "done";
const STEPS: Step[] = ["photos", "review", "details", "pin", "done"];

export default function NewPatientPage() {
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<string[]>([]);
  const [draft, setDraft] = useState<ExtractedDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Confirmed>({ name: false, dob: false });
  const [saved, setSaved] = useState<{ record: MedPassRecord; pin: string } | null>(null);

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo(0, 0);
  };

  function reset() {
    setPhotos([]);
    setDraft(null);
    setWarnings([]);
    setConfirmed({ name: false, dob: false });
    setSaved(null);
    go("photos");
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex gap-1" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`h-2 flex-1 rounded-full ${i <= STEPS.indexOf(step) ? "bg-blue-700" : "bg-gray-200"}`} />
        ))}
      </ol>

      {step === "photos" && (
        <PhotoStep
          photos={photos}
          setPhotos={setPhotos}
          onRead={(d, w) => {
            setDraft(d);
            setWarnings(w);
            setConfirmed({ name: false, dob: false });
            go("review");
          }}
        />
      )}
      {step === "review" && draft && (
        <ReviewStep
          draft={draft}
          setDraft={setDraft}
          warnings={warnings}
          photos={photos}
          onBack={() => go("photos")}
          onNext={() => go("details")}
        />
      )}
      {step === "details" && draft && (
        <DetailsStep
          draft={draft}
          setDraft={setDraft}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          onBack={() => go("review")}
          onNext={() => go("pin")}
        />
      )}
      {step === "pin" && draft && (
        <PinStep
          draft={draft}
          onBack={() => go("details")}
          onSaved={(record, pin) => {
            setSaved({ record, pin });
            setPhotos([]); // not needed any more; never stored
            go("done");
          }}
        />
      )}
      {step === "done" && saved && <DoneStep record={saved.record} pin={saved.pin} onAnother={reset} />}
    </div>
  );
}
