"use client";

// Developer test page for the AI extraction step: /dev/extract
// Pick or take 1–3 photos, send them to /api/extract, look at the result.

import { useState } from "react";
import type { MedPassRecord, Status } from "@/lib/types";
import { resizeImage } from "@/app/onboard/resize";

const MAX_PHOTOS = 3;

const statusStyle: Record<Status, string> = {
  green: "bg-green-100 border-green-500 text-green-900",
  yellow: "bg-yellow-100 border-yellow-500 text-yellow-900",
  unreadable: "bg-gray-200 border-gray-500 text-gray-700",
};

export default function DevExtractPage() {
  const [photos, setPhotos] = useState<string[]>([]); // resized data URLs
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<MedPassRecord | null>(null);
  const [seconds, setSeconds] = useState(0);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Only ${MAX_PHOTOS} photos at a time.`);
    try {
      const resized = await Promise.all(picked.map(resizeImage));
      setPhotos((p) => [...p, ...resized].slice(0, MAX_PHOTOS));
    } catch {
      setError("Could not open one of the photos. Try a JPEG or PNG.");
    }
  }

  async function readPapers() {
    setLoading(true);
    setError("");
    setRecord(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos }),
      });
      const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`);
      setRecord(data.record);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSeconds(Math.round((Date.now() - started) / 1000));
      setLoading(false);
    }
  }

  // Approximate upload size, to check we stay under Vercel's 4.5 MB limit.
  const uploadKB = Math.round(photos.reduce((n, p) => n + p.length, 0) / 1024);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 space-y-6">
      <h1 className="text-2xl font-bold">Dev: AI extraction test</h1>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer rounded-lg bg-blue-600 px-5 py-3 text-lg font-semibold text-white">
            Choose photos
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={photos.length >= MAX_PHOTOS || loading}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg bg-blue-600 px-5 py-3 text-lg font-semibold text-white">
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={photos.length >= MAX_PHOTOS || loading}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {photos.length > 0 && (
            <button
              className="rounded-lg border px-5 py-3 text-lg"
              disabled={loading}
              onClick={() => {
                setPhotos([]);
                setRecord(null);
                setError("");
              }}
            >
              Clear
            </button>
          )}
        </div>

        {photos.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Paper ${i + 1}`} className="w-full rounded border object-contain" />
              ))}
            </div>
            <p className="text-sm text-gray-600">
              {photos.length} / {MAX_PHOTOS} photos, about {uploadKB} KB to upload
            </p>
          </>
        )}
      </section>

      <button
        className="w-full rounded-lg bg-green-700 px-5 py-4 text-xl font-bold text-white disabled:opacity-40"
        disabled={photos.length === 0 || loading}
        onClick={readPapers}
      >
        {loading ? "Reading papers…" : "Read papers"}
      </button>

      {loading && (
        <p className="text-center text-gray-600">This can take 10 to 40 seconds. Please wait.</p>
      )}

      {error && <p className="rounded-lg border border-red-500 bg-red-50 p-3 text-red-800">{error}</p>}

      {record && (
        <section className="space-y-4">
          <p className="text-sm text-gray-600">Done in {seconds} s</p>

          <h2 className="text-xl font-semibold">Medicines ({record.meds.length})</h2>
          <ul className="space-y-2">
            {record.meds.map((m, i) => (
              <li key={i} className={`rounded-lg border-l-8 p-3 ${statusStyle[m.status]}`}>
                <div className="font-semibold">
                  {m.name} {m.strength} {m.frequency && `· ${m.frequency}`}
                  <span className="ml-2 text-xs uppercase">[{m.status}]</span>
                </div>
                {m.ingredient && <div className="text-sm">Ingredient: {m.ingredient}</div>}
                <div className="mt-1 font-mono text-sm" dir="auto">
                  On paper: {m.raw}
                </div>
              </li>
            ))}
          </ul>

          <h2 className="text-xl font-semibold">Full JSON</h2>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100" dir="auto">
            {JSON.stringify(record, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
