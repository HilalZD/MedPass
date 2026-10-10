"""
Download the MoPH public drug list (moph.gov.lb) into a dated JSON snapshot.

The MoPH Excel exports (data/moph-prices.xls) have no ingredient or ATC column,
but the website's list does. This script reads every letter A-Z and every page
of https://www.moph.gov.lb/en/Drugs/index/3/4848 and saves one row per drug:

  {url, atc, brand, bg, ingredients, strength, form, price}

  url          the drug's own official MoPH page (use it as a source/citation)
  bg           "B" brand / "G" generic / "BioTech" / "BioHuman", as MoPH labels it
  ingredients  as written by MoPH, e.g. "Bisoprolol fumarate - 2.5mg, Amlodipine besylate - 5mg"

Polite: one request per second, a clear User-Agent, 3 retries. ~212 pages, ~4 min.
build-drugs.py only READS the snapshot; it never calls the network.

Run from the repo root:
    python scripts/scrape-moph.py                 -> data/moph-web-<today>.json
    python scripts/scrape-moph.py out.json        -> custom output path
"""

import datetime
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / f"moph-web-{datetime.date.today().isoformat()}.json"
BASE = "https://www.moph.gov.lb/en/Drugs/index/3/4848/letter:{letter}"
HEADERS = {"User-Agent": "Mozilla/5.0 (MedPass hackathon project; github.com/HilalZD/MedPass)"}
DELAY_SECONDS = 1.0

ROW_RE = re.compile(r"<tr>\s*(<td.*?)</tr>", re.S)
CELL_RE = re.compile(r'<td[^>]*>\s*<a href="(/en/Drugs/view/\d+)"[^>]*>(.*?)</a>', re.S)
FIELDS = ["atc", "brand", "bg", "ingredients", "strength", "form", "price"]  # column order on the site


def get(url: str) -> str:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network hiccup: wait and retry
            print(f"  retry {attempt + 1}: {url} ({e})")
            time.sleep(3)
    raise SystemExit(f"failed to download {url}")


def parse_rows(page: str) -> list[dict]:
    rows = []
    for tr in ROW_RE.findall(page):
        cells = CELL_RE.findall(tr)
        if len(cells) != len(FIELDS):
            continue
        text = [html.unescape(re.sub(r"<!--.*?-->|<[^>]+>", "", c[1], flags=re.S)).strip() for c in cells]
        rows.append({"url": "https://www.moph.gov.lb" + cells[0][0], **dict(zip(FIELDS, text))})
    return rows


def main() -> None:
    rows, pages = [], 0
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        first = get(BASE.format(letter=letter))
        last = max([int(p) for p in re.findall(rf"letter:{letter}/page:(\d+)", first)] or [1])
        for page_no in range(1, last + 1):
            page = first if page_no == 1 else get(BASE.format(letter=letter) + f"/page:{page_no}")
            rows.extend(parse_rows(page))
            pages += 1
            time.sleep(DELAY_SECONDS)
        print(f"{letter}: {last} page(s), {len(rows)} rows so far", flush=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"\n{pages} pages, {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
