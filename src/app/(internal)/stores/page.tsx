"use client";
import { useEffect, useState } from "react";
import { Plus, Search, MapPin } from "lucide-react";
import { PageTitle, Notice, Pagination } from "@/components/common";
import { Button } from "@/components/ui/button";
import { LocationForm } from "@/components/location-form";
import { requestJson, type Store, type PageData } from "@/lib/client";
export default function StoresPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData<Store>>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Store | "new" | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      requestJson<PageData<Store>>(
        `/api/stores?q=${encodeURIComponent(q)}&page=${page}`,
      )
        .then((data) => {
          if (active) {
            setData(data);
            setError("");
          }
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
  }, [q, page, version]);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle
          eyebrow="Master data"
          title="Data toko"
          description="Kelola lokasi tujuan pengantaran. Data lama tetap aman dalam snapshot rencana."
        />
        <Button onClick={() => setEditing("new")}>
          <Plus size={17} />
          Tambah toko
        </Button>
      </div>
      {editing && (
        <section className="panel mb-6">
          <h2 className="mb-5 text-lg font-semibold">
            {editing === "new" ? "Tambah toko" : "Edit toko"}
          </h2>
          <LocationForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? undefined : editing}
            storeId={editing === "new" ? undefined : editing.id}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setVersion(version + 1);
            }}
          />
        </section>
      )}
      <section className="panel">
        <div className="relative mb-5 max-w-md">
          <Search className="absolute top-3 left-3 text-slate-400" size={18} />
          <input
            aria-label="Cari nama toko"
            style={{ paddingLeft: 40 }}
            placeholder="Cari nama toko…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {error && <Notice error>{error}</Notice>}
        {loading ? (
          <p role="status">Memuat toko…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Nama toko / alamat</th>
                    <th>Koordinat</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((store) => (
                    <tr key={store.id}>
                      <td>
                        <p className="font-semibold">{store.name}</p>
                        <p className="mt-1 max-w-sm text-xs text-slate-500">
                          {store.address || "Alamat belum diisi"}
                        </p>
                      </td>
                      <td>
                        <a
                          className="inline-flex items-center gap-1 whitespace-nowrap text-teal-700"
                          href={`https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MapPin size={14} />
                          Lihat lokasi
                        </a>
                        <p className="mt-1 text-xs text-slate-400">
                          {store.latitude}, {store.longitude}
                        </p>
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${store.isActive ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-500"}`}
                        >
                          {store.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(store)}
                          >
                            Edit
                          </Button>
                          {store.isActive && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Nonaktifkan ${store.name}? Toko tidak lagi tersedia untuk rencana baru.`,
                                  )
                                )
                                  return;
                                setBusy(true);
                                try {
                                  await requestJson(
                                    `/api/stores/${store.id}`,
                                    "DELETE",
                                  );
                                  setVersion(version + 1);
                                } catch (error) {
                                  setError((error as Error).message);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Nonaktifkan
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data?.items.length === 0 && (
              <div className="py-12 text-center">
                <h2 className="font-semibold">
                  Belum ada toko yang ditampilkan
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Tambahkan toko pertama atau ubah kata pencarian.
                </p>
              </div>
            )}
            <Pagination page={page} total={data?.total ?? 0} change={setPage} />
          </>
        )}
      </section>
    </>
  );
}
