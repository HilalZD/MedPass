"use client";

// Step 1: photograph the old papers (1 to 3), then let the AI read them.
// Photos stay in this browser tab only: they are sent to /api/extract to be
// read and are never stored anywhere.

import { useState } from "react";
import type { ExtractedDraft } from "@/lib/extract";
import { resizeImage } from "@/lib/image";
import { ErrorBox, btn } from "./ui";

const MAX_PHOTOS = 3;

export function emptyDraft(): ExtractedDraft {
  return {
    patient: { name: "" },
    emergency: { allergies: [], critical: [] },
    conditions: [],
    meds: [],
    referrals: [],
    visits: [],
    updated: new Date().toISOString().slice(0, 10),
  };
}

export default function PhotoStep({
  photos,
  setPhotos,
  onRead,
}: {
  photos: string[];
  setPhotos: (p: string[]) => void;
  onRead: (draft: ExtractedDraft, warnings: string[]) => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function addFiles(files: File[]) {
    setError("");
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(`Only ${MAX_PHOTOS} papers at a time.`);
    try {
      const resized = await Promise.all(files.slice(0, room).map(resizeImage));
      setPhotos([...photos, ...resized].slice(0, MAX_PHOTOS));
    } catch {
      setError("Could not open one of the photos. Try a JPEG or PNG.");
    }
  }

  async function loadSamples() {
    setError("");
    try {
      const files = await Promise.all(
        [1, 2, 3].map(async (n) => {
          const res = await fetch(`/api/portal/sample-papers/${n}`);
          if (!res.ok) throw new Error();
          return new File([await res.blob()], `paper-${n}.jpg`, { type: "image/jpeg" });
        }),
      );
      setPhotos(await Promise.all(files.map(resizeImage)));
    } catch {
      setError("Could not load the sample papers.");
    }
  }

  async function read() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos }),
      });
      const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`);
      onRead(data.record, data.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No internet connection. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">1. Photograph the old papers</h1>
      <p className="text-lg text-gray-700">
        Prescriptions, discharge notes, lab letters. Up to 3 papers, one photo each. Photos are never stored.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className={`${btn.primary} cursor-pointer text-center ${full || loading ? "pointer-events-none opacity-40" : ""}`}>
          Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <label className={`${btn.secondary} cursor-pointer text-center ${full || loading ? "pointer-events-none opacity-40" : ""}`}>
          Choose photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <figure key={i} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Paper ${i + 1}`} className="aspect-square w-full rounded-lg border object-cover" />
              <figcaption className="flex items-center justify-between text-base">
                Paper {i + 1}
                <button
                  className="text-red-700 underline"
                  disabled={loading}
                  onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      <button className={btn.primary} disabled={photos.length === 0 || loading} onClick={read}>
        {loading ? "Reading the papers… (10 to 30 seconds)" : `Read ${photos.length || ""} paper${photos.length === 1 ? "" : "s"}`}
      </button>

      <div className="flex flex-wrap gap-3 border-t-2 border-gray-200 pt-4">
        <button className={btn.secondary} disabled={loading} onClick={loadSamples}>
          Try with sample papers
        </button>
        <button className={btn.secondary} disabled={loading} onClick={() => onRead(emptyDraft(), [])}>
          No papers: enter by hand
        </button>
      </div>
    </section>
  );
}
