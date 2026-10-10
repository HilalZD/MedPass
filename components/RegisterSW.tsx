"use client";

// Registers the offline service worker (public/sw.js). Production only:
// in development it would cache old code while you edit. Renders nothing.

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // No offline mode on this browser; the page still works online.
    });
  }, []);
  return null;
}
