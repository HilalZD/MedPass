// Layout for every logged-in portal page. The "(app)" folder name is a route
// group: it does not appear in the URL, it just keeps /portal/login out of
// this layout (no header on the login page).

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Brand";
import OfflineNotice from "@/components/OfflineNotice";
import { SessionWatcher } from "./new/ui";
import { getClinician } from "@/lib/db/auth";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="flex flex-1 flex-col text-ink">
      <OfflineNotice />
      <SessionWatcher />
      <header className="border-b-4 border-brand bg-white">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo href="/portal" subtitle="Hospital portal" />
          {/* Reading the login cookie must happen inside <Suspense> (Cache Components). */}
          <Suspense fallback={<span className="text-muted">…</span>}>
            <ClinicianBadge />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">{children}</main>
    </div>
  );
}

async function ClinicianBadge() {
  const clinician = await getClinician();
  // Logged in, but not linked to a facility (or the link was removed).
  if (!clinician) redirect("/portal/login");

  return (
    <div className="flex items-center gap-3">
      <span className="flex flex-col text-start text-base leading-tight">
        <span className="font-semibold text-ink">{clinician.fullName}</span>
        <span className="text-muted">{clinician.facilityName}</span>
      </span>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="min-h-11 rounded-xl border-2 border-line bg-white px-4 py-2 text-base font-semibold hover:border-brand"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
