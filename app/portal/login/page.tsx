"use client";

// Clinician login. Accounts are created by an admin; there is no sign-up.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cedar } from "@/components/MedPassCard";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
      setError("No internet connection. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col text-ink">
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center text-center">
        <Cedar size="3.5rem" color="#2b8a6e" />
        <h1 className="mt-2 text-3xl font-bold text-ink">MedPass Portal</h1>
        <p className="mt-1 text-lg text-muted">For approved clinicians</p>
        <p className="text-lg text-muted" dir="rtl" lang="ar">
          للعاملين الصحيين المعتمدين
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-lg font-medium">
          <span>
            Email · <span lang="ar">البريد الإلكتروني</span>
          </span>
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
          <span>
            Password · <span lang="ar">كلمة المرور</span>
          </span>
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
          {loading ? "Logging in…" : "Log in · تسجيل الدخول"}
        </button>
      </form>
    </main>
    </div>
  );
}
