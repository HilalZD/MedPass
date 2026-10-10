"use client";

// Optional patient photo for the card: take one with the front camera or upload.
// Shrunk in the browser to 300x400, < 50 KB. A consent tick is required.
// The photo is never sent to the AI and never goes inside the QR.

import { useState } from "react";
import { resizePhoto } from "@/lib/image";
import { btn } from "./ui";

export type PhotoValue = { photo: string | null; consent: boolean };

export default function PhotoField({ value, onChange }: { value: PhotoValue; onChange: (v: PhotoValue) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      onChange({ photo: await resizePhoto(file), consent: false }); // consent again for every new photo
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-white p-3">
      <span className="text-lg font-medium">
        Photo on the card (optional) · <span lang="ar">صورة على البطاقة (اختياري)</span>
      </span>
      <div className="flex items-start gap-3">
        <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-brand bg-mint">
          {value.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.photo} alt="Patient photo" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-sm text-muted">No photo</span>
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
          {value.photo && (
            <button type="button" className={btn.danger} onClick={() => onChange({ photo: null, consent: false })}>
              Remove photo
            </button>
          )}
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
              يوافق المريض على طباعة صورته على بطاقته.
            </span>
          </span>
        </label>
      )}
      {error && <p className="rounded-xl bg-red-100 p-3 text-base text-red-900">{error}</p>}
    </div>
  );
}
