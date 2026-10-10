// /privacy: plain-language privacy & safety answers, English + Arabic.
// Static page (no data, no login). Keep every answer true to the code.

import Link from "next/link";
import { Logo } from "@/components/Brand";

type QA = { q: string; qAr: string; a: React.ReactNode; aAr: string; note?: { en: string; ar: string } };

const answers: QA[] = [
  {
    q: "What do we collect?",
    qAr: "ما المعلومات التي نجمعها؟",
    a: (
      <>
        Name, date of birth, sex, blood type, allergies, conditions, medicines, referrals and visits.{" "}
        <strong>No national ID number.</strong> Photos of old prescriptions are read by the AI and{" "}
        <strong>never stored</strong>.
        <br />
        <strong>Photo:</strong> optional, with consent. It is printed on your card only. We never store it on our
        servers, never put it in the QR, and never send it to the AI.
      </>
    ),
    aAr: "الاسم، تاريخ الولادة، الجنس، فئة الدم، الحساسية، الأمراض، الأدوية، الإحالات والزيارات. لا نجمع رقم الهوية الوطنية. صور الوصفات القديمة يقرأها الذكاء الاصطناعي ولا تُحفظ أبداً. الصورة الشخصية: اختيارية وبموافقتك. تُطبع على بطاقتك فقط. لا نحفظها أبداً على خوادمنا، ولا نضعها في رمز QR، ولا نرسلها إلى الذكاء الاصطناعي.",
  },
  {
    q: "Who can see it?",
    qAr: "من يستطيع رؤيتها؟",
    a: (
      <>
        Only clinicians with an individual, approved account, <strong>and</strong> only after the patient gives their
        6-digit PIN. Two keys: neither the clinician nor the PIN alone opens a record. The patient can see every access
        at{" "}
        <Link href="/me" className="inline-flex min-h-11 items-center font-semibold text-brand-dark underline underline-offset-4">
          /me
        </Link>
        .
      </>
    ),
    aAr: "فقط العاملون الصحيون الذين لديهم حساب شخصي معتمد، وفقط بعد أن يعطي المريض رمزه السري المؤلف من ٦ أرقام. مفتاحان: لا الطبيب وحده ولا الرمز وحده يفتح الملف. يستطيع المريض رؤية كل من فتح ملفه على صفحة /me.",
  },
  {
    q: "What does the card show without a PIN?",
    qAr: "ماذا تُظهر البطاقة بدون رمز سري؟",
    a: (
      <>
        Name, date of birth, blood type, allergies and critical conditions: the minimum an emergency team needs.
        <strong> Everything else is encrypted</strong> inside the QR code.
      </>
    ),
    aAr: "الاسم، تاريخ الولادة، فئة الدم، الحساسية والحالات الحرجة: الحدّ الأدنى الذي يحتاجه فريق الطوارئ. كل المعلومات الأخرى مشفّرة داخل رمز QR.",
  },
  {
    q: "What if someone steals the card?",
    qAr: "ماذا لو سُرقت البطاقة؟",
    a: (
      <>
        The PIN protects the rest. Online, 5 wrong tries lock the record for 15 minutes, and every wrong try appears in
        the patient&apos;s access log.
      </>
    ),
    aAr: "الرمز السري يحمي باقي المعلومات. على الإنترنت، ٥ محاولات خاطئة تقفل الملف لمدة ١٥ دقيقة، وتظهر كل محاولة خاطئة في سجلّ المريض.",
    note: {
      en: "Honest note: on the offline card, a 6-digit PIN slows down a determined attacker but can't fully stop one. That is why only non-emergency data is behind it, and the full record stays protected online.",
      ar: "ملاحظة بصراحة: على البطاقة بدون إنترنت، الرمز المؤلف من ٦ أرقام يُبطئ المهاجم المصمّم لكنه لا يستطيع إيقافه تماماً. لهذا لا نضع خلفه إلا المعلومات غير الطارئة، ويبقى الملف الكامل محمياً على الإنترنت.",
    },
  },
  {
    q: "Where is the human in the loop?",
    qAr: "أين يبقى دور الإنسان؟",
    a: (
      <>
        The AI only transcribes; it never invents doses or diagnoses. A clinician and the patient confirm every item
        against the original paper. Names are always checked against an ID. The Ministry of Public Health drug list
        double-checks every medicine.
      </>
    ),
    aAr: "الذكاء الاصطناعي ينسخ فقط، ولا يخترع جرعات أو تشخيصات. يتحقّق العامل الصحي والمريض من كل معلومة مقابل الورقة الأصلية. تُطابَق الأسماء دائماً مع الهوية. ولائحة أدوية وزارة الصحة العامة تتحقّق من كل دواء.",
  },
  {
    q: "What if the internet or the servers go down?",
    qAr: "ماذا لو انقطع الإنترنت أو توقفت الخوادم؟",
    a: (
      <>
        The card still works offline. Anyone with the MedPass app can read the emergency info, and with the
        patient&apos;s PIN the rest of the card, with no internet at all.
      </>
    ),
    aAr: "البطاقة تبقى تعمل بدون إنترنت. أي شخص لديه تطبيق ميدباس يستطيع قراءة معلومات الطوارئ، ومع رمز المريض السري باقي البطاقة، بدون أي اتصال بالإنترنت.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5">
        <Logo />
        <Link href="/" className="inline-flex min-h-11 items-center text-base font-semibold text-brand-dark underline underline-offset-4">
          Home · <span lang="ar">الرئيسية</span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-ink">Privacy &amp; safety</h1>
          <p lang="ar" dir="rtl" className="text-2xl font-bold text-brand-dark">
            الخصوصية والأمان
          </p>
        </div>

        {answers.map((x) => (
          <section key={x.q} className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-white p-5">
            <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-xl font-bold text-ink">
              <span>{x.q}</span>
              <span lang="ar" dir="rtl" className="text-brand-dark">
                {x.qAr}
              </span>
            </h2>
            <p className="text-lg leading-relaxed text-ink">{x.a}</p>
            <p lang="ar" dir="rtl" className="text-lg leading-relaxed text-muted">
              {x.aAr}
            </p>
            {x.note && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-base leading-relaxed">
                <p className="text-amber-950">{x.note.en}</p>
                <p lang="ar" dir="rtl" className="mt-2 text-amber-950">
                  {x.note.ar}
                </p>
              </div>
            )}
          </section>
        ))}
      </main>

      <footer className="mx-auto w-full max-w-3xl border-t-2 border-line px-5 py-5 text-base text-muted">
        Prototype · Hack for Health Lebanon 2026 · Demo uses fictional patients only.
      </footer>
    </div>
  );
}
