"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Notice } from "./common";
import { requestJson, type Warehouse } from "@/lib/client";
export function LocationForm({
  initial,
  storeId,
  warehouse = false,
  onSaved,
  onCancel,
}: {
  initial?: Warehouse & { address?: string | null };
  storeId?: string;
  warehouse?: boolean;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
          const url = warehouse
            ? "/api/warehouse"
            : `/api/stores${storeId ? `/${storeId}` : ""}`;
          await requestJson(url, warehouse || storeId ? "PUT" : "POST", data);
          onSaved();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Nama {warehouse ? "gudang" : "toko"}
        <input
          name="name"
          defaultValue={initial?.name}
          required
          maxLength={120}
          placeholder={warehouse ? "Gudang utama" : "Nama toko"}
        />
      </label>
      {!warehouse && (
        <label className="field">
          Alamat{" "}
          <span className="text-xs text-slate-400">
            Opsional, untuk catatan
          </span>
          <textarea
            name="address"
            maxLength={500}
            defaultValue={initial?.address ?? ""}
          />
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Latitude
          <input
            name="latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            defaultValue={initial?.latitude}
            placeholder="-6.200000"
            required
          />
        </label>
        <label className="field">
          Longitude
          <input
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            defaultValue={initial?.longitude}
            placeholder="106.816666"
            required
          />
        </label>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Masukkan koordinat desimal secara manual. Latitude −90 sampai 90,
        longitude −180 sampai 180. Nilai 0 valid.
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="flex gap-3">
        <Button disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Batal
          </Button>
        )}
      </div>
    </form>
  );
}
