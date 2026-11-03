"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Route, Store, Warehouse, History, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { requestJson } from "@/lib/client";
import { useState } from "react";
const links = [
  { href: "/plans/new", label: "Susun pengantaran", icon: Route },
  { href: "/stores", label: "Data toko", icon: Store },
  { href: "/history", label: "Riwayat", icon: History },
  { href: "/warehouse", label: "Pengaturan gudang", icon: Warehouse },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [error, setError] = useState("");
  return (
    <div className="min-h-screen md:grid md:grid-cols-[245px_1fr]">
      <aside className="relative border-b border-slate-200 bg-white px-5 py-5 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0 md:py-6">
        <Link
          href="/plans/new"
          className="flex items-center gap-3 text-xl font-bold tracking-tight"
        >
          <span className="rounded-xl bg-teal-700 p-2 text-white">
            <Route size={24} />
          </span>
          Rute Antar<span className="sr-only">Beranda</span>
        </Link>
        <p className="mt-2 pl-12 text-xs text-slate-400">
          Operasional distribusi
        </p>
        <nav
          aria-label="Menu utama"
          className="mt-4 grid grid-cols-2 gap-1 md:mt-8 md:grid-cols-1 md:gap-2"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={path === link.href ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-2 py-3 text-xs font-medium md:gap-3 md:px-3 md:text-sm ${path === link.href ? "bg-teal-50 text-teal-800" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <link.icon size={18} />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="absolute top-5 right-4 md:top-auto md:right-auto md:bottom-6 md:w-48 md:border-t md:border-slate-100 md:pt-5">
          <p className="mb-2 hidden text-xs text-slate-400 md:block">
            AKSES INTERNAL · ADMIN
          </p>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await requestJson("/api/logout", "POST");
                // Discard authenticated router cache on logout.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/login");
              } catch {
                setError("Gagal keluar. Coba lagi.");
              }
            }}
          >
            <LogOut size={16} />
            Keluar
          </Button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <div className="min-w-0">
        <div className="hidden border-b border-slate-200 bg-white px-10 py-4 text-xs text-slate-500 md:block">
          Satu gudang <span className="px-3 text-slate-300">/</span> Satu
          kendaraan <span className="px-3 text-slate-300">/</span> Hingga 30
          tujuan
        </div>
        <main className="mx-auto max-w-6xl p-5 md:p-10">{children}</main>
        <footer className="px-6 pb-6 text-center text-xs text-slate-400">
          <Link href="/terms">Ketentuan penggunaan</Link> ·{" "}
          <Link href="/privacy">Kebijakan privasi</Link>
        </footer>
      </div>
    </div>
  );
}
