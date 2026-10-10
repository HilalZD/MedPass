"use client";

// Read-only view of a decrypted card snapshot. Medications go through
// <DrugInfo> using the bundled MoPH list (no network beyond /drugs.json,
// which the offline cache serves).

import { useEffect, useMemo, useState } from "react";
import DrugInfo from "@/components/DrugInfo";
import { createMatcher, loadDrugs, type DrugRow } from "@/lib/match";
import type { MedPassRecord, Verified } from "@/lib/types";
import type { Lang, Strings } from "./strings";

export default function RecordView({ record, lang, t }: { record: MedPassRecord; lang: Lang; t: Strings }) {
  const [drugs, setDrugs] = useState<DrugRow[] | null>(null);
  const [drugsFailed, setDrugsFailed] = useState(false);
  useEffect(() => {
    loadDrugs().then(setDrugs, () => setDrugsFailed(true));
  }, []);
  const matcher = useMemo(() => (drugs ? createMatcher(drugs) : null), [drugs]);

  const badge = (v: Verified) => (
    <span className={`text-sm ${v === "clinician" ? "text-green-800" : "text-gray-500"}`}>
      {v === "clinician" ? `✓ ${t.clinicianVerified}` : t.patientReported}
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
        {record.patient.sex && (
          <>
            <dt className="text-gray-600">{t.sex}</dt>
            <dd>{record.patient.sex === "F" ? t.female : t.male}</dd>
          </>
        )}
        <dt className="text-gray-600">{t.updated}</dt>
        <dd dir="ltr" className="text-start">{record.updated}</dd>
      </dl>

      <Section title={t.conditions} empty={record.conditions.length === 0} t={t}>
        {record.conditions.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-lg">
            <bdi className="font-semibold">{c.name}</bdi>
            {badge(c.verified)}
          </li>
        ))}
      </Section>

      <Section title={t.meds} empty={record.meds.length === 0} t={t}>
        {!matcher && <li className="py-2 text-gray-500">{drugsFailed ? t.drugsFailed : t.drugsLoading}</li>}
        {record.meds.map((med, i) => {
          const match = matcher ? matcher.matchMed(med) : null;
          return (
            <li key={i} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-lg">
                <bdi className="font-semibold">
                  {med.name} {med.strength}
                  {med.frequency && <span className="font-normal text-gray-700"> · {med.frequency}</span>}
                </bdi>
                {badge(med.verified)}
              </div>
              {matcher && (
                <DrugInfo med={med} match={match} alternatives={match ? matcher.alternatives(match.drug) : []} lang={lang} />
              )}
            </li>
          );
        })}
      </Section>

      <Section title={t.referrals} empty={record.referrals.length === 0} t={t}>
        {record.referrals.map((r, i) => (
          <li key={i} className="py-2 text-lg">
            <bdi className="font-semibold">{r.to}</bdi> <span className="text-gray-600">({r.status === "open" ? t.open : t.done})</span>
            {r.reason && (
              <p className="text-gray-700">
                <bdi>{r.reason}</bdi>
              </p>
            )}
          </li>
        ))}
      </Section>

      <Section title={t.visits} empty={record.visits.length === 0} t={t}>
        {record.visits.map((v, i) => (
          <li key={i} className="py-2 text-lg">
            <span dir="ltr" className="font-semibold">{v.date}</span> · <bdi>{v.place}</bdi>
            <p className="text-gray-700">
              <bdi>{v.note}</bdi>
            </p>
          </li>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, t, children }: { title: string; empty: boolean; t: Strings; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="border-b-2 border-gray-900 pb-1 text-xl font-bold">{title}</h2>
      {empty ? <p className="py-2 text-lg text-gray-500">{t.none}</p> : <ul className="divide-y divide-gray-200">{children}</ul>}
    </section>
  );
}
