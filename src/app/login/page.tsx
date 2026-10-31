"use client";
import { useState } from "react";
import Link from "next/link";
import { Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common";
import { requestJson } from "@/lib/client";
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="panel w-full max-w-md">
        <Route className="mb-6 text-teal-700" size={36} />
        <h1 className="text-2xl font-bold">Masuk ke Rute Antar</h1>
        <p className="mb-7 mt-2 text-sm text-slate-500">
          Akses admin untuk mengatur pengantaran.
        </p>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            const form = new FormData(event.currentTarget);
            try {
              await requestJson("/api/login", "POST", Object.fromEntries(form));
              // A full navigation discards any router cache from the previous session.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/plans/new");
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Nama pengguna
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={100}
            />
          </label>
          <label className="field">
            Kata sandi
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={72}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <Button className="w-full" disabled={busy}>
            {busy ? "Memeriksa…" : "Masuk"}
          </Button>
        </form>
        <p className="mt-6 text-xs leading-5 text-slate-500">
          Belum memiliki akses? Hubungi pengelola aplikasi. Tidak tersedia
          registrasi publik.
        </p>
        <div className="mt-4 flex gap-4 text-xs text-teal-700">
          <Link href="/terms">Ketentuan penggunaan</Link>
          <Link href="/privacy">Kebijakan privasi</Link>
        </div>
      </section>
    </main>
  );
}
