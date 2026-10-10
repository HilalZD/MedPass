/**
 * The official MedPass ID card: FRONT and BACK at real ID-card size
 * (ISO/IEC 7810 ID-1: 85.6 x 54 mm). Used by the demo card script and by /print,
 * so they always look identical. Reference design: design/id-card-reference.pdf.
 *
 *   <MedPassCard payload={payload} nameAr={nameAr} sex={sex} photo={photo} />
 *
 * Everything printed comes from the card payload itself (readEmergency: MedPass ID,
 * card version, name, date of birth, blood type, allergies, critical conditions),
 * so the printed text can never disagree with the QR. Only what the payload does
 * not carry comes in as props: the Arabic name, sex and an optional photo.
 * It never takes a PIN.
 *
 * Inline styles in mm (not Tailwind) so it renders the same inside the Next app and
 * in a standalone HTML file, and prints at exact size. No hooks: works on the
 * server (react-dom/server) and in the browser.
 *
 * /print reads the extra fields with takePrintExtra() (read once, then cleared).
 */

import type { CSSProperties } from "react";
import QRCode from "qrcode";
import { CEDAR_ASPECT, CEDAR_DATA_URI } from "@/lib/brand/cedar";
import { readEmergency, type Emergency } from "@/lib/card";

export type MedPassCardProps = {
  payload: string; // the encoded card ("MP1:...") from encode()
  nameAr?: string; // the patient's Arabic name, as typed by a human (never auto-translated)
  sex?: "F" | "M"; // not in the card's public part, so passed separately
  photo?: string; // image URL or data: URL; printed only, never inside the QR
};

// ---------------------------------------------------------------------------
// Handoff to /print: sessionStorage "medpass:print" holds the payload string,
// "medpass:print-extra" holds { nameAr, sex, photo } as JSON.
// ---------------------------------------------------------------------------

export type PrintExtra = Pick<MedPassCardProps, "nameAr" | "sex" | "photo">;
export const PRINT_KEY = "medpass:print";
export const PRINT_EXTRA_KEY = "medpass:print-extra";

export function setPrintExtra(extra: PrintExtra): void {
  sessionStorage.setItem(PRINT_EXTRA_KEY, JSON.stringify(extra));
}

/** Read the extra print fields once and remove them from sessionStorage. */
export function takePrintExtra(): PrintExtra {
  try {
    const raw = sessionStorage.getItem(PRINT_EXTRA_KEY);
    sessionStorage.removeItem(PRINT_EXTRA_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      nameAr: typeof v.nameAr === "string" && v.nameAr.trim() ? v.nameAr : undefined,
      sex: v.sex === "F" || v.sex === "M" ? v.sex : undefined,
      photo: typeof v.photo === "string" && v.photo ? v.photo : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

const C = {
  mint: "#EEF4F1",
  green: "#2B8A6E",
  greenDark: "#1F6F57",
  ink: "#12352B",
  muted: "#55655F",
  line: "#C9D6D0",
  border: "#D3DED9",
};

const FONT = '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';
const MONO = '"IBM Plex Mono", "Roboto Mono", Consolas, "Courier New", monospace';
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";

const side: CSSProperties = {
  position: "relative",
  boxSizing: "border-box",
  width: "85.6mm",
  height: "54mm",
  borderRadius: "3.18mm", // ISO ID-1 corner radius
  border: `0.2mm solid ${C.border}`,
  background: C.mint,
  overflow: "hidden",
  fontFamily: FONT,
  color: C.ink,
  lineHeight: 1.15,
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
  breakInside: "avoid",
};

const abs = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });

// Western digits → Arabic-Indic digits, for the Arabic lines.
const arabicDigits = (s: string) => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

const SEX = { F: { ar: "أنثى", en: "Female" }, M: { ar: "ذكر", en: "Male" } } as const;

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

// The MedPass cedar (public/brand/cedar.svg). Embedded as a data: URI so it
// also shows on the printed card, offline, and in the standalone demo card.
// `size` is the HEIGHT; the width follows the logo's shape.
export function Cedar({ size, opacity = 1 }: { size: string; opacity?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CEDAR_DATA_URI}
      alt=""
      aria-hidden="true"
      style={{ height: size, width: `calc(${size} * ${CEDAR_ASPECT})`, opacity, display: "block" }}
    />
  );
}

// Neutral head-and-shoulders placeholder when there is no photo.
function Silhouette() {
  return (
    <svg viewBox="0 0 100 125" style={{ width: "100%", height: "100%", display: "block" }} aria-hidden="true">
      <rect width="100" height="125" fill="#FFFFFF" />
      <circle cx="50" cy="48" r="20" fill="#D9E2DE" />
      <path d="M14 125 C14 92 30 78 50 78 C70 78 86 92 86 125 Z" fill="#D9E2DE" />
    </svg>
  );
}

// The QR as crisp black squares on white, error correction M (same settings
// lib/card.ts uses to measure the size budget).
function QrSvg({ text, size }: { text: string; size: string }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
  }
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      style={{ width: size, height: size, display: "block" }}
      shapeRendering="crispEdges"
      role="img"
      aria-label="MedPass QR code"
    >
      <rect width={n} height={n} fill="#FFFFFF" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sides
// ---------------------------------------------------------------------------

export function CardFront({ em, nameAr, sex, photo }: { em: Emergency; nameAr?: string; sex?: "F" | "M"; photo?: string }) {
  const s = sex ? SEX[sex] : null;
  return (
    <div style={side} data-side="front">
      {/* faint watermark */}
      <div style={abs({ left: "44mm", top: "15mm", zIndex: 0, pointerEvents: "none" })}>
        <Cedar size="37mm" opacity={0.07} />
      </div>

      {/* header */}
      <div style={abs({ left: "3.5mm", top: "3.2mm", display: "flex", alignItems: "center", gap: "1.6mm" })}>
        <Cedar size="8mm" />
        <div dir="ltr">
          <div style={{ fontSize: "3.1mm", fontWeight: 700, color: C.greenDark }}>MedPass</div>
          <div style={{ fontSize: "1.95mm", color: C.muted }}>Medical ID card</div>
        </div>
      </div>
      <div dir="rtl" lang="ar" style={abs({ right: "3.5mm", top: "4.6mm", fontSize: "3.5mm", fontWeight: 700 })}>
        بطاقة ميدباس الطبية
      </div>
      <div style={abs({ left: "3.5mm", right: "3.5mm", top: "14.2mm", height: "0.5mm", background: C.green })} />

      {/* photo */}
      <div
        style={abs({
          left: "3.5mm",
          top: "17mm",
          width: "20.5mm",
          height: "25.3mm",
          boxSizing: "border-box",
          border: `0.4mm solid ${C.green}`,
          borderRadius: "1.6mm",
          overflow: "hidden",
          background: "#FFFFFF",
        })}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <Silhouette />
        )}
      </div>

      {/* names */}
      <div style={abs({ left: "27mm", right: "3.5mm", top: "17.6mm", textAlign: "right" })}>
        <div dir="rtl" lang="ar" style={{ fontSize: "3.2mm", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ color: C.green }}>الاسم: </span>
          {nameAr || "—"}
        </div>
        <div dir="ltr" style={{ fontSize: "1.85mm", color: C.muted, marginTop: "0.9mm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ fontWeight: 600 }}>Name: </span>
          {em.name || "—"}
        </div>
      </div>

      {/* date of birth (right) and sex (left) */}
      <div style={abs({ left: "27mm", right: "3.5mm", top: "25.6mm", display: "flex", justifyContent: "space-between", textAlign: "right" })}>
        <div style={{ width: "22mm" }}>
          <div dir="rtl" lang="ar" style={{ fontSize: "2.1mm", fontWeight: 700 }}>
            <span style={{ color: C.green }}>الجنس: </span>
            {s?.ar ?? "—"}
          </div>
          <div dir="ltr" style={{ fontSize: "1.6mm", color: C.muted, marginTop: "0.6mm", textAlign: "right" }}>
            Sex: {s?.en ?? "—"}
          </div>
        </div>
        <div>
          <div dir="rtl" lang="ar" style={{ fontSize: "2.1mm", fontWeight: 700 }}>
            <span style={{ color: C.green }}>تاريخ الولادة: </span>
            <bdi dir="ltr">{em.dateOfBirth ? arabicDigits(em.dateOfBirth) : "—"}</bdi>
          </div>
          <div dir="ltr" style={{ fontSize: "1.6mm", color: C.muted, marginTop: "0.6mm", textAlign: "right" }}>
            Date of birth: {em.dateOfBirth ?? "—"}
          </div>
        </div>
      </div>

      <div style={abs({ left: "27mm", right: "3.5mm", top: "34.6mm", height: "0.25mm", background: C.line })} />

      {/* blood type */}
      <div style={abs({ right: "3.5mm", top: "36.2mm", display: "flex", alignItems: "center", gap: "1.6mm" })}>
        <div dir="ltr" style={{ fontSize: "5mm", fontWeight: 700, letterSpacing: "0.1mm" }}>
          {em.bloodType || (
            // No blood type on record = explicitly "Unknown".
            <span style={{ display: "block", fontSize: "2.1mm", lineHeight: 1.2, textAlign: "right" }}>
              <span lang="ar" dir="rtl" style={{ display: "block" }}>
                غير معروف
              </span>
              Unknown
            </span>
          )}
        </div>
        <div style={{ textAlign: "left" }}>
          <div dir="rtl" lang="ar" style={{ fontSize: "1.9mm", fontWeight: 600, color: C.green }}>
            فئة الدم
          </div>
          <div dir="ltr" style={{ fontSize: "1.45mm", fontWeight: 600, color: C.muted }}>
            Blood type
          </div>
        </div>
      </div>

      {/* MedPass ID */}
      <div style={abs({ left: "3.5mm", bottom: "3.6mm", fontSize: "1.65mm", fontWeight: 700, color: C.green, whiteSpace: "nowrap" })}>
        <span dir="ltr">MedPass ID</span>
        <span dir="rtl" lang="ar" style={{ marginLeft: "1.4mm" }}>
          رقم ميدباس
        </span>
      </div>
      <div
        dir="ltr"
        style={abs({ right: "3.5mm", bottom: "2.6mm", fontFamily: MONO, fontSize: "4mm", fontWeight: 600, letterSpacing: "0.55mm" })}
      >
        {em.id}
      </div>
    </div>
  );
}

export function CardBack({ em, payload }: { em: Emergency; payload: string }) {
  const label = (ar: string, en: string) => (
    <>
      <div dir="rtl" lang="ar" style={{ fontSize: "1.9mm", fontWeight: 600 }}>
        {ar}
      </div>
      <div dir="ltr" style={{ fontSize: "1.45mm", color: C.muted, marginTop: "0.3mm" }}>
        {en}
      </div>
    </>
  );
  const values = (items: string[]) => (
    <div dir="ltr" style={{ fontSize: items.join(", ").length > 40 ? "2.4mm" : "2.9mm", fontWeight: 700, marginTop: "0.6mm" }}>
      {items.length ? items.join(", ") : "None known"}
    </div>
  );

  return (
    <div style={side} data-side="back">
      {/* QR: white rounded box, QR 38 mm, with a white margin of at least
          4 QR modules all round (scanners need this "quiet zone") */}
      <div
        style={abs({
          left: "3.5mm",
          top: "2.5mm",
          width: "44mm",
          height: "44mm",
          boxSizing: "border-box",
          background: "#FFFFFF",
          border: `0.3mm solid ${C.line}`,
          borderRadius: "2mm",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <QrSvg text={payload} size="38mm" />
      </div>
      <div dir="ltr" style={abs({ left: "3.5mm", width: "44mm", top: "47.2mm", fontSize: "1.55mm", color: C.muted, textAlign: "center" })}>
        <span style={{ fontWeight: 700, color: C.ink }}>v{em.cardVersion}</span> · Scan with MedPass
      </div>

      {/* emergency info */}
      <div style={abs({ left: "50.5mm", right: "3.5mm", top: "3mm", bottom: "5mm", display: "flex", flexDirection: "column", textAlign: "right" })}>
        <div style={{ fontSize: "1.6mm", color: C.muted, paddingBottom: "1.2mm", borderBottom: `0.25mm solid ${C.line}` }}>
          <span dir="rtl" lang="ar">
            يعمل بدون إنترنت
          </span>{" "}
          · <span dir="ltr">Works offline</span>
        </div>

        <div style={{ marginTop: "2.4mm" }}>
          {label("الحساسية", "Allergies")}
          {values(em.allergies)}
        </div>
        <div style={{ marginTop: "2.2mm" }}>
          {label("حالات حرجة", "Critical conditions")}
          {values(em.critical)}
        </div>

        <div style={{ marginTop: "auto", paddingTop: "1.2mm", borderTop: `0.25mm solid ${C.line}` }}>
          <div dir="rtl" lang="ar" style={{ fontSize: "1.85mm", fontWeight: 700 }}>
            للطوارئ اتصل على ١٤٠
          </div>
          <div dir="ltr" style={{ fontSize: "1.5mm", fontWeight: 600, marginTop: "0.3mm" }}>
            For emergencies call 140
          </div>
        </div>
      </div>

      <div dir="ltr" style={abs({ left: 0, right: 0, bottom: "1.3mm", fontSize: "1.15mm", color: C.muted, textAlign: "center" })}>
        Prototype · not an official document
      </div>
    </div>
  );
}

/** Both sides, front then back. Wrap in your own layout (screen or print page). */
export default function MedPassCard({ payload, nameAr, sex, photo }: MedPassCardProps) {
  let em: Emergency;
  try {
    em = readEmergency(payload);
  } catch {
    return (
      <div style={{ ...side, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3mm", color: "#9B1C1C" }}>
        Not a valid MedPass card
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6mm" }}>
      {/* React 19 moves this into <head>; without internet the system fonts are used */}
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />
      <CardFront em={em} nameAr={nameAr} sex={sex} photo={photo} />
      <CardBack em={em} payload={payload} />
    </div>
  );
}
