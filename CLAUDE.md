# MedPass — project brief

## What this is
MedPass is a patient-held, encrypted QR health card for displaced and vulnerable people in Lebanon, built for the Hack for Health Lebanon hackathon at AUB (Oct 10–11, 2026). Code freeze: Sunday 15:00.

The problem: when people are displaced by war, their medical records are lost or burned, prescriptions are unreadable, and every new clinic restarts their history from zero. Treatment for chronic conditions breaks. One of our team members lost every medical record he had since birth to a fire during the war.

The solution, end to end:
1. Patient (or a shelter volunteer) photographs their old prescriptions / discharge notes.
2. AI (Claude vision) transcribes them into a structured record. It never invents doses or diagnoses.
3. The patient reviews every item against the original paper and confirms or fixes it. Uncertain items are flagged yellow and must be resolved.
4. The record becomes ONE QR code: emergency info (allergies, critical conditions) in plaintext; everything else compressed and AES-GCM encrypted with a key derived from the patient's PIN.
5. The card is printed and worn around the neck (laminated), and/or kept on a phone. Emergency info is also printed as readable Arabic/English text next to the QR so it works with no device at all.
6. A clinic scans it, the patient says their PIN, the record decrypts ON THE DEVICE, offline.
7. Each medication is matched against the real Lebanese Ministry of Public Health (MoPH) drug price list: public price, whether MoPH covers it, and same-ingredient alternatives if it's out of stock.
8. The clinic adds the visit and issues an updated card.

## Judging criteria (design every decision against these)
- Solution fit / user value: real gap, real people, usable by a ministry or hospital on Monday.
- Technical readiness: judges open the live URL and press buttons. It must actually work, no mock-ups.
- Demo & presentation: understood in 3 minutes.
- User experience: usable without explanation, by people with very different digital confidence, on cheap phones and bad connections.
- Privacy & security: what is collected, who sees it, how real records are handled, where a human stays in the loop.

## Hard constraints
- NO server database. No patient data is ever stored on our server. Card data lives only in the QR.
- Scanning, decrypting and drug lookup must work OFFLINE (PWA + client-side Web Crypto + bundled drugs.json). Only the AI extraction step needs internet.
- Camera and Web Crypto need HTTPS: always test on the Vercel URL, not a local IP.
- Encoded QR payload target: under ~800 characters so printed cards scan reliably.
- Arabic and English UI. Big buttons, plain words.
- AI output is always confirmed by a human before it becomes part of a card.

## Stack
Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel. Anthropic API for vision extraction (model ID from env ANTHROPIC_MODEL). pako (compression), Web Crypto (AES-GCM + PBKDF2), qrcode (generate), html5-qrcode (scan), Fuse.js (fuzzy drug matching).

## The contract (shared, do not change without both teammates agreeing)
- lib/types.ts — the MedPassRecord type. Both halves of the app depend on it.
- fixtures/sample-record.json — a realistic sample record for building and testing without the AI.
- public/drugs.json — normalized MoPH drug data. Shape: { id, brand, ingredient, strength, form, price, covered }[]

## Ownership (only edit your own files)
- Hilal: app/api/*, app/onboard/*, app/review/*, app/provider/*, lib/extract.ts, lib/match.ts
- Teammate: scripts/*, public/drugs.json, lib/card.ts, app/card/*, app/scan/*, app/print/*, PWA/service worker config
- Shared (agree first): lib/types.ts, fixtures/*, CLAUDE.md, app/layout.tsx

## How to work with us
We are second-year CS students learning while building. For every change: explain what you did and why in plain language, keep changes small, and tell us how to test it. Prefer simple, working code over clever code. Never delete files without asking.
