import { z } from "zod";
z.config(z.locales.id());
const coordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim() !== "")
        return Number(value);
      return value;
    },
    z
      .number({ error: "Koordinat wajib berupa angka." })
      .finite()
      .min(min, `Koordinat minimal ${min}.`)
      .max(max, `Koordinat maksimal ${max}.`),
  );
export const locationSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
});
export const storeSchema = locationSchema.extend({
  address: z.string().trim().max(500).optional(),
});
export const planSchema = z
  .object({
    urgentStoreIds: z
      .array(z.string().min(1).max(100))
      .max(25)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Toko urgent tidak boleh duplikat.",
      )
      .default([]),
    deliveryDate: z.iso.date({ error: "Tanggal pengantaran tidak valid." }),
    storeIds: z
      .array(z.string().min(1).max(100))
      .min(1, "Pilih minimal satu toko.")
      .max(25, "Maksimal 25 toko.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Toko tidak boleh duplikat.",
      ),
  })
  .refine(
    (data) => data.urgentStoreIds.every((id) => data.storeIds.includes(id)),
    {
      message: "Toko urgent harus termasuk tujuan terpilih.",
      path: ["urgentStoreIds"],
    },
  );
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(72),
});
export const pagingSchema = z.object({
  q: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
