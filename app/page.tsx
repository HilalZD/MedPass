// Homepage: what MedPass is, in English and Arabic, and the four ways in.
// Phone first: one column, big buttons; wider screens just get more air.
// English and Arabic are always separate elements (components/Bi.tsx).

import Link from "next/link";
import { Bi } from "@/components/Bi";
import { CedarMark, Logo } from "@/components/Brand";
import OfflineNotice from "@/components/OfflineNotice";

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
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 pt-5">
        <Logo />
        <span lang="ar" dir="rtl" className="ar-text text-lg font-bold text-ink">
          بطاقة ميدباس الطبية
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-8">
        {/* Hero: centred, English on top, Arabic directly under it. */}
        <section className="relative flex flex-col items-center gap-5 overflow-hidden py-2 text-center">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]" aria-hidden="true">
            <CedarMark height="18rem" />
          </div>
          <Bi
            as="h1"
            center
            className="relative gap-2 text-4xl font-bold sm:text-5xl"
            enClassName="leading-tight text-balance text-ink"
            arClassName="leading-snug text-balance text-brand-dark"
            en="Your medical record in one scan, wherever you are."
            ar="سجلّك الطبي بمسحة واحدة، أينما كنت."
          />
          <Bi
            as="div"
            center
            className="relative max-w-xl gap-2 text-xl text-muted"
            enClassName="leading-relaxed text-pretty"
            arClassName="text-pretty"
            en="MedPass is a medical ID card for Lebanon. Hospitals update it online; in a crisis it works offline, with no internet."
            ar="ميدباس بطاقة طبية للبنان. تحدّثها المستشفيات عبر الإنترنت، وفي الأزمات تعمل بدون إنترنت."
          />
        </section>

        {/* Buttons with both languages: English and Arabic on two lines, centred. */}
        <nav className="grid gap-3 sm:grid-cols-2" aria-label="Start">
          {doors.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-5 py-4 transition-colors ${
                d.primary ? "border-brand bg-brand text-white hover:bg-brand-dark" : "border-line bg-white text-ink hover:border-brand"
              }`}
            >
              <Bi center en={d.en} ar={d.ar} className="text-xl font-bold" />
              <Bi center en={d.hint} ar={d.hintAr} className={`text-base ${d.primary ? "text-white/85" : "text-muted"}`} />
            </Link>
          ))}
        </nav>

        <section className="flex flex-col gap-3" aria-label="How it works">
          <Bi as="h2" center en="How it works" ar="كيف تعمل" className="text-lg font-semibold text-muted" />
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={i} className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-white p-4">
                <span className="flex h-9 w-9 items-center justify-center self-center rounded-full bg-brand text-lg font-bold text-white">
                  {i + 1}
                </span>
                {/* Cards: English left-aligned, Arabic right-aligned, stacked. */}
                <Bi en={s.en} ar={s.ar} className="gap-1 text-lg" enClassName="font-semibold text-ink" arClassName="text-muted" />
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 border-t-2 border-line px-5 py-5 text-center text-base text-muted">
        <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold text-brand-dark underline underline-offset-4">
          <Bi center en="Privacy & safety" ar="الخصوصية والأمان" />
        </Link>
        <span lang="en" dir="ltr">
          Prototype · Hack for Health Lebanon 2026
        </span>
      </footer>
    </div>
  );
}
