"use client";
import { Button } from "./ui/button";
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-xl border p-4 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-teal-100 bg-teal-50 text-teal-900"}`}
    >
      {children}
    </div>
  );
}
export function Pagination({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-slate-500">
      <span>
        {total} data · Halaman {page}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => change(page - 1)}
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page * 20 >= total}
          onClick={() => change(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-7">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-teal-700">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </header>
  );
}
