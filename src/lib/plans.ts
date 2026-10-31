import { randomUUID } from "node:crypto";
import { db } from "./db";
import { AppError } from "./errors";
import { computeRoute, mapOptimizedStops, type Coordinate } from "./ors-routes";
import { consumeLimit } from "./rate-limit";
import { planSchema } from "./validation";
export async function createPlan(input: unknown) {
  const data = planSchema.parse(input);
  return db.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findUnique({ where: { id: "main" } });
    if (!warehouse)
      throw new AppError("Konfigurasikan gudang terlebih dahulu.");
    const stores = await tx.store.findMany({
      where: { id: { in: data.storeIds }, isActive: true },
      orderBy: { id: "asc" },
    });
    if (stores.length !== data.storeIds.length)
      throw new AppError(
        "Sebagian toko tidak tersedia. Muat ulang pilihan toko.",
      );
    return tx.deliveryPlan.create({
      data: {
        deliveryDate: new Date(data.deliveryDate),
        warehouseNameSnapshot: warehouse.name,
        warehouseLatitudeSnapshot: warehouse.latitude,
        warehouseLongitudeSnapshot: warehouse.longitude,
        stops: {
          create: stores.map((store, inputOrder) => ({
            storeId: store.id,
            isUrgent: data.urgentStoreIds.includes(store.id),
            storeNameSnapshot: store.name,
            latitudeSnapshot: store.latitude,
            longitudeSnapshot: store.longitude,
            inputOrder,
          })),
        },
      },
    });
  });
}
export async function optimizePlan(id: string) {
  const token = randomUUID();
  // A renewable-by-expiry lease avoids holding a DB transaction open across a network request.
  const acquired = await db.deliveryPlan.updateMany({
    where: {
      id,
      OR: [
        { optimizationToken: null },
        { optimizationStartedAt: { lt: new Date(Date.now() - 60000) } },
      ],
    },
    data: { optimizationToken: token, optimizationStartedAt: new Date() },
  });
  if (!acquired.count)
    throw new AppError(
      "Rencana tidak ditemukan atau sedang dihitung. Tunggu lalu muat ulang.",
      409,
    );
  try {
    const plan = await db.deliveryPlan.findUniqueOrThrow({
      where: { id },
      include: { stops: { orderBy: { inputOrder: "asc" } } },
    });
    const warehouse = {
      latitude: plan.warehouseLatitudeSnapshot,
      longitude: plan.warehouseLongitudeSnapshot,
    };
    const points = plan.stops.map((stop) => ({
      latitude: stop.latitudeSnapshot,
      longitude: stop.longitudeSnapshot,
    }));
    const urgent = plan.stops.flatMap((stop, index) =>
      stop.isUrgent ? [index] : [],
    );
    const normal = plan.stops.flatMap((stop, index) =>
      stop.isUrgent ? [] : [index],
    );
    async function stage(
      start: Coordinate,
      indices: number[],
      end: Coordinate | null,
    ) {
      await consumeLimit("optimize:global", 5, 60);
      await consumeLimit("optimize:daily", 100, 86400);
      const result = await computeRoute(
        start,
        indices.map((index) => points[index]),
        fetch,
        end,
      );
      return { ...result, indices: mapOptimizedStops(indices, result.indices) };
    }
    let route;
    if (urgent.length && normal.length) {
      const first = await stage(warehouse, urgent, null);
      const second = await stage(
        points[first.indices[first.indices.length - 1]],
        normal,
        warehouse,
      );
      route = {
        indices: [...first.indices, ...second.indices],
        distanceMeters: first.distanceMeters + second.distanceMeters,
        durationSeconds: first.durationSeconds + second.durationSeconds,
      };
    } else {
      route = await stage(
        warehouse,
        points.map((_, index) => index),
        warehouse,
      );
    }
    const ordered = mapOptimizedStops(plan.stops, route.indices);
    if (ordered.some((stop, index) => index < urgent.length && !stop.isUrgent))
      throw new AppError("Urutan urgent tidak valid.", 502);
    const optimizedAt = new Date();
    await db.$transaction(async (tx) => {
      const changed = await tx.deliveryPlan.updateMany({
        where: { id, optimizationToken: token, revision: plan.revision },
        data: {
          status: "OPTIMIZED",
          optimizedAt,
          routingProvider: "ORS",
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          revision: { increment: 1 },
          optimizationToken: null,
          optimizationStartedAt: null,
        },
      });
      if (!changed.count)
        throw new AppError(
          "Rencana berubah selama perhitungan. Silakan hitung ulang.",
          409,
        );
      for (let index = 0; index < ordered.length; index++) {
        await tx.deliveryStop.update({
          where: { id: ordered[index].id },
          data: { visitOrder: index + 1 },
        });
      }
    });
    return {
      ...route,
      stops: ordered.map((stop, index) => ({ ...stop, visitOrder: index + 1 })),
      persisted: true,
      routingProvider: "ORS" as const,
      optimizedAt: optimizedAt.toISOString(),
    };
  } finally {
    // Failures only release this request's lease; the previous valid order is never cleared.
    await db.deliveryPlan.updateMany({
      where: { id, optimizationToken: token },
      data: { optimizationToken: null, optimizationStartedAt: null },
    });
  }
}
