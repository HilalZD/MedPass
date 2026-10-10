"use client";

// Camera QR reader (html5-qrcode, rear camera, large viewfinder) with a
// photo-upload fallback. Calls onText once with the decoded QR text.
// Everything happens on the device: no image or text is sent anywhere.

import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import type { Strings } from "./strings";

const CONFIG = {
  formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
  // Android Chrome's built-in barcode reader is much better at dense QR codes.
  experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  verbose: false,
};

function cameraError(e: unknown, t: Strings): string {
  const text = String((e as { name?: string })?.name ?? "") + " " + String(e);
  if (typeof window !== "undefined" && !window.isSecureContext) return t.cameraHttps;
  if (/NotAllowed|Permission|denied/i.test(text)) return t.cameraDenied;
  if (/NotFound|no camera|Requested device not found/i.test(text)) return t.cameraNone;
  return t.cameraOther;
}

export default function QrReader({ onText, t }: { onText: (text: string) => void; t: Strings }) {
  const id = useId().replace(/:/g, "");
  const cameraId = `qr-camera-${id}`;
  const fileId = `qr-file-${id}`;
  const [cameraProblem, setCameraProblem] = useState("");
  const [fileProblem, setFileProblem] = useState("");
  const [reading, setReading] = useState(false);
  const done = useRef(false);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // Camera
  useEffect(() => {
    const scanner = new Html5Qrcode(cameraId, CONFIG);
    let running = false;
    let cancelled = false;
    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          // Large square viewfinder: 85% of the shorter side.
          qrbox: (w: number, h: number) => {
            const side = Math.floor(Math.min(w, h) * 0.85);
            return { width: side, height: side };
          },
          aspectRatio: 1,
        },
        (text) => {
          if (done.current) return;
          done.current = true;
          onTextRef.current(text);
        },
        undefined,
      )
      .then(() => {
        running = true;
        if (cancelled) scanner.stop().then(() => scanner.clear()).catch(() => {});
      })
      .catch((e) => {
        if (!cancelled) setCameraProblem(cameraError(e, t));
      });
    return () => {
      cancelled = true;
      if (running) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
    // t only changes the error wording; restarting the camera for it is not worth it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  // Photo upload
  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileProblem("");
    setReading(true);
    const reader = new Html5Qrcode(fileId, CONFIG);
    try {
      const text = await reader.scanFile(file, false);
      if (!done.current) {
        done.current = true;
        onTextRef.current(text);
      }
    } catch {
      setFileProblem(t.unreadable);
    } finally {
      setReading(false);
      reader.clear();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div id={cameraId} className="aspect-square w-full overflow-hidden rounded-2xl bg-black" />
      {cameraProblem && <p className="rounded-xl bg-red-100 p-4 text-lg text-red-900">{cameraProblem}</p>}

      <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-gray-900 bg-white px-4 text-lg font-semibold">
        {reading ? t.reading : t.upload}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = ""; // allow choosing the same photo again
          }}
        />
      </label>
      {fileProblem && <p className="rounded-xl bg-red-100 p-4 text-lg text-red-900">{fileProblem}</p>}
      {/* html5-qrcode needs an element for file scanning; it stays hidden. */}
      <div id={fileId} className="hidden" />
    </div>
  );
}
