// The demo-card hint, identical on /me and /scan (demo mode only).
// All values come from DEMO_CARD in lib/demo.ts. English only, always ONE line:
// the full text from "sm" width up, a shorter version on phones.

import { DEMO_CARD, DEMO_MODE } from "@/lib/demo";

export default function DemoHint() {
  if (!DEMO_MODE) return null;
  const { id, pin, name } = DEMO_CARD;
  const idPin = (
    <>
      <span className="font-mono font-semibold">{id}</span> · PIN <span className="font-mono font-semibold">{pin}</span>
    </>
  );
  return (
    <p
      lang="en"
      dir="ltr"
      role="note"
      className="overflow-hidden whitespace-nowrap rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950 sm:text-base"
    >
      <span className="sm:hidden">Demo: {idPin}</span>
      <span className="hidden sm:inline">
        Demo card: {idPin} ({name}, demo data)
      </span>
    </p>
  );
}
