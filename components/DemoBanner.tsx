// Thin banner on every page in demo mode, so nobody mistakes the demo for real
// patient data. Hidden when printing (it must never end up on a card).

import { DEMO_MODE } from "@/lib/demo";

export default function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-sm font-semibold text-amber-950 print:hidden" role="note">
      Demo environment · fictional patients only ·{" "}
      <span lang="ar" dir="rtl">
        بيئة تجريبية · مرضى وهميون فقط
      </span>
    </div>
  );
}
