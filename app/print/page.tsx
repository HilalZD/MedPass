"use client";

// Prints one MedPass ID card (front + back) on an A4 page at exact ID-card size.
//
// The hospital portal hands the card over through sessionStorage:
//   PRINT_KEY        the encoded card payload ("MP1:...", already encrypted)
//   PRINT_EXTRA_KEY  { nameAr, sex, photo } (printed only, never in the QR)
// Both are read once and removed at once. The PIN never reaches this page.

import { useEffect, useRef, useState } from "react";
import MedPassCard, { PRINT_KEY, takePrintExtra, type PrintExtra } from "@/components/MedPassCard";

// One @page rule, no browser margins; the cards sit 10 mm from the paper edge.
// Cut marks: a thin dashed black line just outside each side of the card.
const PRINT_CSS = `
@page { size: A4; margin: 0; }
.print-sheet { padding: 10mm; }
.print-sheet [data-side] { outline: 0.2mm dashed #000; outline-offset: 1.5mm; }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
  .print-sheet { width: 210mm; min-height: 297mm; box-sizing: border-box; }
}
`;

type Handoff = { payload: string | null; extra: PrintExtra };

export default function PrintPage() {
  const [handoff, setHandoff] = useState<Handoff | null>(null); // null = not read yet
  const [loadingSample, setLoadingSample] = useState(false);
  const read = useRef(false);

  useEffect(() => {
    // React Strict Mode runs effects twice in development; the second read would find nothing.
    if (read.current) return;
    read.current = true;
    let payload: string | null = null;
    try {
      payload = sessionStorage.getItem(PRINT_KEY);
    } catch {
      payload = null;
    }
    const extra = takePrintExtra(); // reads and clears PRINT_EXTRA_KEY
    try {
      sessionStorage.removeItem(PRINT_KEY);
    } catch {
      // storage unavailable: nothing to clear
    }
    setHandoff({ payload, extra });
  }, []);

  // Development only: a fictional sample card so /print can be tried without the portal.
  async function loadSample() {
    setLoadingSample(true);
    try {
      const [{ encode }, sample] = await Promise.all([
        import("@/lib/card"),
        import("@/fixtures/sample-record.json").then((m) => m.default as unknown as import("@/lib/types").MedPassRecord),
      ]);
      const payload = await encode(sample, "123456");
      setHandoff({ payload, extra: { nameAr: sample.patient.nameAr, sex: sample.patient.sex } });
    } finally {
      setLoadingSample(false);
    }
  }

  const button = "min-h-14 rounded-2xl px-6 text-xl font-semibold";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <style>{PRINT_CSS}</style>

      <div className="no-print flex flex-wrap items-center gap-4 p-6">
        {handoff?.payload && (
          <button type="button" onClick={() => window.print()} className={`${button} bg-gray-900 text-white`}>
            Print
          </button>
        )}
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            onClick={loadSample}
            disabled={loadingSample}
            className={`${button} border-2 border-dashed border-orange-600 bg-orange-50 text-orange-900 disabled:opacity-50`}
          >
            Load sample card (Demo only)
          </button>
        )}
      </div>

      {handoff && !handoff.payload && (
        <p className="p-6 text-2xl font-semibold">Nothing to print. Open this from the hospital portal.</p>
      )}

      {handoff?.payload && (
        <div className="print-sheet">
          <MedPassCard payload={handoff.payload} nameAr={handoff.extra.nameAr} sex={handoff.extra.sex} photo={handoff.extra.photo} />
        </div>
      )}
    </main>
  );
}
