// /portal/patient/MP-XXXX-XXXX[?card=N]
// Reading the URL is request-time data, so it sits inside <Suspense> (Cache Components).
// ?card=N is the card version read from a scanned QR, for the "card was replaced" check.

import { Suspense } from "react";
import PatientView from "./PatientView";

export default function PatientPage({ params, searchParams }: PageProps<"/portal/patient/[id]">) {
  return (
    <Suspense fallback={<p className="text-lg">Loading…</p>}>
      <Inner params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ params, searchParams }: Pick<PageProps<"/portal/patient/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { card } = await searchParams;
  const scanned = Number(Array.isArray(card) ? card[0] : card);
  return <PatientView id={decodeURIComponent(id)} scannedCardVersion={Number.isInteger(scanned) && scanned > 0 ? scanned : null} />;
}
