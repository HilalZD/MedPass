import Link from "next/link";

// Portal home. Phase 4 adds the MedPass ID lookup.
export default function PortalHome() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Hospital portal</h1>
      <Link href="/portal/new" className="rounded-xl bg-blue-700 px-5 py-5 text-center text-xl font-semibold text-white">
        + New patient · مريض جديد
      </Link>
    </div>
  );
}
