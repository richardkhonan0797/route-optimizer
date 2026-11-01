import { afterAll, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { createPlan, optimizePlan } from "../src/lib/plans";

// Opt-in: use only a dedicated local test database, never a shared production database.
const enabled = process.env.RUN_DB_TESTS === "true";
it.skipIf(!enabled)(
  "persists snapshots and optimized order atomically; failed recalculation preserves them",
  async () => {
    const previousWarehouse = await db.warehouse.findUnique({
      where: { id: "main" },
    });
    const storeIds: string[] = [];
    let planId: string | undefined;
    vi.stubEnv("ORS_API_KEY", "mock-only-not-a-real-key");

    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/matrix/")
          ? { distances: [[3210]], durations: [[600]] }
          : {
              code: 0,
              unassigned: [],
              routes: [
                {
                  vehicle: 1,
                  distance: 3210,
                  duration: 600,
                  steps: [
                    { type: "start" },
                    { type: "job", id: 1 },
                    { type: "end" },
                  ],
                },
              ],
            },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
    try {
      // This suite is opt-in and must run on a dedicated database; allow repeat runs.
      await db.rateLimit.deleteMany({
        where: { key: { in: ["optimize:global", "optimize:daily"] } },
      });
      await db.warehouse.upsert({
        where: { id: "main" },
        create: { id: "main", name: "Gudang Uji", latitude: 0, longitude: 0 },
        update: { name: "Gudang Uji", latitude: 0, longitude: 0 },
      });
      for (const name of ["Toko Uji B", "Toko Uji A"]) {
        const store = await db.store.create({
          data: { name, latitude: -6.2, longitude: 106.8 },
        });
        storeIds.push(store.id);
      }
      const plan = await createPlan({
        deliveryDate: "2026-10-15",
        storeIds,
        urgentStoreIds: [storeIds[1]],
      });
      planId = plan.id;
      await db.store.update({
        where: { id: storeIds[0] },
        data: { name: "Nama berubah", isActive: false, latitude: 1 },
      });
      await db.warehouse.update({
        where: { id: "main" },
        data: { name: "Gudang berubah", latitude: 1 },
      });
      const input = await db.deliveryStop.findMany({
        where: { deliveryPlanId: plan.id },
        orderBy: { inputOrder: "asc" },
      });
      expect(
        input.some((stop) => stop.storeNameSnapshot === "Toko Uji B"),
      ).toBe(true);
      expect(input.every((stop) => stop.latitudeSnapshot === -6.2)).toBe(true);
      expect(input.find((stop) => stop.storeId === storeIds[1])?.isUrgent).toBe(
        true,
      );
      const result = await optimizePlan(plan.id);
      expect(result.stops.map((stop) => stop.storeId)).toEqual([
        storeIds[1],
        storeIds[0],
      ]);
      expect(result.persisted).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.locations[0]).toEqual([0, 0]);
      expect(
        await db.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } }),
      ).toMatchObject({
        distanceMeters: 6420,
        durationSeconds: 1200,
        routingProvider: "ORS",
      });
      const before = await db.deliveryStop.findMany({
        where: { deliveryPlanId: plan.id },
        orderBy: { visitOrder: "asc" },
      });
      // Fail the second stage, after a valid urgent stage has already completed.
      const failure = mockFetch.getMockImplementation()!;
      mockFetch.mockReset();
      mockFetch
        .mockImplementationOnce(failure)
        .mockRejectedValueOnce(new Error("mock network timeout"));
      await expect(optimizePlan(plan.id)).rejects.toThrow("waktu tunggu");
      const after = await db.deliveryStop.findMany({
        where: { deliveryPlanId: plan.id },
        orderBy: { visitOrder: "asc" },
      });
      expect(after).toEqual(before);
      expect(
        (await db.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } }))
          .status,
      ).toBe("OPTIMIZED");
      await expect(
        db.deliveryStop.create({
          data: {
            deliveryPlanId: plan.id,
            storeId: storeIds[0],
            storeNameSnapshot: "Duplikat",
            latitudeSnapshot: 0,
            longitudeSnapshot: 0,
            inputOrder: 2,
          },
        }),
      ).rejects.toThrow();
      await expect(
        createPlan({ deliveryDate: "2026-10-15", storeIds }),
      ).rejects.toThrow("tidak tersedia");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      if (planId) await db.deliveryPlan.delete({ where: { id: planId } });
      await db.store.deleteMany({ where: { id: { in: storeIds } } });
      if (previousWarehouse) {
        await db.warehouse.update({
          where: { id: "main" },
          data: previousWarehouse,
        });
      } else {
        await db.warehouse.delete({ where: { id: "main" } });
      }
    }
  },
);
afterAll(async () => {
  await db.$disconnect();
});
