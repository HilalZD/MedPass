// Small hint in demo mode: which card to try.
//   <DemoHint />            → the fictional demo patient (Fatima), used on /scan
//   <DemoHint card="own" /> → Hilal's own card (his choice, for the jury demo), used on /me

import { DEMO_MODE, DEMO_OWN_CARD, DEMO_PATIENT } from "@/lib/demo";

export default function DemoHint({ card = "demo" }: { card?: "demo" | "own" }) {
  if (!DEMO_MODE) return null;
  const c = card === "own" ? DEMO_OWN_CARD : DEMO_PATIENT;
  return (
    <p className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-center text-base text-amber-950" lang="en" dir="ltr">
      Demo card: <span className="font-mono font-semibold">{c.id}</span> · PIN <span className="font-mono font-semibold">{c.pin}</span>
      <span className="block text-sm">
        ({c.name}
        {card === "demo" ? ", fictional" : ""})
      </span>
    </p>
  );
}
