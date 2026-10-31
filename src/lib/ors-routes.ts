import { z } from "zod";
import { AppError } from "./errors";
import { locationSchema } from "./validation";
export type Coordinate = { latitude: number; longitude: number };
export type RouteResult = {
  indices: number[];
  distanceMeters: number;
  durationSeconds: number;
};
export function mapOptimizedStops<T>(stops: T[], indices: number[]): T[] {
  const valid =
    indices.length === stops.length &&
    new Set(indices).size === stops.length &&
    indices.every(
      (index) => Number.isInteger(index) && index >= 0 && index < stops.length,
    );
  if (!valid)
    throw new AppError("Respons optimasi tidak lengkap atau tidak valid.", 502);
  // Indices map job IDs back to the exact submitted store array.
  return indices.map((index) => stops[index]);
}
const responseSchema = z.object({
  code: z.literal(0),
  unassigned: z.array(z.unknown()),
  routes: z.array(
    z.object({
      vehicle: z.literal(1),
      distance: z.number().finite().nonnegative(),
      duration: z.number().finite().nonnegative(),
      steps: z.array(
        z.object({
          type: z.enum(["start", "job", "end"]),
          id: z.number().int().optional(),
        }),
      ),
    }),
  ),
});
export async function computeRoute(
  warehouse: Coordinate,
  stores: Coordinate[],
  fetcher: typeof fetch = fetch,
  end: Coordinate | null = warehouse,
): Promise<RouteResult> {
  const key = process.env.ORS_API_KEY;
  if (!key)
    throw new AppError(
      "API key belum diatur. Isi ORS_API_KEY di server dan mulai ulang aplikasi.",
      503,
    );
  for (const point of [warehouse, ...stores, ...(end ? [end] : [])]) {
    if (!locationSchema.safeParse({ ...point, name: "lokasi" }).success)
      throw new AppError("Koordinat tidak valid.");
  }
  if (stores.length < 1 || stores.length > 25)
    throw new AppError("Pilih 1 sampai 25 toko.");
  const coordinate = (point: Coordinate) => [point.longitude, point.latitude];
  let response: Response;
  try {
    response = await fetcher("https://api.heigit.org/vroom/v0", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        Authorization: key,
      },
      body: JSON.stringify({
        vehicles: [
          {
            id: 1,
            profile: "driving-car",
            start: coordinate(warehouse),
            ...(end ? { end: coordinate(end) } : {}),
          },
        ],
        jobs: stores.map((point, index) => ({
          id: index + 1,
          location: coordinate(point),
        })),
        options: { g: true },
      }),
    });
  } catch {
    throw new AppError(
      "ORS tidak dapat dihubungi atau waktu tunggu habis. Silakan coba lagi.",
      503,
    );
  }
  if ([401, 403].includes(response.status))
    throw new AppError(
      "Akses ORS ditolak. Periksa API key, akses layanan di dashboard HeiGIT.",
      503,
    );
  if (response.status === 429)
    throw new AppError(
      "Kuota ORS habis atau batas permintaan tercapai. Coba lagi nanti.",
      429,
    );
  if ([400, 422].includes(response.status))
    throw new AppError(
      "ORS menolak permintaan. Periksa koordinat tujuan dan konfigurasi API.",
    );
  if (!response.ok)
    throw new AppError(
      "Layanan ORS sedang tidak tersedia. Silakan coba lagi.",
      503,
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AppError("Respons optimasi tidak valid.", 502);
  }
  if (
    typeof body === "object" &&
    body !== null &&
    (!("routes" in body) ||
      (Array.isArray(body.routes) && body.routes.length === 0))
  ) {
    throw new AppError(
      "Tidak ada rute yang dapat digunakan untuk tujuan ini.",
      422,
    );
  }
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError("Respons optimasi tidak lengkap atau tidak valid.", 502);
  if (parsed.data.unassigned.length)
    throw new AppError(
      "Tidak semua toko dapat dijangkau. Periksa koordinat dan akses jalan tujuan.",
      422,
    );
  if (parsed.data.routes.length !== 1)
    throw new AppError("Respons optimasi tidak valid.", 502);
  const route = parsed.data.routes[0];
  if (
    route.steps.length !== stores.length + 2 ||
    route.steps[0]?.type !== "start" ||
    route.steps.at(-1)?.type !== "end"
  )
    throw new AppError("Respons optimasi tidak valid.", 502);
  const indices = route.steps
    .filter((step) => step.type === "job")
    .map((step) => (step.id ?? 0) - 1);
  mapOptimizedStops(stores, indices);
  return {
    indices,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}
