/**
 * Offline medication matching against the MoPH drug list (public/drugs.json).
 *
 * Pure functions: nothing here touches the network except loadDrugs(), which
 * fetches /drugs.json once (the service worker serves it offline). Works in the
 * browser and in Node (tests pass the rows in directly).
 *
 *   const drugs = await loadDrugs();
 *   const { matchMed, alternatives } = createMatcher(drugs);
 *   const m = matchMed(med);            // { drug, confidence } or null
 *   const alts = m ? alternatives(m.drug) : [];
 *
 * Rules (never guess):
 *   - Match the BRAND first: exact name, then "brand starts with these words"
 *     (Coversyl -> COVERSYL ARGININE), then a strict fuzzy match for typos.
 *   - "high" only when the brand matched exactly/by prefix AND the strength
 *     matches (or that brand exists in a single strength, e.g. Lantus 100 IU/ml,
 *     where "18 IU" on the paper is a dose, not a product).
 *   - Anything less certain is "low" (the UI says "Check: closest match").
 *   - Nothing reasonable -> null ("Not found in the MoPH list").
 */

import Fuse from "fuse.js";
import type { Drug, Med } from "./types";

/** A drugs.json row. `atc` is an extra field not (yet) in the shared Drug type. */
export type DrugRow = Drug & { atc?: string };
export type MedMatch = { drug: DrugRow; confidence: "high" | "low" };
export type Matcher = {
  matchMed: (med: Med) => MedMatch | null;
  alternatives: (drug: DrugRow) => DrugRow[];
};

const FUZZY_THRESHOLD = 0.2; // Fuse score: 0 = perfect, 1 = anything. Strict on purpose.
const MAX_ALTERNATIVES = 5;

/** "Glucophage XR" -> "glucophage xr"; accents and punctuation removed. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** All numbers in a strength, sorted: "80/12.5 mg" -> [12.5, 80]; "1,000mg" -> [1000]. */
export function strengthNumbers(text: string | undefined): number[] {
  if (!text) return [];
  const cleaned = text.replace(/\([^)]*\)/g, " ").replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  return (cleaned.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => parseFloat(n.replace(",", "."))).sort((a, b) => a - b);
}

const sameNumbers = (a: number[], b: number[]) => a.length > 0 && a.length === b.length && a.every((n, i) => n === b[i]);

/** Coarse dosage-form family, so a tablet is never offered as an alternative to an injection. */
export function formFamily(form: string): string {
  const f = normalize(form);
  if (/inhal|aerosol|evohaler|diskus|turbuhaler|nebul|respirator|inhaler/.test(f)) return "inhalation";
  if (/eye|ophthalm|collyre/.test(f)) return "eye";
  if (/inject|infus|vial|ampoule|ampul|syringe|pen\b|cartridge|\biv\b|\bim\b|lyophili|freeze dried/.test(f)) return "injection";
  if (/tablet|\btab|caplet|comprim|capsule|gelule|lozenge|pill|dragee/.test(f)) return "oral solid";
  if (/syrup|suspension|elixir|drops|liquid|sirop|oral solution|solution|sachet|granule|powder for oral/.test(f)) return "oral liquid";
  if (/cream|ointment|gel|lotion|topical|paste|foam|spray/.test(f)) return "topical";
  if (/suppos|rectal|enema/.test(f)) return "rectal";
  return `other:${f}`;
}

let drugsPromise: Promise<DrugRow[]> | undefined;

/** Browser only: fetch /drugs.json once and keep it in memory. */
export function loadDrugs(): Promise<DrugRow[]> {
  if (!drugsPromise) {
    drugsPromise = fetch("/drugs.json")
      .then((r) => {
        if (!r.ok) throw new Error(`drugs.json: HTTP ${r.status}`);
        return r.json() as Promise<DrugRow[]>;
      })
      .catch((e) => {
        drugsPromise = undefined; // allow a retry later
        throw e;
      });
  }
  return drugsPromise;
}

export function createMatcher(drugs: DrugRow[]): Matcher {
  // Index rows by normalized brand, and build the fuzzy index once over the distinct brands.
  const byBrand = new Map<string, DrugRow[]>();
  for (const d of drugs) {
    const key = normalize(d.brand);
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key)!.push(d);
  }
  const brands = [...byBrand.keys()];
  const fuse = new Fuse(brands, { includeScore: true, threshold: FUZZY_THRESHOLD, ignoreLocation: true });

  /** Rows for a written name, and how the brand was found. */
  function findBrand(name: string): { rows: DrugRow[]; how: "exact" | "prefix" | "fuzzy" } | null {
    const queries = [normalize(name), normalize(name.replace(/\d.*$/, ""))].filter((q, i, all) => q && all.indexOf(q) === i);
    for (const q of queries) {
      const exact = byBrand.get(q);
      if (exact) return { rows: exact, how: "exact" };
      const prefix = brands.filter((b) => b.startsWith(q + " "));
      if (prefix.length) return { rows: prefix.flatMap((b) => byBrand.get(b)!), how: "prefix" };
    }
    for (const q of queries) {
      const best = fuse.search(q)[0];
      if (best && (best.score ?? 1) <= FUZZY_THRESHOLD) return { rows: byBrand.get(best.item)!, how: "fuzzy" };
    }
    return null;
  }

  function matchMed(med: Med): MedMatch | null {
    const found = findBrand(med.name);
    if (!found) return null;
    const rows = [...found.rows].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
    const wanted = strengthNumbers(med.strength) .length ? strengthNumbers(med.strength) : strengthNumbers(med.name);

    const sameStrength = rows.filter((r) => sameNumbers(strengthNumbers(r.strength), wanted));
    const distinctBrands = (list: DrugRow[]) => new Set(list.map((r) => normalize(r.brand))).size;
    const distinctStrengths = new Set(rows.map((r) => strengthNumbers(r.strength).join("/"))).size;
    const brandIsSure = found.how !== "fuzzy";

    if (sameStrength.length && distinctBrands(sameStrength) === 1) {
      return { drug: sameStrength[0], confidence: brandIsSure ? "high" : "low" };
    }
    if (distinctStrengths === 1 && distinctBrands(rows) === 1) {
      // One product only (e.g. LANTUS 100IU/ml): the number on the paper is a dose.
      return { drug: rows[0], confidence: brandIsSure ? "high" : "low" };
    }
    // Brand found but strength missing, different, or several products: closest row, low.
    const closest = sameStrength[0] ?? closestByStrength(rows, wanted);
    return { drug: closest, confidence: "low" };
  }

  function alternatives(drug: DrugRow): DrugRow[] {
    const nums = strengthNumbers(drug.strength);
    if (!drug.atc || !nums.length) return [];
    const family = formFamily(drug.form);
    const self = normalize(drug.brand);
    const cheapestPerBrand = new Map<string, DrugRow>();
    for (const d of drugs) {
      const brand = normalize(d.brand);
      if (brand === self || d.atc !== drug.atc || formFamily(d.form) !== family) continue;
      if (!sameNumbers(strengthNumbers(d.strength), nums)) continue;
      const seen = cheapestPerBrand.get(brand);
      if (!seen || d.price < seen.price) cheapestPerBrand.set(brand, d);
    }
    return [...cheapestPerBrand.values()].sort((a, b) => a.price - b.price).slice(0, MAX_ALTERNATIVES);
  }

  return { matchMed, alternatives };
}

function closestByStrength(rows: DrugRow[], wanted: number[]): DrugRow {
  if (!wanted.length) return rows[0];
  const distance = (r: DrugRow) => {
    const n = strengthNumbers(r.strength);
    return n.length ? Math.abs(n[0] - wanted[0]) : Infinity;
  };
  return rows.reduce((best, r) => (distance(r) < distance(best) ? r : best), rows[0]);
}
