"use client";

// Shown when the phone loses its connection. Card scanning works offline;
// anything that saves (portal, /me) needs internet.

import Link from "next/link";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  // On the server we can't know, so assume online (no banner flash).
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export const OFFLINE_EN = "You're offline. Scanning still works; saving needs internet.";
export const OFFLINE_AR = "أنت غير متصل بالإنترنت. مسح البطاقة يعمل؛ الحفظ يحتاج إلى إنترنت.";

export default function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="border-b-2 border-amber-400 bg-amber-50 px-4 py-2 text-center text-base text-amber-950 print:hidden">
      <p className="font-semibold">{OFFLINE_EN}</p>
      <p lang="ar" dir="rtl">
        {OFFLINE_AR}
      </p>
      <Link href="/scan" className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
        Open the card scanner · <span lang="ar">فتح ماسح البطاقة</span>
      </Link>
    </div>
  );
}
