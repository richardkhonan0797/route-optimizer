"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Search,
  X,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import {
  requestJson,
  type Store,
  type PageData,
  type Warehouse,
  type Plan,
  type Optimization,
} from "@/lib/client";
import { jakartaToday } from "@/lib/utils";
import { PageTitle, Notice, Pagination } from "@/components/common";
import { Button } from "@/components/ui/button";
import { PlanResult } from "@/components/plan-result";
export default function NewPlan() {
  const [date, setDate] = useState(jakartaToday);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData<Store>>();
  const [selected, setSelected] = useState<(Store & { isUrgent?: boolean })[]>(
    [],
  );
  const [warehouse, setWarehouse] = useState<Warehouse | null>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<{
    plan: Plan;
    result?: Optimization;
  }>();
  useEffect(() => {
    requestJson<Warehouse | null>("/api/warehouse")
      .then(setWarehouse)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      requestJson<PageData<Store>>(
        `/api/stores?active=true&q=${encodeURIComponent(q)}&page=${page}`,
      )
        .then((data) => {
          if (active) setData(data);
        })
        .catch((error) => {
          if (active) setError(error.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, page]);
  function toggle(store: Store) {
    setSelected((current) =>
      current.some((item) => item.id === store.id)
        ? current.filter((item) => item.id !== store.id)
        : [...current, store],
    );
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let plan: Plan | undefined;
    try {
      const created = await requestJson<{ id: string }>("/api/plans", "POST", {
        deliveryDate: date,
        storeIds: selected.map((store) => store.id),
        urgentStoreIds: selected
          .filter((store) => store.isUrgent)
          .map((store) => store.id),
      });
      plan = await requestJson<Plan>(`/api/plans/${created.id}`);
      const result = await requestJson<Optimization>(
        `/api/plans/${created.id}/optimize`,
        "POST",
      );
      setCompleted({ plan, result });
    } catch (error) {
      setError((error as Error).message);
      if (plan) setCompleted({ plan });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (completed)
    return (
      <>
        <PageTitle
          eyebrow="Rencana pengantaran"
          title={completed.result ? "Rute siap diperiksa" : "Draft tersimpan"}
          description="Periksa urutan tujuan sebelum memulai pengantaran."
        />
        {error && (
          <div className="mb-5">
            <Notice error>{error}</Notice>
          </div>
        )}
        <PlanResult plan={completed.plan} initialResult={completed.result} />
        <div className="mt-5 flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setCompleted(undefined);
              setError("");
            }}
          >
            Ubah pilihan / buat rencana baru
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/history">Lihat riwayat</Link>
          </Button>
        </div>
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow="Rencana baru"
        title="Susun pengantaran"
        description="Pilih tujuan hari ini. Kami bantu menyusun urutan perjalanan jalan raya dari gudang dan kembali lagi."
      />
      {error && (
        <div className="mb-5">
          <Notice error>{error}</Notice>
        </div>
      )}
      {warehouse === null && (
        <div className="mb-5">
          <Notice>
            Gudang belum dikonfigurasi.{" "}
            <Link className="underline" href="/warehouse">
              Atur gudang terlebih dahulu.
            </Link>
          </Notice>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="panel flex items-center gap-4">
          <WarehouseIcon className="text-teal-700" />
          <div>
            <p className="text-xs text-slate-500">TITIK AWAL & AKHIR</p>
            <p className="mt-1 font-semibold">
              {warehouse?.name ?? "Gudang belum tersedia"}
            </p>
          </div>
        </div>
        <div className="panel">
          <label className="field">
            Tanggal pengantaran
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
            />
          </label>
          <p className="mt-2 text-xs text-slate-400">Zona waktu Asia/Jakarta</p>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_310px]">
        <section className="panel">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pilih toko tujuan</h2>
            <span className="text-xs text-slate-500">Toko aktif</span>
          </div>
          <div className="relative mb-5">
            <Search
              size={18}
              className="absolute top-3 left-3 text-slate-400"
            />
            <input
              style={{ paddingLeft: 40 }}
              aria-label="Cari toko tujuan"
              placeholder="Cari nama toko…"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
          </div>
          {loading ? (
            <p role="status" className="py-10 text-center text-slate-500">
              Memuat toko…
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data?.items.map((store) => {
                const checked = selected.some((item) => item.id === store.id);
                return (
                  <label
                    key={store.id}
                    className="flex cursor-pointer items-center gap-4 py-4"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || (!checked && selected.length >= 25)}
                      onChange={() => toggle(store)}
                    />
                    <span>
                      <span className="block font-semibold">{store.name}</span>
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {store.address ||
                          `${store.latitude}, ${store.longitude}`}
                      </span>
                    </span>
                  </label>
                );
              })}
              {data?.items.length === 0 && (
                <div className="py-10 text-center">
                  <p className="font-semibold">Tidak ada toko yang cocok</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Ubah pencarian atau{" "}
                    <Link className="text-teal-700 underline" href="/stores">
                      tambahkan toko
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          )}
          <Pagination page={page} total={data?.total ?? 0} change={setPage} />
        </section>
        <aside className="panel lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Tujuan terpilih</h2>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">
              {selected.length} dari 25 toko
            </span>
          </div>
          <p className="mt-3 text-xs text-amber-800" role="status">
            {selected.filter((store) => store.isUrgent).length} tujuan urgent
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Semua tujuan urgent dikunjungi lebih dulu. Prioritas dapat
            memperpanjang perjalanan; total rute belum tentu paling pendek.
          </p>
          <div className="my-5 max-h-80 overflow-y-auto">
            {selected.length === 0 ? (
              <p className="py-8 text-center text-sm leading-6 text-slate-400">
                Centang toko di daftar
                <br />
                untuk mulai menyusun rute.
              </p>
            ) : (
              selected.map((store) => (
                <div
                  key={store.id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="break-words">{store.name}</span>
                    <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <input
                        type="checkbox"
                        checked={Boolean(store.isUrgent)}
                        disabled={busy}
                        aria-label={`Urgent untuk ${store.name}`}
                        onChange={(event) => {
                          const isUrgent = event.target.checked;
                          setSelected((current) =>
                            current.map((item) =>
                              item.id === store.id
                                ? { ...item, isUrgent }
                                : item,
                            ),
                          );
                        }}
                      />
                      Urgent
                    </label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Hapus ${store.name} dari pilihan`}
                    onClick={() => toggle(store)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))
            )}
          </div>
          <Button
            className="w-full"
            disabled={busy || selected.length === 0 || !warehouse || !date}
            onClick={submit}
          >
            {busy ? "Menyusun rute…" : "Susun Rute"}
            <ArrowRight size={16} />
          </Button>
          <p className="mt-4 text-xs leading-5 text-slate-400">
            Satu kendaraan, maksimal 25 toko. Perhitungan hanya berjalan saat
            tombol ditekan dan menggunakan kuota ORS. Rute campuran urgent dan
            biasa memakai dua permintaan; lainnya satu permintaan.
          </p>
        </aside>
      </div>
    </>
  );
}
