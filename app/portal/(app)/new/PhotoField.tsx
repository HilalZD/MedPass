"use client";

// Card photo decision, required before going on: either take/upload a photo
// (with the patient's consent) or tap "No photo" and say why. No silent skip.
//
// The photo is shrunk in the browser to about 300 px and ONLY handed to the
// print page (setPrintExtra). It is never uploaded, never saved on our server,
// never put in the QR or the record, and never sent to the AI.

import { useState } from "react";
import { resizePhoto } from "@/lib/image";
import { btn } from "./ui";

export type NoPhotoReason = "refused" | "no_camera" | "later";
export type PhotoValue = { photo: string | null; consent: boolean; noPhoto: NoPhotoReason | null };

export const EMPTY_PHOTO: PhotoValue = { photo: null, consent: false, noPhoto: null };

// Decided = a photo with consent, or "No photo" with a reason.
export const photoDecided = (v: PhotoValue) => (v.photo ? v.consent : v.noPhoto !== null);

const REASONS: { value: NoPhotoReason; en: string; ar: string }[] = [
  { value: "refused", en: "Patient refused", ar: "المريض رفض" },
  { value: "no_camera", en: "No camera available", ar: "لا توجد كاميرا" },
  { value: "later", en: "Add a photo later", ar: "إضافة صورة لاحقاً" },
];

export default function PhotoField({ value, onChange }: { value: PhotoValue; onChange: (v: PhotoValue) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choosingNo, setChoosingNo] = useState(value.noPhoto !== null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      // A new photo always needs a fresh consent tick.
      onChange({ photo: await resizePhoto(file), consent: false, noPhoto: null });
      setChoosingNo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this photo.");
    } finally {
      setBusy(false);
    }
  }

  const decided = photoDecided(value);

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border-2 bg-white p-3 ${decided ? "border-line" : "border-yellow-500"}`}>
      <span className="text-lg font-medium">
        Photo on the card · <span lang="ar">صورة على البطاقة</span>
      </span>

      <div className="flex items-start gap-3">
        <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-brand bg-mint">
          {value.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.photo} alt="Patient photo" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-sm text-muted">{value.noPhoto ? "Empty frame" : "No photo yet"}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label className={`${btn.small} cursor-pointer text-center ${busy ? "pointer-events-none opacity-40" : ""}`}>
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className={`${btn.small} cursor-pointer text-center ${busy ? "pointer-events-none opacity-40" : ""}`}>
            Upload photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className={`${btn.small} ${choosingNo ? "border-brand bg-brand-50" : ""}`}
            onClick={() => {
              setChoosingNo(true);
              onChange({ photo: null, consent: false, noPhoto: value.noPhoto });
            }}
          >
            No photo · <span lang="ar">بدون صورة</span>
          </button>
        </div>
      </div>

      {value.photo && (
        <label
          className={`flex items-start gap-3 rounded-xl p-3 text-lg ${value.consent ? "bg-brand-50" : "border-2 border-yellow-500 bg-yellow-50"}`}
        >
          <input
            type="checkbox"
            className="mt-1 h-6 w-6 shrink-0"
            checked={value.consent}
            onChange={(e) => onChange({ ...value, consent: e.target.checked })}
          />
          <span>
            The patient agrees to have their photo printed on their card.
            <span lang="ar" dir="rtl" className="block text-base text-muted">
              يوافق المريض على طباعة صورته على البطاقة.
            </span>
          </span>
        </label>
      )}

      {!value.photo && choosingNo && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Why no photo? · لماذا بدون صورة؟</legend>
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 text-lg ${value.noPhoto === r.value ? "border-brand bg-brand-50" : "border-line"}`}
            >
              <input
                type="radio"
                name="no-photo-reason"
                className="h-5 w-5"
                checked={value.noPhoto === r.value}
                onChange={() => onChange({ photo: null, consent: false, noPhoto: r.value })}
              />
              <span>
                {r.en} · <span lang="ar">{r.ar}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {!decided && (
        <p className="text-base font-semibold text-yellow-900">
          Take or upload a photo (with consent), or choose &quot;No photo&quot; and a reason.
          <span lang="ar" dir="rtl" className="block">
            التقط أو حمّل صورة (بموافقة المريض)، أو اختر &quot;بدون صورة&quot; وسبباً.
          </span>
        </p>
      )}
      <p className="text-sm text-muted">Printed on the card only. Never uploaded or stored.</p>
      {error && <p className="rounded-xl bg-red-100 p-3 text-base text-red-900">{error}</p>}
    </div>
  );
}
