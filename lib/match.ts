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
  /** "Did you mean...?" candidates for an unreadable line. Suggestions only: never sets drugId or status. */
  suggest: (rawText: string, n?: number) => DrugRow[];
};

const SUGGEST_FUZZY_THRESHOLD = 0.3; // a bit looser than matchMed: a human picks from the list
// Dose / frequency words removed before looking for the brand-like word.
const NOT_BRAND = new Set(
  "mg mcg g ml iu units unit tab tabs cap caps daily hs bid tid od x at bedtime before after meals".split(" "),
);
// Insulin products (ATC A10A): on a prescription "18 units" is the dose, not the product strength.
const isInsulin = (d: DrugRow) => (d.atc ?? "").startsWith("A10A");
const looksLikeDose = (strength: string | undefined) =>
  !!strength && /\b(u|units?|iu|ui)\b/i.test(strength) && !/\/\s*ml/i.test(strength);

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

    if (rows.some(isInsulin) && looksLikeDose(med.strength)) {
      // "Lantus 18 units": 18 is the patient's dose. Match on the brand alone.
      const single = distinctStrengths === 1 && distinctBrands(rows) === 1;
      return { drug: rows[0], confidence: single && brandIsSure ? "high" : "low" };
    }

    if (sameStrength.length && distinctBrands(sameStrength) === 1) {
      return { drug: sameStrength[0], confidence: brandIsSure ? "high" : "low" };
    }
    if (distinctStrengths === 1 && distinctBrands(rows) === 1) {
      // One product only. "high" only if the paper gives NO strength: a written strength
      // that differs ("Aspirin 81 mg" vs ASPIRIN PROTECT 100mg) must be checked by a human.
      // (Insulin doses like "Lantus 18 units" are handled by the insulin rule above.)
      return { drug: rows[0], confidence: brandIsSure && wanted.length === 0 ? "high" : "low" };
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

  // --- suggest(): "Did you mean...?" for unreadable lines --------------------
  // Index brands by their first word ("panadol advance" -> "panadol").
  const byFirstWord = new Map<string, string[]>();
  for (const b of brands) {
    const first = b.split(" ")[0];
    if (!byFirstWord.has(first)) byFirstWord.set(first, []);
    byFirstWord.get(first)!.push(b);
  }
  const firstWords = [...byFirstWord.keys()];
  const firstWordFuse = new Fuse(firstWords, { includeScore: true, threshold: SUGGEST_FUZZY_THRESHOLD, ignoreLocation: true });

  /**
   * "?anadol500 عند اللزوم" -> PANADOL ... 500mg. The AI writes "?" for a letter it
   * could not read. Steps: drop numbering, Arabic and dose/frequency words, take
   * the first word with 3+ letters as the brand, match "?" as any one letter
   * (then fuzzy without the "?"), and prefer rows whose strength matches.
   * Returns [] when nothing is close: never a guess just to fill the list.
   */
  function suggest(rawText: string, n = 3): DrugRow[] {
    let text = rawText
      .replace(/^\s*\d+\s*[.)]\s*/, "") // "3. " / "3) "
      .replace(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g, " ") // Arabic
      .replace(/\d+\s*[x×]\s*\d+/gi, " ") // "1x1" frequency
      .replace(/\b\d+\s*(tabs?|caps?)\b/gi, " "); // "1 tab"
    text = text.replace(/([a-z?])(\d)/gi, "$1 $2").replace(/(\d)([a-z?])/gi, "$1 $2"); // "?anadol500" -> "?anadol 500"

    const words = text.toLowerCase().split(/[^a-z0-9?.]+/).map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean);
    const brandWord = words.find((w) => !NOT_BRAND.has(w) && (w.match(/[a-z]/g) ?? []).length >= 3);
    if (!brandWord) return [];
    const wanted = strengthNumbers(words.filter((w) => /^\d/.test(w)).join(" "));

    // Candidate brands with a rank: wildcard / exact first word = 0, fuzzy = 1 + score.
    const rank = new Map<string, number>();
    const pattern = new RegExp(`^${brandWord.replace(/[.*+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, "[a-z]")}$`);
    for (const w of firstWords) if (pattern.test(w)) for (const b of byFirstWord.get(w)!) rank.set(b, 0);
    const plain = brandWord.replace(/\?/g, "");
    const firstLetter = /^[a-z]/.test(brandWord) ? brandWord[0] : ""; // a clearly read first letter
    if (plain.length >= 3) {
      for (const hit of firstWordFuse.search(plain)) {
        const score = hit.score ?? 1;
        // Similar length only (a "?" stands for one letter): "lytor" must not become a much longer name.
        if (score > SUGGEST_FUZZY_THRESHOLD || Math.abs(hit.item.length - brandWord.length) > 2) continue;
        // Keep a first letter that was read clearly: "Ly?tor" must not become "GLYSTOR".
        if (firstLetter && hit.item[0] !== firstLetter) continue;
        for (const b of byFirstWord.get(hit.item)!) if (!rank.has(b)) rank.set(b, 1 + score);
      }
    }
    if (!rank.size) return [];

    const strengthRank = (d: DrugRow) => {
      const nums = strengthNumbers(d.strength);
      if (wanted.length && sameNumbers(nums, wanted)) return 0;
      if (wanted.length && nums[0] === wanted[0]) return 1;
      return 2;
    };
    const rows = [...rank.keys()].flatMap((b) => byBrand.get(b)!);
    rows.sort(
      (a, b) =>
        rank.get(normalize(a.brand))! - rank.get(normalize(b.brand))! ||
        strengthRank(a) - strengthRank(b) ||
        normalize(a.brand).split(" ").length - normalize(b.brand).split(" ").length || // plainest name first
        a.price - b.price,
    );
    const seen = new Set<string>();
    const out: DrugRow[] = [];
    for (const d of rows) {
      const key = `${normalize(d.brand)}|${strengthNumbers(d.strength).join("/")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
      if (out.length >= n) break;
    }
    return out;
  }

  return { matchMed, alternatives, suggest };
}

function closestByStrength(rows: DrugRow[], wanted: number[]): DrugRow {
  if (!wanted.length) return rows[0];
  const distance = (r: DrugRow) => {
    const n = strengthNumbers(r.strength);
    return n.length ? Math.abs(n[0] - wanted[0]) : Infinity;
  };
  return rows.reduce((best, r) => (distance(r) < distance(best) ? r : best), rows[0]);
}
