// Homepage: what MedPass is, in English and Arabic, and the three ways in.
// Phone first: one column, big buttons; wider screens just get more air.

import Link from "next/link";
import { Logo } from "@/components/Brand";
import OfflineNotice from "@/components/OfflineNotice";
import { Cedar } from "@/components/MedPassCard";

const doors = [
  {
    href: "/portal",
    en: "Hospital portal",
    ar: "بوابة المستشفى",
    hint: "For approved clinicians",
    hintAr: "للعاملين الصحيين المعتمدين",
    primary: true,
  },
  { href: "/scan", en: "Scan a card", ar: "مسح بطاقة", hint: "Works offline", hintAr: "يعمل بدون إنترنت", primary: false },
  { href: "/me", en: "My record", ar: "ملفي الطبي", hint: "See who opened it", hintAr: "شاهد من فتح ملفك", primary: false },
  {
    href: "/read",
    en: "Read my prescription",
    ar: "اقرأ وصفتي",
    hint: "Plain words, from a photo",
    hintAr: "بكلمات بسيطة، من صورة",
    primary: false,
  },
];

const steps = [
  { en: "A clinic reads your old papers with AI", ar: "يقرأ المركز الصحي أوراقك القديمة بالذكاء الاصطناعي" },
  { en: "You confirm and choose a PIN", ar: "تتحقّق من المعلومات وتختار رمزاً سرياً" },
  { en: "Your card works everywhere, even offline", ar: "بطاقتك تعمل في كل مكان، حتى بدون إنترنت" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <OfflineNotice />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5">
        <Logo />
        <span lang="ar" dir="rtl" className="text-lg font-bold text-ink">
          بطاقة ميدباس الطبية
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-8">
        <section className="relative flex flex-col gap-4 overflow-hidden">
          <div className="pointer-events-none absolute -end-10 -top-6 opacity-[0.06]" aria-hidden="true">
            <Cedar size="16rem" color="#2b8a6e" />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">Your medical record, around your neck.</h1>
          <p lang="ar" dir="rtl" className="text-3xl font-bold leading-snug text-brand-dark sm:text-4xl">
            سجلّك الطبي، معك أينما كنت.
          </p>
          <p className="max-w-xl text-xl leading-relaxed text-muted">
            MedPass is a medical ID card for Lebanon. Hospitals update it online; in a crisis it works offline, with no
            internet.
          </p>
          <p lang="ar" dir="rtl" className="max-w-xl text-xl leading-relaxed text-muted">
            ميدباس بطاقة طبية للبنان. تحدّثها المستشفيات عبر الإنترنت، وفي الأزمات تعمل بدون إنترنت.
          </p>
        </section>

        <nav className="grid gap-3 sm:grid-cols-2" aria-label="Start">
          {doors.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className={`flex min-h-24 flex-col justify-center gap-1 rounded-2xl border-2 px-5 py-4 transition-colors ${
                d.primary
                  ? "border-brand bg-brand text-white hover:bg-brand-dark"
                  : "border-line bg-white text-ink hover:border-brand"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2 text-xl font-bold">
                <span>{d.en}</span>
                <span lang="ar" dir="rtl">
                  {d.ar}
                </span>
              </span>
              <span className={`flex justify-between gap-2 text-base ${d.primary ? "text-white/85" : "text-muted"}`}>
                <span>{d.hint}</span>
                <span lang="ar" dir="rtl">
                  {d.hintAr}
                </span>
              </span>
            </Link>
          ))}
        </nav>

        <section className="flex flex-col gap-3" aria-label="How it works">
          <h2 className="text-lg font-semibold text-muted">
            How it works · <span lang="ar">كيف تعمل</span>
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-2xl border-2 border-line bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-ink">{s.en}</span>
                  <span lang="ar" dir="rtl" className="text-base text-muted">
                    {s.ar}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 border-t-2 border-line px-5 py-5 text-base text-muted">
        <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold text-brand-dark underline underline-offset-4">
          Privacy &amp; safety · <span lang="ar">الخصوصية والأمان</span>
        </Link>
        <span>Prototype · Hack for Health Lebanon 2026</span>
      </footer>
    </div>
  );
}
