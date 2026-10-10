// Demo mode for the judges: NEXT_PUBLIC_DEMO_MODE=true (in .env.local and on Vercel).
// NEXT_PUBLIC_ variables are copied into the browser code at build time, so
// this flag is the same on the server and in the browser.
//
// Only fictional data belongs here. The demo clinician passwords are NOT here:
// they stay in server-only env vars (see app/api/auth/demo-login/route.ts).

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// The fictional sample patient created by scripts/seed-demo.ts.
export const DEMO_PATIENT = {
  id: "MP-Z8EX-SN4Y",
  pin: "123456",
  name: "Fatima Haidar",
};

// Hilal's own card, shown on /me in demo mode at Hilal's request (2026-10-10)
// so judges can open it. Real person: remove this hint when demo mode ends.
export const DEMO_OWN_CARD = {
  id: "MP-7K3Q-92XD",
  pin: "246810",
  name: "Hilal Zeidan",
};
