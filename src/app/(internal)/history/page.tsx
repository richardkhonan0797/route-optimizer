"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageTitle, Notice, Pagination } from "@/components/common";
import { Button } from "@/components/ui/button";
import { requestJson, type PageData, type Plan } from "@/lib/client";
import { formatDate } from "@/lib/utils";
type HistoryPlan = Omit<Plan, "stops"> & { _count: { stops: number } };
export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData<HistoryPlan>>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    requestJson<PageData<HistoryPlan>>(`/api/plans?page=${page}`)
      .then((data) => {
        if (active) setData(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <>
      <PageTitle
        eyebrow="Arsip operasional"
        title="Riwayat pengantaran"
        description="Buka kembali rencana tanpa menjalankan perhitungan ORS secara otomatis."
      />
      <section className="panel">
        {error && <Notice error>{error}</Notice>}
        {!data ? (
          <p role="status">Memuat riwayat…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Gudang</th>
                    <th>Tujuan</th>
                    <th>Status tersimpan</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((plan) => (
                    <tr key={plan.id}>
                      <td className="whitespace-nowrap font-semibold">
                        {formatDate(plan.deliveryDate)}
                      </td>
                      <td>{plan.warehouseNameSnapshot}</td>
                      <td className="whitespace-nowrap">
                        {plan._count.stops} toko
                      </td>
                      <td>
                        {plan.status === "OPTIMIZED"
                          ? "Urutan tersimpan"
                          : "Draft tujuan"}
                      </td>
                      <td>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/plans/${plan.id}`}>Buka</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total === 0 && (
              <div className="py-12 text-center">
                <h2 className="font-semibold">Belum ada rencana pengantaran</h2>
                <Button className="mt-4" asChild>
                  <Link href="/plans/new">Susun pengantaran pertama</Link>
                </Button>
              </div>
            )}
            <Pagination page={page} total={data.total} change={setPage} />
          </>
        )}
      </section>
    </>
  );
}
