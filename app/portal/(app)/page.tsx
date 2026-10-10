import Link from "next/link";
import Lookup from "./Lookup";

// Portal home: open an existing patient, or create a new one.
export default function PortalHome() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Hospital portal</h1>
      <Lookup />
      <Link
        href="/portal/new"
        className="rounded-xl border-2 border-blue-700 bg-white px-5 py-5 text-center text-xl font-semibold text-blue-800"
      >
        + New patient · مريض جديد
      </Link>
    </div>
  );
}
