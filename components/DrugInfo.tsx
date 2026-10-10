/**
 * Shows what the MoPH drug list says about one medication: matched product,
 * ingredient, public price, AMAN coverage and same-ingredient alternatives.
 *
 * Purely presentational: no fetching, no state. The parent does
 *   const { matchMed, alternatives } = createMatcher(await loadDrugs());
 *   const match = matchMed(med);
 *   <DrugInfo med={med} match={match} alternatives={match ? alternatives(match.drug) : []} />
 */

import type { DrugRow, MedMatch } from "@/lib/match";
import type { Med } from "@/lib/types";

type Lang = "en" | "ar";

const T = {
  en: {
    prescribed: "On the prescription",
    match: "MoPH match",
    ingredient: "Ingredient",
    unknown: "Unknown",
    price: "Public price",
    currency: "LBP",
    covered: "On the MoPH AMAN list",
    notCovered: "Not on the MoPH AMAN list",
    check: "Check: closest match",
    altHeading: "Same ingredient & strength (ask a pharmacist before switching)",
    noAlt: "No alternatives data",
    notFound: "Not found in the MoPH list",
  },
  ar: {
    prescribed: "في الوصفة",
    match: "المطابقة في لائحة وزارة الصحة",
    ingredient: "المادة الفعّالة",
    unknown: "غير معروفة",
    price: "السعر للعموم",
    currency: "ل.ل.",
    covered: "على لائحة أمان لوزارة الصحة",
    notCovered: "ليس على لائحة أمان لوزارة الصحة",
    check: "تحقّق: أقرب تطابق",
    altHeading: "نفس المادة الفعّالة والعيار (اسأل الصيدلي قبل التبديل)",
    noAlt: "لا تتوفر بيانات عن بدائل",
    notFound: "غير موجود في لائحة وزارة الصحة",
  },
} as const;

// Western digits with thousands separators in both languages: prices must be unambiguous.
const formatPrice = (lbp: number) => new Intl.NumberFormat("en-US").format(lbp);

export default function DrugInfo({
  med,
  match,
  alternatives,
  lang = "en",
}: {
  med: Med;
  match: MedMatch | null;
  alternatives: DrugRow[];
  lang?: Lang;
}) {
  const t = T[lang];
  const written = [med.name, med.strength].filter(Boolean).join(" ");

  return (
    <section dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="rounded-2xl border border-gray-300 bg-white p-4 text-lg text-gray-900">
      <p className="text-base text-gray-600">
        {t.prescribed}: <span className="font-semibold text-gray-900">{written}</span>
      </p>

      {!match ? (
        <p className="mt-3 rounded-xl bg-gray-100 px-4 py-3 font-semibold">{t.notFound}</p>
      ) : (
        <>
          {match.confidence === "low" && (
            <p className="mt-3 rounded-xl border border-yellow-400 bg-yellow-100 px-4 py-2 font-semibold text-yellow-900">{t.check}</p>
          )}

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-gray-600">{t.match}</dt>
            <dd className="font-bold">
              <bdi>
                {match.drug.brand} {match.drug.strength}
              </bdi>
            </dd>
            <dt className="text-gray-600">{t.ingredient}</dt>
            <dd>
              <bdi>{match.drug.ingredient || t.unknown}</bdi>
            </dd>
            <dt className="text-gray-600">{t.price}</dt>
            <dd className="font-semibold">
              <bdi>
                {formatPrice(match.drug.price)} {t.currency}
              </bdi>
            </dd>
          </dl>

          {match.drug.covered ? (
            <p className="mt-3 inline-block rounded-full bg-green-700 px-4 py-1 font-semibold text-white">{t.covered}</p>
          ) : (
            <p className="mt-3 text-base text-gray-500">{t.notCovered}</p>
          )}

          <h3 className="mt-4 text-base font-semibold">{t.altHeading}</h3>
          {alternatives.length === 0 ? (
            <p className="mt-1 text-base text-gray-500">{t.noAlt}</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-200">
              {alternatives.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 py-2">
                  <bdi>
                    {a.brand} {a.strength}
                  </bdi>
                  <bdi className="shrink-0 font-semibold">
                    {formatPrice(a.price)} {t.currency}
                  </bdi>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
