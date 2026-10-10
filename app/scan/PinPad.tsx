"use client";

// Big 6-digit PIN pad. Submits automatically when the 6th digit is entered.
// The PIN only lives in this component's memory; it is never stored.

import { useState } from "react";
import type { Strings } from "./strings";

const LENGTH = 6;

export default function PinPad({ onSubmit, disabled, t }: { onSubmit: (pin: string) => void; disabled: boolean; t: Strings }) {
  const [pin, setPin] = useState("");

  function press(digit: string) {
    if (disabled || pin.length >= LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === LENGTH) {
      onSubmit(next);
      setPin(""); // ready for another try if it was wrong
    }
  }

  const key = "flex h-16 items-center justify-center rounded-2xl border-2 border-gray-300 bg-white text-3xl font-semibold active:bg-gray-200 disabled:opacity-40";

  return (
    <section className="flex flex-col items-center gap-4">
      <h2 className="text-center text-xl font-bold">{t.pinTitle}</h2>
      <div className="flex gap-3" dir="ltr" aria-label={`${pin.length} / ${LENGTH}`}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 border-gray-900 ${i < pin.length ? "bg-gray-900" : ""}`} />
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} disabled={disabled} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={`${key} text-lg`} disabled={disabled || !pin} onClick={() => setPin("")}>
          {t.clear}
        </button>
        <button type="button" className={key} disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className={`${key} text-lg`} disabled={disabled || !pin} onClick={() => setPin(pin.slice(0, -1))}>
          ⌫ <span className="sr-only">{t.back}</span>
        </button>
      </div>
    </section>
  );
}
