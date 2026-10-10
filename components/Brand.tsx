// MedPass logo: the cedar (public/brand/cedar.svg) + "MedPass" wordmark.
// Used in every page header so the app and the card look like one product.
// (The ID card itself embeds the same SVG, see Cedar in components/MedPassCard.tsx.)

import Link from "next/link";

const ASPECT = 400 / 490; // the SVG's viewBox, width / height

// The cedar as a normal image file (cached by the browser and the service worker).
// `height` is any CSS length; the width follows the logo's shape.
export function CedarMark({ height, className = "" }: { height: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/cedar.svg"
      alt=""
      aria-hidden="true"
      className={className}
      style={{ height, width: `calc(${height} * ${ASPECT})` }}
    />
  );
}

export function Logo({ href = "/", subtitle = "Medical ID card" }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="MedPass home">
      <CedarMark height="2.75rem" />
      <span className="flex flex-col leading-tight" lang="en" dir="ltr">
        <span className="text-xl font-bold text-brand-dark">MedPass</span>
        <span className="text-sm text-muted">{subtitle}</span>
      </span>
    </Link>
  );
}
