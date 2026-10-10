"""
Build public/drugs.json from the MoPH data.

Inputs:
  data/moph-prices.xls   MoPH "Drugs Public Price List" (binary Excel, one sheet) - one row per drug pack
  data/moph-aman.xlsx    MoPH AMAN list of medicines the ministry provides (Sheet1; Sheet2 is notes)
Outputs:
  public/drugs.json      compact JSON array matching the Drug type in lib/types.ts
  data/review-aman.csv   AMAN rows we could NOT safely match, for a human to check

Steps:
  1. v0: every price-list row becomes a Drug with ingredient "" and covered false.
  2. AMAN coverage: an AMAN "Medication name" is matched to price-list rows when
     the brand's first word AND the strength (number + unit, or the same
     concentration per ml) both match, and only one brand name fits. Only then: covered = true, ingredient = AMAN ingredient.
     Anything uncertain goes to data/review-aman.csv instead. Never guess.
  3. Generic-named drugs: a brand still without ingredient that contains a known
     AMAN ingredient (5+ letters) as a whole word gets that ingredient.
  4. Curated list (data/ingredients-curated.csv): ONLY rows a human marked
     verified = "yes" are used.
     - brand rows: a drug matches when its brand's words start with the row's
       brand words ("Concor" matches "CONCOR 5mg" and "CONCOR COR"). The longest
       matching row wins, so "Concor AM" beats "Concor". A verified row with an
       EMPTY ingredient blocks the shorter row (unverified combination products).
       Only fills drugs that have no ingredient yet; disagreements are printed.
     - alias rows (note = "alias"): fix spellings in every ingredient,
       e.g. oxaliplatine -> oxaliplatin.

Not used yet: data/moph-registered.xlsx.

Run from the repo root:
    python scripts/build-drugs.py
Needs: pip install pandas xlrd openpyxl
"""

import csv
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "moph-prices.xls"
AMAN = ROOT / "data" / "moph-aman.xlsx"
OUT = ROOT / "public" / "drugs.json"
REVIEW = ROOT / "data" / "review-aman.csv"
CURATED = ROOT / "data" / "ingredients-curated.csv"
TYPES = ROOT / "lib" / "types.ts"

# AMAN "Chemical Composition" values that are really brand/device names, not
# ingredients. They can still be matched for coverage, but we never write them
# into the ingredient field or use them for generic-name matching.
NOT_INGREDIENTS = {"cassette", "extraneal", "minicap", "octanate", "octanine", "mimpara", "ruxotin", "wilate"}

UNIT = r"(?:mg|mcg|µg|ug|g|ml|l|iu|ui|u|%)"
NUM = r"\d+(?:[.,]\d+)?"
# A strength like "250 mg", "4.48g/l", "50 mg/5 ml", "100mg/vial" (with an optional leading "-").
STRENGTH_RE = re.compile(rf"-?\s*{NUM}\s*{UNIT}(?:\s*/\s*(?:{NUM}\s*)?(?:{UNIT}|vial))?(?![a-z])", re.I)
# Route, dosage-form and packaging words that are not part of the ingredient name.
ROUTE_RE = re.compile(
    r"\b(?:po|iv|sc|im|intravesical|injection|tab|tablets?|oral|suspension|prolonged release|concent)\b\.?",
    re.I,
)
# Separators between the ingredients of a combination: " - ", ",", "+", " and ", "/Name".
COMPONENT_SPLIT_RE = re.compile(r"\s+-\s+|,|\+|\s+and\s+|/(?=\s*[a-z]{3,})", re.I)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def drug_type_keys() -> list[str]:
    """Read the field names of `export type Drug = { ... }` from lib/types.ts,
    so this script fails loudly if the shared contract changes."""
    text = TYPES.read_text(encoding="utf-8")
    block = re.search(r"export type Drug\s*=\s*\{(.*?)\};", text, re.S)
    if not block:
        raise SystemExit("Could not find `export type Drug` in lib/types.ts")
    return re.findall(r"^\s*(\w+)\??\s*:", block.group(1), re.M)


def clean(value) -> str:
    """Trim, collapse repeated whitespace (incl. non-breaking spaces), and turn NaN/None into ""."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip()


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


def ascii_lower(text: str) -> str:
    """'Bléomycine' -> 'bleomycine'."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def first_word(name: str) -> str:
    words = re.findall(r"[a-z0-9]+", ascii_lower(name))
    return words[0] if words else ""


# For strength comparison: "10,000IU" is ten thousand (thousands separator), "2,5mg" is 2.5.
NUM_K = r"\d{1,3}(?:,\d{3})+(?!\d)|\d+(?:[.,]\d+)?"
UNIT_K = r"(?:mg|mcg|µg|ug|g|ml|l|iu|ui|units?|u|%)"
AMOUNT_RE = re.compile(rf"({NUM_K})\s*({UNIT_K})(?![a-z])", re.I)
PER_ML_RE = re.compile(rf"({NUM_K})\s*({UNIT_K})\s*/\s*({NUM_K})?\s*ml(?![a-z])", re.I)


def to_number(text: str) -> float:
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+", text):
        return float(text.replace(",", ""))
    return float(text.replace(",", "."))


def normalize_amount(number: str, unit: str) -> tuple[float, str]:
    """'1 g' and '1000mg' both -> (1000.0, 'mg'); 'UI', 'U', 'Units' -> 'iu'."""
    value, unit = to_number(number), unit.lower()
    if unit == "g":
        value, unit = value * 1000, "mg"
    elif unit in ("mcg", "µg", "ug"):
        value, unit = value / 1000, "mg"
    elif unit == "l":
        value, unit = value * 1000, "ml"
    elif unit in ("ui", "u", "unit", "units"):
        unit = "iu"
    return round(value, 6), unit


def strength_keys(text: str) -> set[tuple]:
    """All the ways a strength text can be compared. Two strengths match when they share a key:
    - the FIRST amount:             "250 mg" == "250mg", "1 g" == "1000 mg", "10,000IU" == "10000 IU"
    - a concentration per ml:       "20 mg/10 ml" == "2mg/ml"
    - an amount in parentheses:     "3750 U" == "750U/ml (3750U)"
    Later amounts of a combination ("600mg/50mg/300mg") are NOT keys, so a single-drug
    strength cannot match one ingredient of a combination product."""
    text = clean(text)
    keys: set[tuple] = set()
    first = AMOUNT_RE.search(text)
    if first:
        keys.add(("amount",) + normalize_amount(first.group(1), first.group(2)))
    for m in PER_ML_RE.finditer(text):
        value, unit = normalize_amount(m.group(1), m.group(2))
        per = to_number(m.group(3)) if m.group(3) else 1.0
        if per:
            keys.add(("per ml", round(value / per, 6), unit))
    for inside in re.findall(r"\(([^)]*)\)", text):
        for m in AMOUNT_RE.finditer(inside):
            keys.add(("amount",) + normalize_amount(m.group(1), m.group(2)))
    return keys


def extract_ingredient(composition: str) -> str:
    """'Abiraterone 250 mg PO' -> 'abiraterone'.
    Combinations are joined with ' + ':
    'Lopinavir 200 mg/Ritonavir 50 mg' -> 'lopinavir + ritonavir'."""
    text = clean(composition)
    text = re.sub(r"\([^)]*\)", " ", text)  # "(HCl)", "(2000ML)", "(Nonacog alfa)"
    parts = []
    for part in COMPONENT_SPLIT_RE.split(text):
        part = STRENGTH_RE.sub(" ", part)
        part = ROUTE_RE.sub(" ", part)
        part = re.sub(r"(?<![\w-])\d+(?:[.,]\d+)?(?![\w-])", " ", part)  # leftover bare numbers ("Factor VIII 1000")
        part = re.sub(r"[^\w\s-]", " ", part)  # leftover "/" etc.
        part = re.sub(r"\s+", " ", part).strip(" -").lower()
        if part and part not in parts:
            parts.append(part)
    return " + ".join(parts)


# ---------------------------------------------------------------------------
# Step 1: price list -> drugs (v0)
# ---------------------------------------------------------------------------

def load_price_list() -> tuple[list[dict], dict, int]:
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
    return drugs, skipped, len(df)


# ---------------------------------------------------------------------------
# Step 2: AMAN coverage
# ---------------------------------------------------------------------------

def load_aman() -> list[dict]:
    df = pd.read_excel(AMAN, sheet_name="Sheet1")
    rows, seen = [], set()
    for r in df.to_dict("records"):
        name = clean(r.get("Medication name"))
        comp = clean(r.get("Chemical Composition"))
        if not name or (name, comp) in seen:
            continue
        seen.add((name, comp))
        rows.append({"name": name, "composition": comp, "ingredient": extract_ingredient(comp)})
    return rows


def describe(cands: list[dict], limit: int = 8) -> str:
    text = "; ".join(f"{d['brand']} | {d['strength'] or '-'} | {d['id']}" for d in cands[:limit])
    return text + (f"; ... +{len(cands) - limit} more" if len(cands) > limit else "")


def match_aman(drugs: list[dict], aman: list[dict]) -> tuple[list[dict], Counter, Counter]:
    by_first: dict[str, list[dict]] = {}
    for d in drugs:
        by_first.setdefault(first_word(d["brand"]), []).append(d)

    review, reasons, how = [], Counter(), Counter()
    for a in aman:
        brand_hits = by_first.get(first_word(a["name"]), [])
        want = strength_keys(a["name"])
        if not brand_hits:
            reason, cands = "no brand match", []
        elif not want:
            reason, cands = "no strength in AMAN name", brand_hits
        else:
            cands = [d for d in brand_hits if strength_keys(d["strength"]) & want]
            brands = {ascii_lower(d["brand"]) for d in cands}
            if len(brands) > 1:
                # Tie-breaker: keep brands containing every word of the AMAN name (minus strength),
                # e.g. "Bortezomib Neapolis 3.5 mg" -> only "BORTEZOMIB NEAPOLIS".
                words = set(re.findall(r"[a-z]{2,}", ascii_lower(STRENGTH_RE.sub(" ", a["name"]))))
                words -= {"po", "iv", "sc", "im", "mg", "ml"}
                narrowed = [d for d in cands if words <= set(re.findall(r"[a-z]+", ascii_lower(d["brand"])))]
                if len({ascii_lower(d["brand"]) for d in narrowed}) == 1:
                    cands, brands = narrowed, {ascii_lower(narrowed[0]["brand"])}
                    how["of which via full-name tie-breaker"] += 1
            if not cands:
                reason, cands = "brand matches, strength differs", brand_hits
            elif len(brands) > 1:
                reason = "several brands match"
            else:
                # One brand name, same strength. Several rows = several pack sizes of the same product.
                reason = None
                how["matched"] += 1
                ingredient = "" if a["ingredient"] in NOT_INGREDIENTS else a["ingredient"]
                for d in cands:
                    d["covered"] = True
                    if ingredient and not d["ingredient"]:
                        d["ingredient"] = ingredient
                        d["_ingredient_from"] = "aman"
        if reason:
            reasons[reason] += 1
            review.append({
                "aman_name": a["name"],
                "aman_composition": a["composition"],
                "candidates": describe(cands),
                "reason": reason,
            })
    return review, reasons, how


# ---------------------------------------------------------------------------
# Step 3: generic-named drugs ("METFORMINE ARROW LAB" style brands)
# ---------------------------------------------------------------------------

def fill_generic_names(drugs: list[dict], aman: list[dict]) -> list[tuple[str, str]]:
    known = sorted(
        {
            a["ingredient"]
            for a in aman
            if a["ingredient"]
            and "+" not in a["ingredient"]  # combinations can't be found as one word
            and a["ingredient"] not in NOT_INGREDIENTS
            and len(re.sub(r"[^a-z]", "", a["ingredient"])) >= 5
        },
        key=len,
        reverse=True,  # longest first: "zoledronic acid" before "acid"-like shorter names
    )
    patterns = [(ing, re.compile(rf"(?<![a-z]){re.escape(ing)}(?![a-z])")) for ing in known]
    filled = []
    for d in drugs:
        if d["ingredient"]:
            continue
        brand = ascii_lower(d["brand"])
        for ing, pat in patterns:
            if pat.search(brand):
                d["ingredient"] = ing
                d["_ingredient_from"] = "generic name"
                filled.append((d["brand"], ing))
                break
    return filled


# ---------------------------------------------------------------------------
# Step 4: hand-curated ingredients (data/ingredients-curated.csv)
# ---------------------------------------------------------------------------

def brand_words(name: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[a-z0-9]+", ascii_lower(name)))


def apply_curated(drugs: list[dict]) -> dict:
    with CURATED.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    verified = [r for r in rows if r["verified"].strip().lower() == "yes"]
    is_alias = lambda r: r["note"].strip().lower() == "alias"
    aliases = {clean(r["brand"]).lower(): clean(r["ingredient"]).lower() for r in verified if is_alias(r)}
    brand_rows = [(brand_words(r["brand"]), clean(r["ingredient"]).lower()) for r in verified if not is_alias(r)]

    stats = {"applied": 0, "conflicts": [], "aliased": 0,
             "unverified": sum(1 for r in rows if r["verified"].strip().lower() != "yes")}
    for d in drugs:
        dw = brand_words(d["brand"])
        matches = [(words, ing) for words, ing in brand_rows if words and dw[: len(words)] == words]
        if matches:
            ingredient = max(matches, key=lambda m: len(m[0]))[1]  # longest brand wins
            if ingredient and not d["ingredient"]:
                d["ingredient"] = ingredient
                d["_ingredient_from"] = "curated"
                stats["applied"] += 1
            elif ingredient and d["ingredient"] != ingredient:
                stats["conflicts"].append((d["brand"], d["ingredient"], ingredient))
        if d["ingredient"] and aliases:
            parts = [aliases.get(p, p) for p in d["ingredient"].split(" + ")]
            fixed = " + ".join(parts)
            if fixed != d["ingredient"]:
                d["ingredient"] = fixed
                stats["aliased"] += 1
    return stats


# ---------------------------------------------------------------------------

def spread(items: list, n: int) -> list:
    """n items evenly spread over the list (for printing examples)."""
    if len(items) <= n:
        return items
    step = len(items) / n
    return [items[int(i * step)] for i in range(n)]


def main() -> None:
    keys = drug_type_keys()
    drugs, skipped, rows_read = load_price_list()

    aman = load_aman()
    print("== AMAN composition -> ingredient (15 examples) ==")
    for a in spread(aman, 15):
        print(f"  {a['composition'][:70]!r:74} -> {a['ingredient']!r}")

    review, reasons, how = match_aman(drugs, aman)
    filled = fill_generic_names(drugs, aman)

    print("\n== Generic-name ingredient fills (15 examples) ==")
    for brand, ing in spread(filled, 15):
        print(f"  {brand[:60]!r:64} -> {ing!r}")
    combos = [(b, i) for b, i in filled
              if re.search(r"[a-z]{3,}\s*/\s*[a-z]{3,}|\+|&|\band\b", STRENGTH_RE.sub(" ", b.lower()))]
    print(f"  ({len(combos)} of these brands look like combinations - check: "
          f"{[b for b, _ in combos[:5]]})")

    curated = apply_curated(drugs)
    print("\n== Curated list ==")
    print(f"  applied (verified rows):  {curated['applied']} drugs got an ingredient")
    print(f"  alias spelling fixes:     {curated['aliased']} drugs")
    print(f"  still unverified rows:    {curated['unverified']}")
    for brand, old, new in curated["conflicts"][:10]:
        print(f"  CONFLICT kept existing: {brand!r} has {old!r}, curated says {new!r}")

    from_aman = sum(1 for d in drugs if d.get("_ingredient_from") == "aman")
    from_generic = sum(1 for d in drugs if d.get("_ingredient_from") == "generic name")
    from_curated = sum(1 for d in drugs if d.get("_ingredient_from") == "curated")
    for d in drugs:
        d.pop("_ingredient_from", None)

    ids = [d["id"] for d in drugs]
    assert len(ids) == len(set(ids)), "duplicate ids in output"
    for d in drugs:
        assert list(d) == keys, f"row {d['id']} keys {list(d)} != Drug type {keys}"

    drugs.sort(key=lambda d: (d["brand"].lower(), d["strength"], d["id"]))
    OUT.write_text(json.dumps(drugs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with REVIEW.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: opens cleanly in Excel
        w = csv.DictWriter(f, fieldnames=["aman_name", "aman_composition", "candidates", "reason"])
        w.writeheader()
        w.writerows(sorted(review, key=lambda r: (r["reason"], r["aman_name"].lower())))

    print("\n== Summary ==")
    print(f"price rows read:      {rows_read}")
    print(f"drugs written:        {len(drugs)}")
    print(f"skipped:              {skipped}")
    print(f"empty form:           {sum(1 for d in drugs if not d['form'])}")
    print(f"AMAN unique rows:     {len(aman)}")
    print(f"AMAN rows matched:    {how['matched']}  ({how['of which via full-name tie-breaker']} of them via the full-name tie-breaker)")
    print(f"AMAN rows to review:  {len(review)}  {dict(reasons)}")
    print(f"covered = true:       {sum(d['covered'] for d in drugs)} drugs")
    print(f"with ingredient:      {from_aman + from_generic + from_curated} drugs  "
          f"(AMAN match: {from_aman}, generic name: {from_generic}, curated: {from_curated})")
    print(f"file size:            {OUT.stat().st_size / 1024:.1f} KB  ({OUT.relative_to(ROOT)})")
    print(f"review file:          {REVIEW.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
