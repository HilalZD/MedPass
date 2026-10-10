// Two languages = two elements. Never mix English and Arabic in one text element.
//
//   <Bi en="Save" ar="حفظ" />                    → English, then Arabic under it
//   <Bi en="…" ar="…" center />                  → both centred (hero, buttons, banners)
//
// English is lang="en" dir="ltr", Arabic is lang="ar" dir="rtl". With text-start
// that puts English on the left and Arabic on the right in cards, forms and lists.
// Arabic gets the "ar-text" class (app/globals.css): IBM Plex Sans Arabic looks
// smaller than Latin at the same size, so it is sized up to look equal.
// Inside an Arabic line, wrap IDs and numbers in <bdi> so they don't flip.

import type { ReactNode } from "react";

type Tag = "div" | "span" | "p" | "h1" | "h2" | "h3" | "label" | "legend";

export function Bi({
  en,
  ar,
  center = false,
  as: Tag = "span",
  className = "",
  enClassName = "",
  arClassName = "",
}: {
  en: ReactNode;
  ar: ReactNode;
  center?: boolean;
  as?: Tag;
  className?: string;
  enClassName?: string;
  arClassName?: string;
}) {
  const align = center ? "text-center" : "text-start";
  return (
    <Tag className={`flex flex-col gap-0.5 ${className}`}>
      <span lang="en" dir="ltr" className={`block ${align} ${enClassName}`}>
        {en}
      </span>
      <span lang="ar" dir="rtl" className={`ar-text block ${align} ${arClassName}`}>
        {ar}
      </span>
    </Tag>
  );
}

// A single Arabic line (when the English is shown elsewhere).
export function Ar({ children, className = "", center = false }: { children: ReactNode; className?: string; center?: boolean }) {
  return (
    <span lang="ar" dir="rtl" className={`ar-text block ${center ? "text-center" : "text-start"} ${className}`}>
      {children}
    </span>
  );
}
