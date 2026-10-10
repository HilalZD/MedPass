// The card's public part: shown immediately after a scan, before any PIN.
// It is labelled "Not yet verified" until decode() succeeds with the PIN,
// because anyone could print a card with made-up emergency text.

import type { Emergency } from "@/lib/card";
import type { Strings } from "./strings";

export default function EmergencyPanel({ em, verified, t }: { em: Emergency; verified: boolean; t: Strings }) {
  return (
    <section className="rounded-2xl border-4 border-red-700 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-red-800">{t.emergency}</h2>
        {verified ? (
          <span className="rounded-full bg-green-700 px-3 py-1 text-base font-semibold text-white">✓ {t.verified}</span>
        ) : (
          <span className="rounded-full bg-yellow-300 px-3 py-1 text-base font-semibold text-yellow-950">{t.notVerified}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-600">{verified ? t.verifiedHelp : t.notVerifiedHelp}</p>

      <p className="mt-3 text-2xl font-bold">
        <bdi>{em.name}</bdi>
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
        {em.dateOfBirth && (
          <>
            <dt className="text-gray-600">{t.dob}</dt>
            <dd dir="ltr" className="text-start">{em.dateOfBirth}</dd>
          </>
        )}
        <dt className="text-gray-600">{t.blood}</dt>
        {em.bloodType ? (
          <dd dir="ltr" className="text-start text-2xl font-bold">{em.bloodType}</dd>
        ) : (
          <dd>{t.bloodUnknown}</dd>
        )}
        <dt className="text-gray-600">{t.id}</dt>
        <dd dir="ltr" className="text-start font-mono">{em.id}</dd>
        <dt className="text-gray-600">{t.cardVersion}</dt>
        <dd dir="ltr" className="text-start">{em.cardVersion}</dd>
      </dl>

      <List title={t.allergies} items={em.allergies} empty={t.none} />
      <List title={t.critical} items={em.critical} empty={t.none} />
    </section>
  );
}

function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="mt-3">
      <h3 className="text-lg font-semibold text-red-800">{title}</h3>
      {items.length === 0 ? (
        <p className="text-lg text-gray-600">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((item, i) => (
            <li key={i} className="rounded-lg bg-red-50 px-3 py-2 text-xl font-bold text-red-900">
              <bdi>{item}</bdi>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
