import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import {
  computeRoute,
  computeDrivingLegs,
  measureFixedRoute,
  type RouteResult,
  mapOptimizedStops,
  type Coordinate,
} from "./ors-routes";
import { consumeLimit } from "./rate-limit";
import { manualOrderSchema, planSchema } from "./validation";
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
export async function optimizePlan(id: string, input?: unknown) {
  const manual =
    input === undefined ? undefined : manualOrderSchema.parse(input);
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
      ...(manual && {
        revision: manual.expectedRevision,
        status: "OPTIMIZED" as const,
      }),
      OR: [
        { optimizationToken: null },
        { optimizationStartedAt: { lt: new Date(Date.now() - 60000) } },
      ],
    },
    data: { optimizationToken: token, optimizationStartedAt: new Date() },
  });
  if (!acquired.count)
    throw new AppError(
      manual
        ? "Rencana berubah, belum dioptimasi, atau sedang dihitung. Buka kembali rencana terbaru."
        : "Rencana tidak ditemukan atau sedang dihitung. Tunggu lalu muat ulang.",
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
    let route: RouteResult;
    if (manual) {
      const indices = manual.orderedStopIds.map((id) =>
        plan.stops.findIndex((stop) => stop.id === id),
      );
      if (indices.length !== points.length || indices.includes(-1))
        throw new AppError("Daftar tujuan tidak sesuai dengan rencana.");
      const boundary = manual.orderedStopIds.indexOf(manual.fixedThroughStopId);
      const fixed = indices.slice(0, boundary + 1);
      await reserveRequest();
      const metrics = await measureFixedRoute(
        warehouse,
        fixed.map((i) => points[i]),
        fixed.length === points.length,
        deadline,
      );
      route = { indices: fixed, ...metrics };
    } else {
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
      route = { indices: [firstIndex], ...legs[nearest] };
    }
    const prefix = new Set(route.indices);
    let start = points[route.indices[route.indices.length - 1]];
    const groups = [urgent, normal]
      .map((group) => group.filter((index) => !prefix.has(index)))
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
    if (!groups.length && !manual) {
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
    const priorityStops = manual ? ordered.slice(prefix.size) : ordered;
    const urgentCount = priorityStops.filter((stop) => stop.isUrgent).length;
    if (
      priorityStops.some((stop, index) => index < urgentCount && !stop.isUrgent)
    )
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
        const positions = ordered.map(
          (stop, index) => Prisma.sql`(${stop.id}::text, ${index + 1}::int)`,
        );
        const updated = await tx.$executeRaw`
          UPDATE "DeliveryStop" AS stop
          SET "visitOrder" = positions.visit_order
          FROM (VALUES ${Prisma.join(positions)}) AS positions(id, visit_order)
          WHERE stop.id = positions.id AND stop."deliveryPlanId" = ${id}
        `;
        if (updated !== ordered.length)
          throw new AppError("Daftar tujuan berubah. Muat ulang rencana.", 409);
        checkDeadline();
      },
      { timeout: 15000 },
    );
    return {
      ...route,
      revision: plan.revision + 1,
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
