"use client";

// "Card X% full" meter, using fitRecord() from lib/card.ts (my teammate's).
// fitRecord drops the OLDEST visits if the QR would be too big; the dropped
// ones are listed so a human confirms. The full record always stays in the database.

import { MAX_QR_VERSION, type FitResult } from "@/lib/card";

export function cardIsFull(fit: FitResult) {
  return fit.qrVersion > MAX_QR_VERSION;
}

export default function CardMeter({ fit }: { fit: FitResult }) {
  const full = cardIsFull(fit);
  const pct = Math.min(fit.fillPercent, 100);
  const color = full ? "bg-red-600" : pct > 85 ? "bg-yellow-500" : "bg-green-600";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-lg font-semibold">
        <span>Card {full ? "is full" : `${fit.fillPercent}% full`}</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {full && (
        <p className="rounded-xl bg-red-100 p-3 text-lg text-red-900">
          Card is full: remove stopped medicines or shorten notes. The full record is still saved online.
        </p>
      )}
      {!full && fit.droppedVisits.length > 0 && (
        <div className="rounded-xl border-2 border-yellow-500 bg-yellow-50 p-3 text-lg">
          <p className="font-semibold">To fit on the card, these older visits will be left off it (they stay in the online record):</p>
          <ul className="list-disc ps-6">
            {fit.droppedVisits.map((v, i) => (
              <li key={i}>
                {v.date} · {v.place} · {v.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
