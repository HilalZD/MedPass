// The demo-card hint, identical on /me and /scan (demo mode only).
// All values come from DEMO_CARD in lib/demo.ts.

import { DEMO_CARD, DEMO_MODE } from "@/lib/demo";
import { Bi } from "./Bi";

export default function DemoHint() {
  if (!DEMO_MODE) return null;
  const { id, pin, name } = DEMO_CARD;
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-base text-amber-950" role="note">
      <Bi
        center
        className="gap-1"
        en={
          <>
            Demo card: <span className="font-mono font-semibold">{id}</span> · PIN{" "}
            <span className="font-mono font-semibold">{pin}</span> ({name.en}, demo data)
          </>
        }
        ar={
          <>
            بطاقة تجريبية:{" "}
            <bdi dir="ltr" className="font-mono font-semibold">
              {id}
            </bdi>{" "}
            · الرمز{" "}
            <bdi dir="ltr" className="font-mono font-semibold">
              {pin}
            </bdi>{" "}
            ({name.ar}، بيانات تجريبية)
          </>
        }
      />
    </div>
  );
}
