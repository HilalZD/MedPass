// Layout for every logged-in portal page. The "(app)" folder name is a route
// group: it does not appear in the URL, it just keeps /portal/login out of
// this layout (no header on the login page).

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getClinician } from "@/lib/db/auth";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="flex flex-1 flex-col bg-white text-gray-900" style={{ colorScheme: "light" }}>
      <header className="flex items-center justify-between gap-3 border-b-2 border-gray-200 bg-white px-4 py-3">
        <a href="/portal" className="text-xl font-bold">
          MedPass
        </a>
        {/* Reading the login cookie must happen inside <Suspense> (Cache Components). */}
        <Suspense fallback={<span className="text-gray-500">…</span>}>
          <ClinicianBadge />
        </Suspense>
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
      <span className="text-start text-base text-gray-700">
        {clinician.fullName} · {clinician.facilityName}
      </span>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-xl border-2 border-gray-300 px-4 py-2 text-base font-semibold"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
