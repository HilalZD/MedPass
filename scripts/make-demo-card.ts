/**
 * Makes Hilal's demo ID card as a printable A4 page: out/demo-card.html
 * (front and back at exact ID-card size, 85.6 x 54 mm, with cut marks).
 * Uses the same <MedPassCard> sides as /print, so it looks identical.
 *
 * Run from the repo root:
 *   npx tsx scripts/make-demo-card.ts
 * Then open out/demo-card.html in Chrome and print at 100% scale ("Actual size").
 *
 * Also checks the round trip: encode -> decode with PIN 246810 -> readEmergency.
 */

import { deepStrictEqual } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardBack, CardFront } from "../components/MedPassCard";
import { decode, encode, fitRecord, readEmergency } from "../lib/card";
import type { MedPassRecord } from "../lib/types";

const PIN = "246810";
const NAME_AR = "هلال زيدان";
const SEX = "M" as const;
const PHOTO = `data:image/jpeg;base64,${readFileSync("fixtures/demo-photo.jpg").toString("base64")}`;

// Demo record. The medical details are FICTIONAL demo values (from the sample
// record). EDIT ME: add dateOfBirth ("YYYY-MM-DD") and bloodType if you want them printed.
const DEMO: MedPassRecord = {
  v: 2,
  id: "MP-HZ26-DM8X",
  cardVersion: 1,
  patient: { name: "Hilal Zeidan", sex: SEX },
  emergency: { allergies: ["Penicillin"], critical: ["Insulin-dependent diabetes"] },
  conditions: [{ name: "Type 2 diabetes", verified: "clinician" }],
  meds: [
    { name: "Glucophage", ingredient: "Metformin", strength: "850 mg", frequency: "twice daily", status: "green", verified: "clinician" },
    { name: "Lantus", ingredient: "Insulin glargine", strength: "18 units", frequency: "at bedtime", status: "green", verified: "clinician" },
  ],
  referrals: [],
  visits: [{ date: "2026-10-10", place: "AUB Medical Center", note: "Demo card issued" }],
  updated: "2026-10-10",
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  // 1. Encode (with the same fitRecord step the portal uses) and check the round trip.
  const fit = fitRecord(DEMO);
  const payload = await encode(fit.record, PIN);
  check("fits on the card", fit.droppedVisits.length === 0, `QR version ${fit.qrVersion}, ${fit.fillPercent}% full, ${payload.length} chars`);

  const decoded = await decode(payload, PIN);
  let same = true;
  try {
    deepStrictEqual(decoded, fit.record);
  } catch {
    same = false;
  }
  check("decode with PIN 246810 gives back the same record", same);

  const em = readEmergency(payload);
  check("readEmergency: MedPass ID", em.id === DEMO.id, em.id);
  check("readEmergency: card version", em.cardVersion === DEMO.cardVersion, `v${em.cardVersion}`);
  check("readEmergency: name", em.name === DEMO.patient.name, em.name);
  check("readEmergency: allergies", JSON.stringify(em.allergies) === JSON.stringify(DEMO.emergency.allergies));
  check("readEmergency: critical", JSON.stringify(em.critical) === JSON.stringify(DEMO.emergency.critical));

  let wrongPinFails = false;
  try {
    await decode(payload, "000000");
  } catch {
    wrongPinFails = true;
  }
  check("a wrong PIN does not decrypt", wrongPinFails);

  // 2. Render the A4 page.
  const front = renderToStaticMarkup(createElement(CardFront, { em, nameAr: NAME_AR, sex: SEX, photo: PHOTO }));
  const back = renderToStaticMarkup(createElement(CardBack, { em, payload }));
  mkdirSync("out", { recursive: true });
  writeFileSync("out/demo-card.html", page(front, back));
  console.log("\nWrote out/demo-card.html. Print it at 100% scale (Actual size), no margins.");

  // 3. The same QR alone, as a PNG (same payload as the card above: error
  // correction M, 4-module white border, pure black on white, 1000+ px wide).
  await QRCode.toFile("out/demo-qr.png", payload, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 1024,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  console.log("Wrote out/demo-qr.png (the QR from this card).");

  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

// A4 page, both sides centred, with cut marks just outside each card's corners.
function page(front: string, back: string): string {
  const framed = (label: string, html: string) => `
    <figure>
      <div class="frame">
        <i class="m tl-h"></i><i class="m tl-v"></i><i class="m tr-h"></i><i class="m tr-v"></i>
        <i class="m bl-h"></i><i class="m bl-v"></i><i class="m br-h"></i><i class="m br-v"></i>
        ${html}
      </div>
      <figcaption>${label}</figcaption>
    </figure>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MedPass demo card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #e9ecea; }
  .sheet {
    width: 210mm; height: 297mm; margin: 0 auto; background: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22mm;
    font-family: "IBM Plex Sans Arabic", Arial, sans-serif;
  }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6mm; }
  figcaption { font-size: 3mm; color: #777; }
  .frame { position: relative; width: 85.6mm; height: 54mm; }
  /* cut marks: 4 mm long, 2 mm away from the card edge */
  .m { position: absolute; background: #000; }
  .tl-h, .tr-h, .bl-h, .br-h { width: 4mm; height: 0.15mm; }
  .tl-v, .tr-v, .bl-v, .br-v { width: 0.15mm; height: 4mm; }
  .tl-h { top: 0; left: -6mm; }   .tl-v { left: 0; top: -6mm; }
  .tr-h { top: 0; right: -6mm; }  .tr-v { right: 0; top: -6mm; }
  .bl-h { bottom: 0; left: -6mm; } .bl-v { left: 0; bottom: -6mm; }
  .br-h { bottom: 0; right: -6mm; } .br-v { right: 0; bottom: -6mm; }
  @media print { html, body { background: #fff; } .sheet { margin: 0; } }
</style>
</head>
<body>
<main class="sheet">
  ${framed("Front · 85.6 × 54 mm", front)}
  ${framed("Back · fold or glue back-to-back, then laminate", back)}
</main>
</body>
</html>
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
