# MedPass — national medical ID card (project brief, v2)

## What this is
MedPass is a medical ID card for Lebanon, issued through MoPH facilities, built for Hack for Health Lebanon at AUB (Oct 10–11, 2026). Code freeze: Sunday 15:00.

Problem: in war and displacement, medical records are lost or burned (one of our teammates lost every record he had since birth to a fire), prescriptions are unreadable, and every clinic restarts from zero.

MedPass is HYBRID:
- ONLINE: a full patient record in a central database that authorized clinicians can view and update.
- OFFLINE: a printed ID card whose QR contains an encrypted snapshot of the essentials, readable with the patient's 6-digit PIN, with no internet. If the servers go down, the card still works.

## The card
Front: name, date of birth, blood type, MedPass ID, QR. Back: emergency info (allergies, critical conditions) as readable text in Arabic + English. Optional photo, printed only, never inside the QR. NO national ID number anywhere.
QR payload: version prefix + MedPass ID + cardVersion + emergency section (plaintext) + snapshot of the record (raw fields stripped, compressed, AES-GCM encrypted, key from PIN via PBKDF2). Target under ~800 characters.

## Flows
1. CREATE (in the hospital portal, clinician logged in, patient present): photograph old papers → AI (Claude vision) transcribes, never invents → clinician + patient review each item against the paper (green / yellow / unreadable; yellows must be resolved) → patient chooses a 6-digit PIN → record saved → ID card printed.
2. CRISIS / OFFLINE (anyone with the app, no login, no internet): scan → emergency info shown immediately → patient's PIN → decrypted snapshot. Drug info from the bundled drugs.json.
3. HOSPITAL PORTAL (online): clinician logs in → scan the card or type the MedPass ID → patient's PIN → full record → edit (meds, conditions, status, referrals, add a visit, mark items clinician-verified) → save → print updated card (cardVersion + 1).
4. PATIENT VIEW (online): MedPass ID + PIN → read-only record + access log ("who opened my record").
5. LOST CARD: reissue → cardVersion increments; when an older card is scanned online it shows "This card was replaced."

## Security model (the jury asks about this)
- TWO KEYS: clinician login (individual accounts, created by an admin = "government approved", no public sign-up) + patient PIN. Neither alone opens or edits a record.
- PIN stored only as a bcrypt hash; 5 wrong attempts → 15-minute lockout; failed attempts are logged.
- Every create/view/edit/reissue is written to an access log the patient can see.
- Database tables have Row Level Security enabled with no client policies: the browser never talks to the database directly. All reads/writes go through Next.js API routes that check the clinician session first, using the service role key on the server only.
- Prescription photos are never stored. AI output is always confirmed by a human.
- Demo uses fictional patients only.

## Judging criteria
- Solution fit / user value: real gap, real people, usable by a ministry or hospital on Monday.
- Technical readiness: judges open the live URL and press the buttons.
- Demo & presentation: clear in 3 minutes (jury) and 10 (stage).
- User experience: usable without explanation, by all levels of digital confidence, on cheap phones and bad connections.
- Privacy & security: what is collected, who sees it, how records are handled, where a human stays in the loop.

## Stack
Next.js App Router + TypeScript + Tailwind on Vercel. Supabase (Postgres + Auth). Anthropic API, vision (env ANTHROPIC_MODEL). zod, bcryptjs, pako, Web Crypto (AES-GCM + PBKDF2), qrcode, html5-qrcode, Fuse.js.

## The contract (shared; never change alone)
lib/types.ts, fixtures/sample-record.json, public/drugs.json, CLAUDE.md.

## Ownership (only edit your own files)
- Hilal: app/api/*, app/dev/*, lib/extract.ts, lib/image.ts, lib/db/*, supabase/*, app/portal/*, app/me/*, proxy.ts
- Teammate: scripts/*, public/drugs.json, lib/card.ts, lib/match.ts, components/DrugInfo.tsx, app/card/*, app/print/*, app/scan/* (offline crisis viewer), PWA/service worker config
- Shared (agree first): lib/types.ts, fixtures/*, CLAUDE.md, app/layout.tsx

## Integration points
- Portal "Print card" → calls encode() from lib/card.ts with the saved record + the PIN entered in that session → opens app/print.
- Offline scanner: when online, shows an "Open in hospital portal" button → /portal/patient/[id].
- Portal and scanner both show medications with <DrugInfo> (coverage badge, price, same-ingredient alternatives).

## How to work with us
We're second-year CS students learning while building. Explain every change in plain language, keep changes small, tell us how to test, commit often. Simple, working code over clever code. Never delete files without asking.
