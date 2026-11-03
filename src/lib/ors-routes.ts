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
  deadline?: AbortSignal,
): Promise<RouteResult> {
  for (const point of [warehouse, ...stores, ...(end ? [end] : [])]) {
    if (!locationSchema.safeParse({ ...point, name: "lokasi" }).success)
      throw new AppError("Koordinat tidak valid.");
  }
  if (stores.length < 1 || stores.length > 30)
    throw new AppError("Pilih 1 sampai 30 toko.");
  const coordinate = (point: Coordinate) => [point.longitude, point.latitude];
  const body = await requestOrs(
    "https://api.heigit.org/vroom/v0",
    {
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
    },
    fetcher,
    deadline,
  );
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

async function requestOrs(
  url: string,
  payload: unknown,
  fetcher: typeof fetch,
  deadline?: AbortSignal,
): Promise<unknown> {
  const key = process.env.ORS_API_KEY;
  if (!key)
    throw new AppError(
      "API key belum diatur. Isi ORS_API_KEY di server dan mulai ulang aplikasi.",
      503,
    );
  const timeout = AbortSignal.timeout(20000);
  const signal = deadline ? AbortSignal.any([deadline, timeout]) : timeout;
  let response: Response;
  try {
    signal.throwIfAborted();
    response = await fetcher(url, {
      method: "POST",
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: key,
      },
      body: JSON.stringify(payload),
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
  if (signal.aborted)
    throw new AppError(
      "ORS tidak dapat dihubungi atau waktu tunggu habis. Silakan coba lagi.",
      503,
    );
  return body;
}

// A single matrix covers consecutive directed legs, including the return if requested.
export async function measureFixedRoute(
  warehouse: Coordinate,
  stops: Coordinate[],
  returnHome: boolean,
  deadline?: AbortSignal,
) {
  const points = [warehouse, ...stops];
  const path = points.map((_, i) => i);
  if (returnHome) path.push(0);
  const body = await requestOrs(
    "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
    {
      locations: points.map((p) => [p.longitude, p.latitude]),
      metrics: ["distance", "duration"],
      units: "m",
    },
    fetch,
    deadline,
  );
  const matrix = z
    .array(
      z
        .array(z.number().finite().nonnegative().nullable())
        .length(points.length),
    )
    .length(points.length);
  const result = z
    .object({ distances: matrix, durations: matrix })
    .safeParse(body);
  if (!result.success)
    throw new AppError("Respons matriks ORS tidak valid.", 502);
  let distanceMeters = 0;
  let durationSeconds = 0;
  for (let i = 1; i < path.length; i++) {
    const distance = result.data.distances[path[i - 1]][path[i]];
    const duration = result.data.durations[path[i - 1]][path[i]];
    if (distance === null || duration === null)
      throw new AppError("Ruas dalam urutan tetap tidak dapat dijangkau.", 422);
    distanceMeters += distance;
    durationSeconds += duration;
  }
  return { distanceMeters, durationSeconds };
}

// Retain destination order so equal distance and duration use existing input order.
export async function computeDrivingLegs(
  start: Coordinate,
  destinations: Coordinate[],
  fetcher: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<Omit<RouteResult, "indices">[]> {
  if (destinations.length < 1 || destinations.length > 30)
    throw new AppError("Pilih 1 sampai 30 toko.");
  for (const point of [start, ...destinations]) {
    if (!locationSchema.safeParse({ ...point, name: "lokasi" }).success)
      throw new AppError("Koordinat tidak valid.");
  }
  const body = await requestOrs(
    "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
    {
      locations: [start, ...destinations].map((point) => [
        point.longitude,
        point.latitude,
      ]),
      sources: ["0"],
      destinations: destinations.map((_, index) => String(index + 1)),
      metrics: ["distance", "duration"],
      units: "m",
    },
    fetcher,
    deadline,
  );
  const cell = z.number().finite().nonnegative().nullable();
  const row = z.array(cell).length(destinations.length);
  const parsed = z
    .object({
      distances: z.array(row).length(1),
      durations: z.array(row).length(1),
    })
    .safeParse(body);
  if (!parsed.success)
    throw new AppError(
      "Respons jarak ORS tidak lengkap atau tidak valid. Silakan hitung ulang.",
      502,
    );
  return destinations.map((_, index) => {
    const distanceMeters = parsed.data.distances[0][index];
    const durationSeconds = parsed.data.durations[0][index];
    if (distanceMeters === null || durationSeconds === null)
      throw new AppError(
        "Tidak semua toko dapat dijangkau. Periksa koordinat dan akses jalan tujuan.",
        422,
      );
    return { distanceMeters, durationSeconds };
  });
}
