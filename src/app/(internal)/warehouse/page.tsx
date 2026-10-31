"use client";
import { useEffect, useState } from "react";
import { PageTitle, Notice } from "@/components/common";
import { LocationForm } from "@/components/location-form";
import { requestJson, type Warehouse } from "@/lib/client";
export default function WarehousePage() {
  const [warehouse, setWarehouse] = useState<Warehouse | null>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    requestJson<Warehouse | null>("/api/warehouse")
      .then(setWarehouse)
      .catch((error) => setError(error.message));
  }, []);
  return (
    <>
      <PageTitle
        eyebrow="Konfigurasi"
        title="Pengaturan gudang"
        description="Titik berangkat dan titik kembali untuk setiap rencana pengantaran."
      />
      <div className="panel max-w-2xl">
        {error && <Notice error>{error}</Notice>}
        {message && (
          <div className="mb-5">
            <Notice>{message}</Notice>
          </div>
        )}
        {warehouse === undefined ? (
          <p>Memuat gudang…</p>
        ) : (
          <LocationForm
            warehouse
            initial={warehouse ?? undefined}
            onSaved={() =>
              setMessage(
                "Gudang tersimpan. Rencana baru menggunakan data ini; snapshot rencana lama tetap sama.",
              )
            }
          />
        )}
      </div>
    </>
  );
}
