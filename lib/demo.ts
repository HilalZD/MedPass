// Demo mode for the judges: NEXT_PUBLIC_DEMO_MODE=true (in .env.local and on Vercel).
// NEXT_PUBLIC_ variables are copied into the browser code at build time, so
// this flag is the same on the server and in the browser.
//
// The demo clinician passwords are NOT here: they stay in server-only env vars
// (see app/api/auth/demo-login/route.ts).

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// THE demo card, shown in the hint on /me AND /scan (components/DemoHint.tsx).
// One place only, so the two pages can never show different cards again.
// Hilal's own card, shown at his request for the jury demo (2026-10-10).
// Remove the hint (or turn demo mode off) when the demo is over.
export const DEMO_CARD = {
  id: "MP-7K3Q-92XD",
  pin: "123456",
  name: "Hilal Zeidan",
};
