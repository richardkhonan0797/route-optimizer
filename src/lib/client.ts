export async function requestJson<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== "/api/login")
      // Discard protected router cache when a session expires.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    throw new Error(body.error ?? "Permintaan gagal. Silakan coba lagi.");
  }
  return body as T;
}
export type Store = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  isActive: boolean;
};
export type Warehouse = { name: string; latitude: number; longitude: number };
export type Stop = {
  isUrgent: boolean;
  id: string;
  storeNameSnapshot: string;
  latitudeSnapshot: number;
  longitudeSnapshot: number;
  inputOrder: number;
  visitOrder: number | null;
};
export type Plan = {
  id: string;
  deliveryDate: string;
  status: "DRAFT" | "OPTIMIZED";
  distanceMeters: number | null;
  durationSeconds: number | null;
  routingProvider: string | null;
  optimizedAt: string | null;
  warehouseNameSnapshot: string;
  warehouseLatitudeSnapshot: number;
  warehouseLongitudeSnapshot: number;
  stops: Stop[];
};
export type Optimization = {
  stops: Stop[];
  distanceMeters: number;
  durationSeconds: number;
  persisted: boolean;
  routingProvider: "ORS";
  optimizedAt: string;
};
export type PageData<T> = { items: T[]; page: number; total: number };
