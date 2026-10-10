// MedPass logo: the same cedar as the ID card (components/MedPassCard.tsx)
// + "MedPass" wordmark. Used in every page header so the app and the card
// look like one product.

import Link from "next/link";
import { Cedar } from "./MedPassCard";

export function Logo({ href = "/", subtitle = "Medical ID card" }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="MedPass home">
      <Cedar size="2.25rem" color="#2b8a6e" />
      <span className="flex flex-col leading-tight">
        <span className="text-xl font-bold text-brand-dark">MedPass</span>
        <span className="text-sm text-muted">{subtitle}</span>
      </span>
    </Link>
  );
}
