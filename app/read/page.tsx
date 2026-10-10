"use client";

// /read: "Read my prescription", for patients at home. Public, no login.
// One photo → what is written, in plain words, with a picture schedule.
// It explains the paper; it never replaces the doctor or the pharmacist.
// No photo or result is stored anywhere (the server forgets it after answering).

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Brand";
import DrugInfo from "@/components/DrugInfo";
import OfflineNotice, { OFFLINE_AR, OFFLINE_EN } from "@/components/OfflineNotice";
import { BLURRY_BELOW, photoSharpness, resizeImage } from "@/lib/image";
import { SLOTS, type Lang, type ReadLine, type Slot } from "@/lib/read";

const T = {
  en: {
    title: "Read my prescription",
    intro: "Take a photo of your prescription. We will explain what is written on it, in simple words.",
    note: "This explains what is written on your prescription. It does not replace your doctor or pharmacist.",
    take: "Take a photo",
    upload: "Choose a photo",
    retake: "Take another photo",
    blurry: "This photo looks blurry or dark. Retake it in better light.",
    read: "Read it",
    reading: "Reading your prescription… (10 to 30 seconds)",
    slow: "This is taking longer than usual. Please wait a little more.",
    results: "What your prescription says",
    for: "For",
    notRegistered: "We couldn't confirm this exact medicine in the Lebanese list. Ask your pharmacist.",
    registered: "Registered in Lebanon (MoPH)",
    price: "Public price",
    currency: "LBP",
    seen: "Letters we could see",
    schedule: "Your day",
    medicine: "Medicine",
    times: (n: number) => `${n} ${n === 1 ? "time" : "times"} a day. The times are not written: ask your pharmacist.`,
    readAloud: "Read aloud",
    stop: "Stop",
    footer: "Questions? Ask your pharmacist. No photo or data was saved.",
    another: "Read another prescription",
    offline: OFFLINE_EN,
    network: "Could not reach the server. Check the connection and try again.",
  },
  ar: {
    title: "اقرأ وصفتي",
    intro: "التقط صورة لوصفتك الطبية. سنشرح لك ما هو مكتوب فيها بكلمات بسيطة.",
    note: "هذا يشرح ما هو مكتوب على وصفتك. لا يغني عن طبيبك أو الصيدلي.",
    take: "التقط صورة",
    upload: "اختر صورة",
    retake: "التقط صورة أخرى",
    blurry: "تبدو الصورة غير واضحة أو مظلمة. أعد التصوير بإضاءة أفضل.",
    read: "اقرأها",
    reading: "جارٍ قراءة وصفتك… (من ١٠ إلى ٣٠ ثانية)",
    slow: "يستغرق هذا وقتاً أطول من المعتاد. يرجى الانتظار قليلاً.",
    results: "ماذا تقول وصفتك",
    for: "لـ",
    notRegistered: "لم نتمكن من التأكد من هذا الدواء بالتحديد في اللائحة اللبنانية. اسأل الصيدلي.",
    registered: "مسجّل في لبنان (وزارة الصحة)",
    price: "السعر للعموم",
    currency: "ل.ل.",
    seen: "الحروف التي استطعنا رؤيتها",
    schedule: "يومك",
    medicine: "الدواء",
    times: (n: number) => `${n === 1 ? "مرة واحدة" : n === 2 ? "مرتان" : `\u2068${n}\u2069 مرات`} في اليوم. الأوقات غير مكتوبة: اسأل الصيدلي.`,
    readAloud: "اقرأ بصوت عالٍ",
    stop: "إيقاف",
    footer: "عندك أسئلة؟ اسأل الصيدلي. لم يتم حفظ أي صورة أو معلومات.",
    another: "اقرأ وصفة أخرى",
    offline: OFFLINE_AR,
    network: "تعذّر الوصول إلى الخادم. تحقّق من الاتصال وحاول مجدداً.",
  },
};

// Pictures for the daily schedule, so it can be followed without reading.
const SLOT_ICON: Record<Slot, string> = { morning: "☀️", noon: "🌤️", evening: "🌆", bedtime: "🌙", asNeeded: "🆘" };
const SLOT_NAME: Record<Lang, Record<Slot, string>> = {
  en: { morning: "Morning", noon: "Noon", evening: "Evening", bedtime: "Bedtime", asNeeded: "When needed" },
  ar: { morning: "صباحاً", noon: "ظهراً", evening: "مساءً", bedtime: "قبل النوم", asNeeded: "عند الحاجة" },
};

const btnPrimary = "min-h-14 rounded-2xl bg-brand px-5 py-4 text-xl font-semibold text-white hover:bg-brand-dark disabled:opacity-40";
const btnSecondary = "min-h-12 rounded-2xl border-2 border-line bg-white px-4 py-3 text-lg font-semibold text-ink hover:border-brand disabled:opacity-40";

export default function ReadPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [photo, setPhoto] = useState<string | null>(null);
  const [blurry, setBlurry] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<ReadLine[] | null>(null);
  const [warning, setWarning] = useState("");
  const t = T[lang];

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setLines(null);
    try {
      const resized = await resizeImage(file);
      setPhoto(resized);
      setBlurry((await photoSharpness(resized).catch(() => Infinity)) < BLURRY_BELOW);
    } catch {
      setError(lang === "ar" ? "تعذّر فتح هذه الصورة. جرّب صورة أخرى." : "Could not open this photo. Try another one.");
    }
  }

  async function read() {
    if (!photo) return;
    setLoading(true);
    setSlow(false);
    setError("");
    setWarning("");
    const slowTimer = setTimeout(() => setSlow(true), 25_000);
    try {
      const res = await fetch("/api/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo, lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((lang === "ar" && data.errorAr) || data.error || t.network);
      setLines(data.lines ?? []);
      setWarning(data.warning ?? "");
      setPhoto(null); // not needed any more; never kept
      window.scrollTo(0, 0);
    } catch (e) {
      setError(!navigator.onLine ? t.offline : e instanceof TypeError ? t.network : e instanceof Error ? e.message : t.network);
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlow(false);
    }
  }

  function reset() {
    setLines(null);
    setWarning("");
    setPhoto(null);
    setError("");
  }

  return (
    <div className={`flex flex-1 flex-col text-ink ${lang === "ar" ? "ar-text" : ""}`} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <OfflineNotice />
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 pt-4">
        <Logo />
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          className="min-h-12 rounded-2xl border-2 border-line bg-white px-4 text-lg font-semibold hover:border-brand"
        >
          {lang === "en" ? "عربي" : "English"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 p-4">
        <h1 className="text-3xl font-bold">{t.title}</h1>

        {lines === null && (
          <>
            <p className="text-xl leading-relaxed">{t.intro}</p>
            <p className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-lg text-amber-950" role="note">
              {t.note}
            </p>

            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="max-h-80 w-full rounded-2xl border-2 border-line object-contain" />
            )}
            {photo && blurry && <p className="rounded-2xl bg-amber-100 p-3 text-lg text-amber-950">{t.blurry}</p>}

            <div className="grid grid-cols-2 gap-3">
              <label className={`${photo ? btnSecondary : btnPrimary} flex cursor-pointer items-center justify-center text-center ${loading ? "pointer-events-none opacity-40" : ""}`}>
                {photo ? t.retake : t.take}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className={`${btnSecondary} flex cursor-pointer items-center justify-center text-center ${loading ? "pointer-events-none opacity-40" : ""}`}>
                {t.upload}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {photo && (
              <button className={btnPrimary} disabled={loading} onClick={read}>
                {loading ? t.reading : t.read}
              </button>
            )}
            {slow && <p className="text-lg text-amber-950">{t.slow}</p>}
            {error && (
              <p role="alert" className="rounded-2xl bg-red-100 p-4 text-lg text-red-900">
                {error}
              </p>
            )}
          </>
        )}

        {lines !== null && <Results lines={lines} warning={warning} lang={lang} onAnother={reset} />}

        <footer className="mt-auto border-t-2 border-line pt-4 text-center text-lg text-muted">{t.footer}</footer>
      </main>
    </div>
  );
}

function Results({ lines, warning, lang, onAnother }: { lines: ReadLine[]; warning: string; lang: Lang; onAnother: () => void }) {
  const t = T[lang];
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{t.results}</h2>
        <ReadAloud lines={lines} lang={lang} />
      </div>
      {warning && <p className="rounded-2xl bg-amber-100 p-4 text-lg text-amber-950">{warning}</p>}

      <ul className="flex flex-col gap-4">
        {lines.map((l, i) => (
          <MedCard key={i} line={l} lang={lang} />
        ))}
      </ul>

      {lines.some((l) => l.kind !== "unreadable") && <ScheduleGrid lines={lines} lang={lang} />}

      <button className={btnSecondary} onClick={onAnother}>
        {t.another}
      </button>
    </section>
  );
}

function MedCard({ line, lang }: { line: ReadLine; lang: Lang }) {
  const t = T[lang];
  const unreadable = line.kind === "unreadable";
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${unreadable ? "border-amber-400 bg-amber-50" : "border-line bg-white"}`}>
      {!unreadable && (
        <p className="text-2xl font-bold" dir="ltr">
          {line.name} {line.strength}
        </p>
      )}
      {line.purpose && (
        <p className="text-lg">
          <span className="font-semibold">{t.for}:</span> {line.purpose}
        </p>
      )}
      <p className="text-xl leading-relaxed">{line.explanation}</p>
      {unreadable && line.seen && (
        <p className="text-base text-muted">
          {t.seen}: <span className="font-mono" dir="auto">{line.seen}</span>
        </p>
      )}
      {!unreadable &&
        (line.registered ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand px-3 py-1 text-base font-semibold text-white">✓ {t.registered}</span>
              <span className="text-lg">
                {t.price}: <span dir="ltr">{line.registered.drug.price.toLocaleString("en-US")} {t.currency}</span>
              </span>
            </p>
            <DrugInfo
              med={{ name: line.name ?? "", strength: line.strength, status: "green", verified: "patient" }}
              match={line.registered.match}
              alternatives={line.registered.alternatives}
              lang={lang}
            />
          </>
        ) : (
          <p className="text-base text-amber-900">{t.notRegistered}</p>
        ))}
    </li>
  );
}

// Morning / Noon / Evening / Bedtime / When needed, with pictures.
// Only times WRITTEN on the prescription are marked.
function ScheduleGrid({ lines, lang }: { lines: ReadLine[]; lang: Lang }) {
  const t = T[lang];
  const rows = lines.filter((l) => l.kind !== "unreadable");
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold">{t.schedule}</h2>
      <div className="overflow-x-auto rounded-2xl border-2 border-line bg-white">
        <table className="w-full table-fixed border-collapse text-center">
          <thead>
            <tr className="border-b-2 border-line bg-mint">
              <th className="w-[30%] p-1.5 text-start text-sm">{t.medicine}</th>
              {SLOTS.map((s) => (
                <th key={s} className="px-0.5 py-1 text-xs font-semibold leading-tight">
                  <span className="block text-xl" aria-hidden="true">
                    {SLOT_ICON[s]}
                  </span>
                  {SLOT_NAME[lang][s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i} className="border-b border-line align-middle last:border-0">
                <td className="break-words p-1.5 text-start text-sm font-semibold" dir="ltr">
                  {l.name}
                  {l.schedule.slots.length === 0 && l.schedule.timesPerDay && (
                    <span className="block text-sm font-normal text-amber-900" dir={lang === "ar" ? "rtl" : "ltr"}>
                      {t.times(l.schedule.timesPerDay)}
                    </span>
                  )}
                </td>
                {SLOTS.map((s) => (
                  <td key={s} className="p-0.5 text-xl">
                    {l.schedule.slots.includes(s) ? (
                      <span role="img" aria-label={SLOT_NAME[lang][s]}>
                        💊
                      </span>
                    ) : (
                      ""
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// "Read aloud" with the browser's own voices. Hidden if there is no voice for the language.
function ReadAloud({ lines, lang }: { lines: ReadLine[]; lang: Lang }) {
  const t = T[lang];
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pickVoice = () => setVoice(window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null);
    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
      window.speechSynthesis.cancel();
    };
  }, [lang]);

  if (!voice) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const text = [t.results, ...lines.map((l) => [l.explanation, l.purpose ? `${t.for}: ${l.purpose}` : ""].filter(Boolean).join(" ")), t.footer].join(". ");
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice!.lang;
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterance.current = u;
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <button type="button" onClick={toggle} className="min-h-12 rounded-2xl border-2 border-brand bg-white px-4 text-lg font-semibold text-brand-dark hover:bg-brand-50">
      {speaking ? `⏹ ${t.stop}` : `🔊 ${t.readAloud}`}
    </button>
  );
}
