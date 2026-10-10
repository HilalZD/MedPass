"use client";

// Find a patient: type the MedPass ID printed on the card, or scan the card's QR.
// The scan only reads the public part (MedPass ID + card version); the record
// itself opens on the next page with the patient's PIN.

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { readEmergency } from "@/lib/card";
import { btn, input } from "./new/ui";

// The camera library only works in the browser.
const Scanner = dynamic(() => import("./Scanner"), { ssr: false });

// "mp ab2c3def" → "MP-AB2C-3DEF", or null if it can't be a MedPass ID.
function normalizeId(text: string): string | null {
  const s = text.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^MP/, "");
  return /^[A-Z0-9]{8}$/.test(s) ? `MP-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

export default function Lookup() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  function open(e: React.FormEvent) {
    e.preventDefault();
    const id = normalizeId(text);
    if (!id) return setError("A MedPass ID looks like MP-AB2C-3DEF.");
    router.push(`/portal/patient/${id}`);
  }

  function scanned(payload: string) {
    setScanning(false);
    try {
      const { id, cardVersion } = readEmergency(payload);
      router.push(`/portal/patient/${id}?card=${cardVersion}`);
    } catch {
      setError("This QR code is not a MedPass card.");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Open a patient · فتح ملف مريض</h2>
      <form onSubmit={open} className="flex gap-2">
        <input
          className={`${input} font-mono uppercase`}
          dir="ltr"
          placeholder="MP-XXXX-XXXX"
          autoCapitalize="characters"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
        />
        <button className={btn.primary} type="submit">
          Open
        </button>
      </form>
      {scanning ? (
        <>
          <Scanner onScan={scanned} />
          <button className={btn.secondary} onClick={() => setScanning(false)}>
            Stop scanning
          </button>
        </>
      ) : (
        <button
          className={btn.secondary}
          onClick={() => {
            setError("");
            setScanning(true);
          }}
        >
          Scan the card&apos;s QR code
        </button>
      )}
      {error && <p className="rounded-xl bg-red-100 p-3 text-lg text-red-900">{error}</p>}
    </section>
  );
}
