import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  compute: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    deliveryPlan: {
      updateMany: mocks.updateMany,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../src/lib/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("../src/lib/ors-routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/ors-routes")>()),
  computeRoute: mocks.compute,
}));
import { optimizePlan } from "../src/lib/plans";
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.limit.mockResolvedValue(undefined);
  mocks.findUniqueOrThrow.mockResolvedValue({
    id: "plan",
    revision: 1,
    status: "OPTIMIZED",
    warehouseLatitudeSnapshot: 0,
    warehouseLongitudeSnapshot: 0,
    stops: [
      { id: "stop", visitOrder: 1, latitudeSnapshot: 1, longitudeSnapshot: 1 },
    ],
  });
});
it("ORS failure leaves previous valid result untouched", async () => {
  mocks.compute.mockRejectedValue(new Error("ORS timeout"));
  await expect(optimizePlan("plan")).rejects.toThrow("ORS timeout");
  expect(mocks.transaction).not.toHaveBeenCalled();
  const cleanup = mocks.updateMany.mock.calls[1][0];
  expect(cleanup.data).toEqual({
    optimizationToken: null,
    optimizationStartedAt: null,
  });
  expect(cleanup.where.optimizationToken).toBe(
    mocks.updateMany.mock.calls[0][0].data.optimizationToken,
  );
});
it("concurrent request cannot call ORS when lease is held", async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  await expect(optimizePlan("plan")).rejects.toThrow("sedang dihitung");
  expect(mocks.compute).not.toHaveBeenCalled();
});

it("persists ORS order and metrics together", async () => {
  mocks.compute.mockResolvedValue({
    indices: [0],
    distanceMeters: 123,
    durationSeconds: 45,
  });
  const updatePlan = vi.fn().mockResolvedValue({ count: 1 });
  const updateStop = vi.fn();
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      deliveryPlan: { updateMany: updatePlan },
      deliveryStop: { update: updateStop },
    }),
  );
  const result = await optimizePlan("plan");
  expect(result.persisted).toBe(true);
  expect(updateStop).toHaveBeenCalledTimes(1);
  const stored = updatePlan.mock.calls[0][0].data;
  expect(stored.status).toBe("OPTIMIZED");
  expect(stored.distanceMeters).toBe(123);
  expect(stored.durationSeconds).toBe(45);
  expect(stored.routingProvider).toBe("ORS");
  expect(stored).not.toHaveProperty("indices");
});

it("stale lease result cannot overwrite a newer plan revision", async () => {
  mocks.compute.mockResolvedValue({
    indices: [0],
    distanceMeters: 123,
    durationSeconds: 45,
  });
  const updateStop = vi.fn();
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      deliveryPlan: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      deliveryStop: { update: updateStop },
    }),
  );
  await expect(optimizePlan("plan")).rejects.toThrow("Rencana berubah");
  expect(updateStop).not.toHaveBeenCalled();
});

function mixedPlan(count = 4, urgentCount = 2) {
  const stops = Array.from({ length: count }, (_, index) => ({
    id: `stop-${index}`,
    latitudeSnapshot: index,
    longitudeSnapshot: index,
    isUrgent: index >= count - urgentCount,
  }));
  mocks.findUniqueOrThrow.mockResolvedValue({
    id: "plan",
    revision: 1,
    warehouseLatitudeSnapshot: -1,
    warehouseLongitudeSnapshot: -1,
    stops,
  });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      deliveryPlan: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      deliveryStop: { update: vi.fn() },
    }),
  );
  return stops;
}

it.each([
  [4, 2],
  [2, 1],
  [25, 12],
])(
  "orders urgent first for %i stores with %i urgent",
  async (count, urgentCount) => {
    const stops = mixedPlan(count, urgentCount);
    mocks.compute.mockImplementation(async (_start, points) => ({
      indices: points.map((_: unknown, index: number) => index).reverse(),
      distanceMeters: 100,
      durationSeconds: 20,
    }));
    const result = await optimizePlan("plan");
    expect(result.stops.map((stop) => stop.id)).toEqual(
      [
        ...stops.slice(count - urgentCount).reverse(),
        ...stops.slice(0, count - urgentCount).reverse(),
      ].map((stop) => stop.id),
    );
    expect(result.distanceMeters).toBe(200);
    expect(result.durationSeconds).toBe(40);
    expect(mocks.compute.mock.calls[0][3]).toBeNull();
    expect(mocks.compute.mock.calls[1][0]).toEqual({
      latitude: count - urgentCount,
      longitude: count - urgentCount,
    });
    expect(mocks.compute.mock.calls[1][3]).toEqual({
      latitude: -1,
      longitude: -1,
    });
    expect(mocks.limit).toHaveBeenCalledTimes(4);
  },
);

it.each([
  [1, 1],
  [25, 25],
  [25, 0],
])(
  "uses one round trip for %i stores and %i urgent",
  async (count, urgentCount) => {
    mixedPlan(count, urgentCount);
    mocks.compute.mockResolvedValue({
      indices: Array.from({ length: count }, (_, i) => i),
      distanceMeters: 1,
      durationSeconds: 1,
    });
    await optimizePlan("plan");
    expect(mocks.compute).toHaveBeenCalledTimes(1);
    expect(mocks.compute.mock.calls[0][3]).toEqual({
      latitude: -1,
      longitude: -1,
    });
    expect(mocks.limit).toHaveBeenCalledTimes(2);
  },
);

it.each(["network", "quota", "invalid order"])(
  "does not persist partial stages on %s failure",
  async (failure) => {
    mixedPlan();
    mocks.compute.mockResolvedValueOnce({
      indices: [1, 0],
      distanceMeters: 100,
      durationSeconds: 20,
    });
    if (failure === "quota")
      mocks.limit
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("quota"));
    else if (failure === "network")
      mocks.compute.mockRejectedValueOnce(new Error("network"));
    else
      mocks.compute.mockResolvedValueOnce({
        indices: [0, 0],
        distanceMeters: 1,
        durationSeconds: 1,
      });
    await expect(optimizePlan("plan")).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(
      mocks.updateMany.mock.calls.at(-1)?.[0].data.optimizationToken,
    ).toBeNull();
    expect(mocks.compute).toHaveBeenCalledTimes(failure === "quota" ? 1 : 2);
  },
);
