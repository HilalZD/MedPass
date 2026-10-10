"use client";

// Camera QR scanner (html5-qrcode). Calls onScan once with the QR text, then stops.
// Small on purpose: if my teammate's offline scanner component lands on main,
// the portal can switch to it.

import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function Scanner({ onScan }: { onScan: (text: string) => void }) {
  const elementId = `qr-${useId().replace(/:/g, "")}`;
  const [error, setError] = useState("");
  const done = useRef(false);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId, false);
    let running = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text) => {
          if (done.current) return;
          done.current = true;
          onScanRef.current(text);
        },
        undefined,
      )
      .then(() => {
        running = true;
      })
      .catch(() => setError("Could not open the camera. Allow camera access, or type the MedPass ID instead."));

    return () => {
      if (running) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [elementId]);

  return (
    <div className="flex flex-col gap-2">
      <div id={elementId} className="w-full overflow-hidden rounded-xl bg-black" />
      {error && <p className="rounded-xl bg-red-100 p-3 text-lg text-red-900">{error}</p>}
    </div>
  );
}
