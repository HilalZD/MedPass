// Small hint on /me and /scan in demo mode: which fictional card to try.

import { DEMO_MODE, DEMO_PATIENT } from "@/lib/demo";

export default function DemoHint() {
  if (!DEMO_MODE) return null;
  return (
    <p className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-center text-base text-amber-950" dir="ltr">
      Demo card: <span className="font-mono font-semibold">{DEMO_PATIENT.id}</span> · PIN{" "}
      <span className="font-mono font-semibold">{DEMO_PATIENT.pin}</span>
      <span className="block text-sm">({DEMO_PATIENT.name}, fictional)</span>
    </p>
  );
}
