"""
Build public/drugs.json from the MoPH public price list (v0).

Input:  data/moph-prices.xls  (MoPH "Drugs Public Price List", binary Excel, one sheet)
Output: public/drugs.json     (compact JSON array matching the Drug type in lib/types.ts)

v0 decisions (agreed with the team):
- ingredient is always "" (unknown). We will enrich it later from the AMAN list
  and a hand-curated list. The price list has no ingredient column.
- covered is always false for now (AMAN matching comes later).
- moph-registered.xlsx is ignored for now.

Run from the repo root:
    python scripts/build-drugs.py
Needs: pip install pandas xlrd
"""

import json
import math
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "moph-prices.xls"
OUT = ROOT / "public" / "drugs.json"
TYPES = ROOT / "lib" / "types.ts"


def drug_type_keys() -> list[str]:
    """Read the field names of `export type Drug = { ... }` from lib/types.ts,
    so this script fails loudly if the shared contract changes."""
    text = TYPES.read_text(encoding="utf-8")
    block = re.search(r"export type Drug\s*=\s*\{(.*?)\};", text, re.S)
    if not block:
        raise SystemExit("Could not find `export type Drug` in lib/types.ts")
    return re.findall(r"^\s*(\w+)\??\s*:", block.group(1), re.M)


def clean(value) -> str:
    """Trim, collapse repeated whitespace, and turn NaN/None into ""."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def clean_code(value) -> str:
    # Excel stores codes as numbers; make sure 10574.0 becomes "10574".
    code = clean(value)
    return code[:-2] if code.endswith(".0") else code


def parse_price(value) -> int | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(price) or price <= 0:
        return None
    return round(price)


def main() -> None:
    keys = drug_type_keys()
    df = pd.read_excel(SRC, engine="xlrd", dtype={"Code": str, "Strength": str})

    drugs = []
    skipped = {"no code": 0, "no brand": 0, "no valid price": 0}
    for row in df.to_dict("records"):
        code = clean_code(row.get("Code"))
        brand = clean(row.get("Brand name"))
        price = parse_price(row.get("Public Price LL"))
        # Each skipped row is counted once, under the first reason that applies.
        if not code:
            skipped["no code"] += 1
            continue
        if not brand:
            skipped["no brand"] += 1
            continue
        if price is None:
            skipped["no valid price"] += 1
            continue
        drugs.append({
            "id": code,
            "brand": brand,
            "ingredient": "",
            "strength": clean(row.get("Strength")),
            "form": clean(row.get("Form")) or clean(row.get("Presentation")),
            "price": price,
            "covered": False,
        })

    ids = [d["id"] for d in drugs]
    assert len(ids) == len(set(ids)), "duplicate ids in output"
    for d in drugs:
        assert list(d) == keys, f"row {d['id']} keys {list(d)} != Drug type {keys}"

    drugs.sort(key=lambda d: (d["brand"].lower(), d["strength"], d["id"]))
    OUT.write_text(
        json.dumps(drugs, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(f"rows read:     {len(df)}")
    print(f"rows written:  {len(drugs)}")
    print(f"skipped:       {skipped}")
    print(f"empty form:    {sum(1 for d in drugs if not d['form'])}")
    print(f"file size:     {OUT.stat().st_size / 1024:.1f} KB  ({OUT.relative_to(ROOT)})")
    print("samples:")
    step = max(1, len(drugs) // 5)
    for d in drugs[::step][:5]:
        print("  ", json.dumps(d, ensure_ascii=False))


if __name__ == "__main__":
    main()
