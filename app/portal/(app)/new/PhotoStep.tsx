"use client";

// Step 1: photograph the old papers (1 to 3), then let the AI read them.
// Photos stay in this browser tab only: they are sent to /api/extract to be
// read and are never stored anywhere.

import { useRef, useState } from "react";
import { Bi } from "@/components/Bi";
import type { ExtractedDraft } from "@/lib/extract";
import { BLURRY_BELOW, photoSharpness, resizeImage } from "@/lib/image";
import { networkErrorMessage, portalFetch, ErrorBox, btn } from "./ui";

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
  const [slow, setSlow] = useState(false); // the AI is taking longer than usual
  const [blurry, setBlurry] = useState<Record<string, boolean>>({}); // photo → looks blurry/dark
  const abort = useRef<AbortController | null>(null);

  // Check each new photo's sharpness; a blurry or dark one gets a "retake" hint.
  async function markBlurry(srcs: string[]) {
    const scores = await Promise.all(srcs.map((s) => photoSharpness(s).catch(() => Infinity)));
    setBlurry((b) => ({ ...b, ...Object.fromEntries(srcs.map((s, i) => [s, scores[i] < BLURRY_BELOW])) }));
  }

  async function addFiles(files: File[]) {
    setError("");
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(`Only ${MAX_PHOTOS} papers at a time.`);
    try {
      const resized = await Promise.all(files.slice(0, room).map(resizeImage));
      setPhotos([...photos, ...resized].slice(0, MAX_PHOTOS));
      markBlurry(resized);
    } catch {
      setError("Could not open one of the photos. Try a JPEG or PNG.");
    }
  }

  async function loadSamples() {
    setError("");
    try {
      const files = await Promise.all(
        [1, 2, 3].map(async (n) => {
          const res = await portalFetch(`/api/portal/sample-papers/${n}`);
          if (!res.ok) throw new Error();
          return new File([await res.blob()], `paper-${n}.jpg`, { type: "image/jpeg" });
        }),
      );
      const resized = await Promise.all(files.map(resizeImage));
      setPhotos(resized);
      markBlurry(resized);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not load the sample papers.");
    }
  }

  async function read() {
    setLoading(true);
    setSlow(false);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    // Usually 10–20 s. After 25 s say so, and offer to type the medicines instead.
    const slowTimer = setTimeout(() => setSlow(true), 25_000);
    // The server always answers within 60 s; give up a little after that.
    const giveUp = setTimeout(() => controller.abort(), 70_000);
    try {
      const res = await portalFetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI could not read the papers. Try again, or enter the medicines by hand.");
      onRead(data.record, data.warnings ?? []);
    } catch (e) {
      if (controller.signal.aborted) {
        setError(abort.current === controller ? "The AI is too slow right now. Try again in a minute, or enter the medicines by hand." : "");
      } else {
        setError(e instanceof Error && e.message ? e.message : networkErrorMessage());
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(giveUp);
      setLoading(false);
      setSlow(false);
    }
  }

  // Stop waiting for the AI and type the medicines by hand.
  function enterByHand() {
    if (abort.current) {
      const c = abort.current;
      abort.current = null; // so the aborted request doesn't show an error
      c.abort();
    }
    onRead(emptyDraft(), []);
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
              <figcaption className="flex flex-col gap-1 text-base">
                <span>Paper {i + 1}</span>
                {blurry[src] && (
                  <Bi
                    en="Looks blurry. Retake it in better light."
                    ar="الصورة غير واضحة. أعد التصوير بإضاءة أفضل."
                    className="rounded-lg bg-amber-100 px-2 py-1 text-sm text-amber-950"
                  />
                )}
                <button
                  className="min-h-11 rounded-lg border-2 border-red-300 bg-white px-2 text-base font-semibold text-red-800"
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

      {slow && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-lg text-amber-950">
          <Bi
            as="p"
            en="The AI is slower than usual. You can keep waiting, or type the medicines yourself."
            ar="الذكاء الاصطناعي أبطأ من المعتاد. يمكنك الانتظار أو إدخال الأدوية بنفسك."
          />
          <button className={btn.secondary} onClick={enterByHand}>
            Enter by hand instead
          </button>
        </div>
      )}
      {error && !loading && photos.length > 0 && (
        <button className={btn.secondary} onClick={enterByHand}>
          Enter the medicines by hand instead
        </button>
      )}

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
