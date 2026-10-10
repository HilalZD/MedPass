"""
Generate qr-test-sheet.pdf: one A4 page with 8 QR codes at EXACT physical size,
to find the biggest QR version a cheap phone can still scan from a printed card.

- Versions 15, 18, 20, 23, each at error correction levels M and L.
- Every code is 45 mm wide INCLUDING the 4-module quiet zone (white border).
- Each payload is "MP1:" + random Base45 characters filling that version's
  alphanumeric capacity, so the density matches a real full MedPass card.
- A 100 mm ruler at the bottom lets you check the printer did not rescale.

Run from the repo root:
    python scripts/qr-test-sheet.py            -> writes qr-test-sheet.pdf
    python scripts/qr-test-sheet.py out.pdf    -> custom output path
Needs: pip install segno reportlab
"""

import random
import sys
from pathlib import Path

import segno
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

VERSIONS = [15, 18, 20, 23]
LEVELS = ["M", "L"]
QR_MM = 45  # total printed width, quiet zone included
QUIET = 4  # quiet zone in modules (QR standard minimum)
BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
PREFIX = "MP1:"

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "qr-test-sheet.pdf"


def make(content: str, version: int, level: str):
    # boost_error=False: keep exactly the level we asked for.
    return segno.make(content, version=version, error=level, mode="alphanumeric", boost_error=False)


def capacity(version: int, level: str) -> int:
    """Largest number of alphanumeric characters that fit (binary search)."""
    lo, hi = 1, 4297
    while hi - lo > 1:
        mid = (lo + hi) // 2
        try:
            make("A" * mid, version, level)
            lo = mid
        except segno.DataOverflowError:
            hi = mid
    return lo


def draw_qr(c: canvas.Canvas, qr, x: float, y: float) -> float:
    """Draw qr with its bottom-left corner at (x, y), QR_MM wide. Returns module size in mm."""
    rows = [list(r) for r in qr.matrix]
    n = len(rows) + 2 * QUIET
    m = QR_MM * mm / n  # one module, in PDF points
    top = y + QR_MM * mm
    c.setFillColorRGB(0, 0, 0)
    for r, row in enumerate(rows):
        yy = top - (QUIET + r + 1) * m
        col = 0
        while col < len(row):
            if row[col]:
                start = col
                while col < len(row) and row[col]:
                    col += 1
                # one rectangle per horizontal run of dark modules: no hairline gaps
                c.rect(x + (QUIET + start) * m, yy, (col - start) * m, m, stroke=0, fill=1)
            else:
                col += 1
    # thin corner marks just OUTSIDE the 45 mm box (outside the quiet zone), for measuring
    c.setLineWidth(0.3)
    s = 3 * mm
    for cx, cy, dx, dy in [(x, y, -1, -1), (x + QR_MM * mm, y, 1, -1), (x, top, -1, 1), (x + QR_MM * mm, top, 1, 1)]:
        c.line(cx + dx * 1 * mm, cy, cx + dx * (1 * mm + s), cy)
        c.line(cx, cy + dy * 1 * mm, cx, cy + dy * (1 * mm + s))
    return QR_MM / n


def main() -> None:
    rng = random.Random(2026)  # fixed seed: same sheet every run
    page_w, page_h = A4
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("MedPass QR test sheet")

    c.setFont("Helvetica-Bold", 16)
    c.drawString(15 * mm, page_h - 15 * mm, "MedPass QR scan test - print at 100% / Actual size")
    c.setFont("Helvetica", 9)
    c.drawString(15 * mm, page_h - 21 * mm,
                 f"Each code is {QR_MM} mm wide incl. quiet zone (between the corner marks), "
                 "filled to full capacity with random data.")
    c.drawString(15 * mm, page_h - 25 * mm, "Scan each one with a cheap phone and note which ones read quickly.")

    col_x = [20 * mm, 110 * mm]  # left edge of the M and L columns
    row_h = 58 * mm
    first_top = page_h - 34 * mm
    print(f"{'code':<10}{'modules':>9}{'mm/module':>11}{'chars':>7}")
    for i, version in enumerate(VERSIONS):
        for j, level in enumerate(LEVELS):
            cap = capacity(version, level)
            payload = PREFIX + "".join(rng.choice(BASE45) for _ in range(cap - len(PREFIX)))
            qr = make(payload, version, level)
            assert qr.version == version and qr.error == level and qr.mode == "alphanumeric"
            x = col_x[j]
            y = first_top - i * row_h - QR_MM * mm
            module_mm = draw_qr(c, qr, x, y)
            modules = qr.symbol_size(border=0)[0]
            label_x = x + QR_MM * mm + 5 * mm
            c.setFont("Helvetica-Bold", 26)
            c.drawString(label_x, y + 30 * mm, f"v{version}")
            c.drawString(label_x, y + 19 * mm, level)
            c.setFont("Helvetica", 8)
            c.drawString(label_x, y + 12 * mm, f"{modules}x{modules} modules")
            c.drawString(label_x, y + 8 * mm, f"{module_mm:.2f} mm / module")
            c.drawString(label_x, y + 4 * mm, f"{cap} chars")
            print(f"v{version}-{level:<7}{modules:>9}{module_mm:>11.2f}{cap:>7}")

    # 100 mm ruler to verify the print scale
    rx, ry = 15 * mm, 14 * mm
    c.setLineWidth(0.5)
    c.line(rx, ry, rx + 100 * mm, ry)
    for t in range(0, 101, 5):
        h = 4 * mm if t % 10 == 0 else 2 * mm
        c.line(rx + t * mm, ry, rx + t * mm, ry + h)
    c.setFont("Helvetica", 8)
    for t in range(0, 101, 10):
        c.drawCentredString(rx + t * mm, ry - 4 * mm, str(t))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(rx + 105 * mm, ry + 2 * mm, "<- must measure exactly 100 mm.")
    c.drawString(rx + 105 * mm, ry - 2 * mm, "If not, the printer rescaled: reprint.")

    c.showPage()
    c.save()
    print(f"\nwrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
