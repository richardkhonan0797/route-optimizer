import { randomUUID } from "node:crypto";
import { db } from "./db";
import { AppError } from "./errors";
import {
  computeRoute,
  computeDrivingLegs,
  mapOptimizedStops,
  type Coordinate,
} from "./ors-routes";
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
  const deadlineAt = Date.now() + 50000;
  const deadline = AbortSignal.timeout(50000);
  function checkDeadline() {
    if (deadline.aborted || Date.now() >= deadlineAt)
      throw new AppError(
        "Waktu tunggu optimasi habis. Silakan hitung ulang.",
        503,
      );
  }
  async function reserveRequest() {
    checkDeadline();
    await consumeLimit("optimize:global", 5, 60);
    await consumeLimit("optimize:daily", 100, 86400);
    checkDeadline();
  }
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
      await reserveRequest();
      const result = await computeRoute(
        start,
        indices.map((index) => points[index]),
        fetch,
        end,
        deadline,
      );
      return { ...result, indices: mapOptimizedStops(indices, result.indices) };
    }
    const eligible = urgent.length ? urgent : normal;
    await reserveRequest();
    const legs = await computeDrivingLegs(
      warehouse,
      eligible.map((index) => points[index]),
      fetch,
      deadline,
    );
    let nearest = 0;
    for (let index = 1; index < legs.length; index++) {
      if (
        legs[index].distanceMeters < legs[nearest].distanceMeters ||
        (legs[index].distanceMeters === legs[nearest].distanceMeters &&
          legs[index].durationSeconds < legs[nearest].durationSeconds)
      )
        nearest = index;
    }
    const firstIndex = eligible[nearest];
    const route = { indices: [firstIndex], ...legs[nearest] };
    let start = points[firstIndex];
    const groups = [urgent, normal]
      .map((group) => group.filter((index) => index !== firstIndex))
      .filter((group) => group.length);
    for (let index = 0; index < groups.length; index++) {
      const result = await stage(
        start,
        groups[index],
        index === groups.length - 1 ? warehouse : null,
      );
      route.indices.push(...result.indices);
      route.distanceMeters += result.distanceMeters;
      route.durationSeconds += result.durationSeconds;
      start = points[result.indices[result.indices.length - 1]];
    }
    if (!groups.length) {
      await reserveRequest();
      const [back] = await computeDrivingLegs(
        start,
        [warehouse],
        fetch,
        deadline,
      );
      route.distanceMeters += back.distanceMeters;
      route.durationSeconds += back.durationSeconds;
    }
    checkDeadline();
    const ordered = mapOptimizedStops(plan.stops, route.indices);
    if (ordered.some((stop, index) => index < urgent.length && !stop.isUrgent))
      throw new AppError("Urutan urgent tidak valid.", 502);
    const optimizedAt = new Date();
    await db.$transaction(
      async (tx) => {
        checkDeadline();
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
        checkDeadline();
      },
      { timeout: 5000 },
    );
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
