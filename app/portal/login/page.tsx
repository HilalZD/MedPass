"use client";

// Clinician login. Accounts are created by an admin; there is no sign-up.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CedarMark } from "@/components/Brand";
import { Bi } from "@/components/Bi";
import OfflineNotice, { OFFLINE_EN } from "@/components/OfflineNotice";
import { DEMO_MODE } from "@/lib/demo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login("/api/auth/login", { email, password });
  }

  // Demo buttons send only WHICH demo user; the server holds the credentials.
  const demoLogin = (who: "nurse" | "doctor") => login("/api/auth/demo-login", { who });

  async function login(url: string, body: object) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not log in. Please try again.");
        return;
      }
      // Go back to the page they tried to open, but only inside the portal.
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/portal/") ? next : "/portal");
      router.refresh();
    } catch {
      setError(navigator.onLine ? "Could not reach the server. Check the connection and try again." : OFFLINE_EN);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col text-ink">
    <OfflineNotice />
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center text-center">
        <CedarMark height="4.5rem" />
        <Bi as="h1" center en="MedPass Portal" ar="بوابة ميدباس" className="mt-2 text-3xl font-bold text-ink" />
        <Bi as="p" center en="For approved clinicians" ar="للعاملين الصحيين المعتمدين" className="mt-1 text-lg text-muted" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-lg font-medium">
          <Bi en="Email" ar="البريد الإلكتروني" />
          <input
            type="email"
            autoComplete="username"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl border-2 border-line bg-white p-4 text-lg focus:border-brand focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-lg font-medium">
          <Bi en="Password" ar="كلمة المرور" />
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl border-2 border-line bg-white p-4 text-lg focus:border-brand focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-red-100 p-4 text-lg text-red-900">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="min-h-14 rounded-2xl bg-brand p-4 text-xl font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? <span lang="en" dir="ltr">Logging in…</span> : <Bi center en="Log in" ar="تسجيل الدخول" />}
        </button>
      </form>

      {DEMO_MODE && (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
          <p className="text-center text-base font-semibold text-amber-950">For judges: one tap, fictional demo accounts</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => demoLogin("nurse")}
            className="min-h-14 rounded-2xl border-2 border-brand bg-white px-4 text-lg font-semibold text-brand-dark hover:bg-brand-50 disabled:opacity-60"
          >
            Demo: Nurse Rana (Tyre)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => demoLogin("doctor")}
            className="min-h-14 rounded-2xl border-2 border-brand bg-white px-4 text-lg font-semibold text-brand-dark hover:bg-brand-50 disabled:opacity-60"
          >
            Demo: Dr. Karim (Beirut)
          </button>
        </section>
      )}
    </main>
    </div>
  );
}
