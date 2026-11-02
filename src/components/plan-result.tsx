"use client";
import { useRef, useState } from "react";
import { Copy, Navigation, RotateCw, Warehouse } from "lucide-react";
import { requestJson, type Optimization, type Plan } from "@/lib/client";
import { formatDate, navigationUrl } from "@/lib/utils";
import { Button } from "./ui/button";
import { Notice } from "./common";
import { GoogleAttribution } from "./google-attribution";
import { StopOrderEditor, type StopOrder } from "./stop-order-editor";
export function PlanResult({
  plan,
  initialResult,
}: {
  plan: Plan;
  initialResult?: Optimization;
}) {
  const [result, setResult] = useState(initialResult);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const savedOrder =
    plan.status === "OPTIMIZED" &&
    plan.stops.every((stop) => stop.visitOrder !== null);
  const hasOrder = Boolean(result) || savedOrder;
  const provider = result?.routingProvider ?? plan.routingProvider;
  const estimates =
    result ??
    (savedOrder && plan.distanceMeters != null && plan.durationSeconds != null
      ? {
          distanceMeters: plan.distanceMeters,
          durationSeconds: plan.durationSeconds,
        }
      : undefined);
  const calculatedAt = result?.optimizedAt ?? plan.optimizedAt;
  const attribution =
    provider === "GOOGLE_LEGACY" ? (
      <GoogleAttribution />
    ) : (
      <p className="mt-4 text-xs text-slate-500">
        ©{" "}
        <a href="https://openrouteservice.org/" className="underline">
          openrouteservice.org
        </a>{" "}
        by HeiGIT | Map data ©{" "}
        <a href="https://www.openstreetmap.org/copyright" className="underline">
          OpenStreetMap contributors
        </a>{" "}
        |{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          className="underline"
        >
          CC BY 4.0
        </a>
      </p>
    );
  let optimizeLabel = hasOrder ? "Hitung Ulang" : "Susun Rute";
  if (busy) optimizeLabel = "Menghitung rute…";
  const stops =
    result?.stops ??
    [...plan.stops].sort(
      (a, b) => (a.visitOrder ?? a.inputOrder) - (b.visitOrder ?? b.inputOrder),
    );
  async function optimize(order?: StopOrder) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(
        await requestJson<Optimization>(
          `/api/plans/${plan.id}/optimize`,
          "POST",
          order && {
            ...order,
            expectedRevision: result?.revision ?? plan.revision,
          },
        ),
      );
      setEditing(false);
    } catch (error) {
      setError(
        `${(error as Error).message}${hasOrder ? " Hasil lama masih ditampilkan dan tidak diubah." : " Belum ada hasil optimasi."}`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
              {hasOrder ? "Urutan pengantaran" : "Draft pengantaran"}
            </p>
            <h2 className="mt-2 text-xl font-bold">
              {formatDate(plan.deliveryDate)}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {stops.length} toko · {plan.warehouseNameSnapshot} · Pulang pergi
            </p>
            {stops.some((stop) => stop.isUrgent) && (
              <p className="mt-2 text-sm text-amber-800">
                {stops.filter((stop) => stop.isUrgent).length} tujuan urgent ·
                Urutan manual dapat mengubah prioritas. Prioritas dapat
                memperpanjang perjalanan; total rute belum tentu paling pendek.
              </p>
            )}
          </div>
          {hasOrder && !editing && (
            <Button
              disabled={busy}
              onClick={() => {
                setError("");
                setEditing(true);
              }}
            >
              Atur urutan
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy || editing}
            onClick={() => optimize()}
          >
            <RotateCw size={16} className={busy ? "animate-spin" : ""} />
            {optimizeLabel}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Saat menghitung ulang seluruh rute: Rute dimulai dari toko terdekat
          berdasarkan jarak berkendara. Toko urgent tetap didahulukan.
        </p>
        {error && (
          <div className="mt-5">
            <Notice error>{error}</Notice>
          </div>
        )}
        {!estimates && (
          <p className="mt-5 text-sm text-slate-500">
            Estimasi belum tersedia. Gunakan tombol di atas untuk menghitung
            rute dengan ORS.
          </p>
        )}
        {estimates && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
              <div>
                <p className="text-xs text-slate-500">Total jarak</p>
                <p className="mt-1 text-2xl font-bold">
                  {(estimates.distanceMeters / 1000).toLocaleString("id-ID", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  <span className="text-sm font-normal">km</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Estimasi perjalanan</p>
                <p className="mt-1 text-2xl font-bold">
                  {Math.ceil(estimates.durationSeconds / 60).toLocaleString(
                    "id-ID",
                  )}{" "}
                  <span className="text-sm font-normal">menit</span>
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Belum termasuk bongkar, istirahat, atau kondisi aktual di
              lapangan. Tidak menggunakan kemacetan real-time.
            </p>
          </>
        )}
        {hasOrder && attribution}
      </div>
      {editing && (
        <StopOrderEditor
          stops={stops}
          busy={busy}
          onSave={optimize}
          onCancel={() => {
            setEditing(false);
            setError("");
          }}
        />
      )}
      {calculatedAt && hasOrder && (
        <p className="text-xs text-slate-500">
          Dihitung:{" "}
          {new Date(calculatedAt).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          })}{" "}
          WIB
          {provider === "GOOGLE_LEGACY"
            ? " | Hasil lama Google; hitung ulang untuk menggunakan ORS."
            : " | Hasil tersimpan"}
        </p>
      )}
      <div className="panel">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">
            {hasOrder
              ? "Daftar kunjungan tersimpan"
              : "Tujuan yang dipilih — belum dioptimasi"}
          </h3>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasOrder}
            onClick={async () => {
              try {
                const lines = [
                  `Rute Antar — ${formatDate(plan.deliveryDate)}`,
                  `Mulai: ${plan.warehouseNameSnapshot}`,
                  ...stops.map(
                    (stop, index) =>
                      `${index + 1}. ${stop.isUrgent ? "[Urgent] " : ""}${stop.storeNameSnapshot} (${stop.latitudeSnapshot}, ${stop.longitudeSnapshot})`,
                  ),
                  `Kembali: ${plan.warehouseNameSnapshot}`,
                  provider === "GOOGLE_LEGACY"
                    ? "Urutan: Google Maps (hasil lama)."
                    : "© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors | CC BY 4.0 https://creativecommons.org/licenses/by/4.0/",
                  "Estimasi tidak termasuk bongkar, istirahat, dan kemacetan real-time.",
                ];
                await navigator.clipboard.writeText(lines.join("\n"));
                setCopied("Urutan berhasil disalin.");
              } catch {
                setCopied(
                  "Tidak dapat menyalin. Izinkan clipboard atau gunakan HTTPS.",
                );
              }
            }}
          >
            <Copy size={14} />
            Salin Urutan
          </Button>
        </div>
        {copied && (
          <p role="status" className="mb-4 text-sm text-teal-700">
            {copied}
          </p>
        )}
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
          <Warehouse size={21} className="text-teal-700" />
          <div>
            <p className="text-xs text-slate-500">BERANGKAT</p>
            <p className="font-semibold">{plan.warehouseNameSnapshot}</p>
          </div>
        </div>
        <ol className="my-2 divide-y divide-slate-100">
          {stops.map((stop, index) => (
            <li key={stop.id} className="flex items-center gap-4 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                {hasOrder ? index + 1 : "•"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold break-words">
                  {stop.storeNameSnapshot}
                  {stop.isUrgent && (
                    <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                      Urgent
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {stop.latitudeSnapshot}, {stop.longitudeSnapshot}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={navigationUrl(
                    stop.latitudeSnapshot,
                    stop.longitudeSnapshot,
                  )}
                >
                  <Navigation size={14} />
                  Navigasi
                </a>
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4">
          <Warehouse size={21} className="text-teal-700" />
          <div className="flex-1">
            <p className="text-xs text-slate-500">KEMBALI</p>
            <p className="font-semibold">{plan.warehouseNameSnapshot}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a
              target="_blank"
              rel="noreferrer"
              href={navigationUrl(
                plan.warehouseLatitudeSnapshot,
                plan.warehouseLongitudeSnapshot,
              )}
            >
              Navigasi ke gudang
            </a>
          </Button>
        </div>
        {hasOrder && attribution}
      </div>
    </section>
  );
}
