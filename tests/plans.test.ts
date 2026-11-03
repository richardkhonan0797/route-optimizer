import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  compute: vi.fn(),
  legs: vi.fn(),
  fixed: vi.fn(),
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
  computeDrivingLegs: mocks.legs,
  measureFixedRoute: mocks.fixed,
}));
import { optimizePlan } from "../src/lib/plans";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.limit.mockResolvedValue(undefined);
  mocks.legs.mockImplementation(async (_start, points) =>
    points.map(() => ({ distanceMeters: 10, durationSeconds: 2 })),
  );
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
  mocks.legs.mockRejectedValue(new Error("ORS timeout"));
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
  expect(stored.distanceMeters).toBe(20);
  expect(stored.durationSeconds).toBe(4);
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

it("keeps the edited prefix, then optimizes remaining urgent and normal stops from its boundary", async () => {
  const stops = mixedPlan(8, 2);
  const ids = [1, 0, 6, 2, 3, 4, 5, 7].map((i) => stops[i].id);
  mocks.fixed.mockResolvedValue({ distanceMeters: 90, durationSeconds: 15 });
  mocks.compute.mockImplementation(async (_start, points) => ({
    indices: points.map((_: unknown, i: number) => i).reverse(),
    distanceMeters: 50,
    durationSeconds: 10,
  }));
  const result = await optimizePlan("plan", {
    orderedStopIds: ids,
    fixedThroughStopId: ids[2],
    expectedRevision: 1,
  });
  expect(mocks.updateMany.mock.calls[0][0].where).toMatchObject({
    status: "OPTIMIZED",
    revision: 1,
  });
  expect(mocks.compute.mock.calls[0][0]).toEqual({ latitude: 6, longitude: 6 });
  expect(mocks.compute.mock.calls[0][3]).toBeNull();
  expect(mocks.compute.mock.calls[1][3]).toEqual({
    latitude: -1,
    longitude: -1,
  });
  expect(result.indices).toEqual([1, 0, 6, 7, 5, 4, 3, 2]);
  expect(result).toMatchObject({
    distanceMeters: 190,
    durationSeconds: 35,
    revision: 2,
  });
  expect(mocks.legs).not.toHaveBeenCalled();
});

it.each([1, 3])(
  "measures all %i fixed stops including the return in one call",
  async (count) => {
    const ids = mixedPlan(count, 0)
      .map((stop) => stop.id)
      .reverse();
    mocks.fixed.mockResolvedValue({ distanceMeters: 45, durationSeconds: 12 });
    const result = await optimizePlan("plan", {
      orderedStopIds: ids,
      fixedThroughStopId: ids.at(-1),
      expectedRevision: 1,
    });
    expect(result.stops.map((stop) => stop.id)).toEqual(ids);
    expect(mocks.fixed.mock.calls[0][2]).toBe(true);
    expect(mocks.compute).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledTimes(2);
  },
);

it.each([["stop-0"], ["stop-0", "stop-0"], ["stop-0", "foreign"]])(
  "rejects invalid manual membership before quota",
  async (...ids) => {
    mixedPlan(2, 0);
    await expect(
      optimizePlan("plan", {
        orderedStopIds: ids,
        fixedThroughStopId: "stop-0",
        expectedRevision: 1,
      }),
    ).rejects.toThrow();
    expect(mocks.limit).not.toHaveBeenCalled();
  },
);

it("rejects a revision conflict before quota and keeps the saved result after a suffix failure", async () => {
  const ids = mixedPlan(2, 1).map((stop) => stop.id);
  const order = {
    orderedStopIds: ids,
    fixedThroughStopId: ids[0],
    expectedRevision: 1,
  };
  mocks.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(optimizePlan("plan", order)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.limit).not.toHaveBeenCalled();
  mocks.fixed.mockResolvedValue({ distanceMeters: 4, durationSeconds: 2 });
  mocks.compute.mockRejectedValue(new Error("ORS timeout"));
  await expect(optimizePlan("plan", order)).rejects.toThrow("ORS timeout");
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([
  [4, 2],
  [2, 1],
  [30, 12],
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
        stops[count - urgentCount],
        ...stops.slice(count - urgentCount + 1).reverse(),
        ...stops.slice(0, count - urgentCount).reverse(),
      ].map((stop) => stop.id),
    );
    const stages = urgentCount > 1 ? 2 : 1;
    expect(result.distanceMeters).toBe(10 + 100 * stages);
    expect(result.durationSeconds).toBe(2 + 20 * stages);
    expect(mocks.legs.mock.calls[0][1]).toEqual(
      stops.slice(count - urgentCount).map((stop) => ({
        latitude: stop.latitudeSnapshot,
        longitude: stop.longitudeSnapshot,
      })),
    );
    expect(mocks.compute.mock.calls[0][0]).toEqual({
      latitude: count - urgentCount,
      longitude: count - urgentCount,
    });
    if (stages === 2) expect(mocks.compute.mock.calls[0][3]).toBeNull();
    expect(mocks.compute.mock.calls.at(-1)?.[3]).toEqual({
      latitude: -1,
      longitude: -1,
    });
    expect(mocks.limit).toHaveBeenCalledTimes((1 + stages) * 2);
  },
);

it.each([
  [1, 1],
  [30, 30],
  [30, 0],
])(
  "fixes first leg and returns home for %i stores and %i urgent",
  async (count, urgentCount) => {
    mixedPlan(count, urgentCount);
    mocks.compute.mockResolvedValue({
      indices: Array.from({ length: count - 1 }, (_, i) => i),
      distanceMeters: 1,
      durationSeconds: 1,
    });
    await optimizePlan("plan");
    expect(mocks.compute).toHaveBeenCalledTimes(count === 1 ? 0 : 1);
    expect(
      count === 1
        ? mocks.legs.mock.calls[1][1][0]
        : mocks.compute.mock.calls[0][3],
    ).toEqual({
      latitude: -1,
      longitude: -1,
    });
    expect(mocks.limit).toHaveBeenCalledTimes(4);
  },
);

it.each(["network", "quota", "invalid order"])(
  "does not persist partial stages on %s failure",
  async (failure) => {
    mixedPlan();
    mocks.compute.mockResolvedValueOnce({
      indices: [0],
      distanceMeters: 100,
      durationSeconds: 20,
    });
    if (failure === "quota")
      mocks.limit
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
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

it.each([
  [[100, 50, 10], [1, 2, 9], 2],
  [[100, 10, 50], [1, 9, 2], 1],
  [[10, 10, 50], [9, 1, 2], 1],
  [[10, 10, 50], [1, 1, 2], 0],
])(
  "chooses by road distance, duration, then input order",
  async (distances, durations, expected) => {
    mixedPlan(3, 0);
    mocks.legs.mockResolvedValueOnce(
      distances.map((distanceMeters, i) => ({
        distanceMeters,
        durationSeconds: durations[i],
      })),
    );
    mocks.compute.mockResolvedValue({
      indices: [1, 0],
      distanceMeters: 100,
      durationSeconds: 20,
    });
    const result = await optimizePlan("plan");
    expect(result.indices[0]).toBe(expected);
    expect(new Set(result.indices).size).toBe(3);
    expect(result.distanceMeters).toBe(distances[expected] + 100);
    expect(mocks.compute.mock.calls[0][1]).not.toContainEqual({
      latitude: expected,
      longitude: expected,
    });
  },
);

it("counts asymmetric outbound and return legs for one stop", async () => {
  mixedPlan(1, 0);
  mocks.legs
    .mockResolvedValueOnce([{ distanceMeters: 100, durationSeconds: 20 }])
    .mockResolvedValueOnce([{ distanceMeters: 150, durationSeconds: 40 }]);
  expect(await optimizePlan("plan")).toMatchObject({
    indices: [0],
    distanceMeters: 250,
    durationSeconds: 60,
  });
  expect(mocks.compute).not.toHaveBeenCalled();
});

it("rejects a final routing result that arrives after the deadline", async () => {
  mixedPlan(2, 0);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.compute.mockImplementationOnce(async () => {
    vi.mocked(Date.now).mockReturnValue(now + 50001);
    return { indices: [0], distanceMeters: 100, durationSeconds: 20 };
  });
  await expect(optimizePlan("plan")).rejects.toThrow("Waktu tunggu");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(
    mocks.updateMany.mock.calls.at(-1)?.[0].data.optimizationToken,
  ).toBeNull();
});

it("does not persist or start another request after the overall deadline", async () => {
  mixedPlan();
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.legs.mockImplementationOnce(async () => {
    vi.mocked(Date.now).mockReturnValue(now + 50001);
    return [
      { distanceMeters: 10, durationSeconds: 2 },
      { distanceMeters: 20, durationSeconds: 3 },
    ];
  });
  await expect(optimizePlan("plan")).rejects.toThrow("Waktu tunggu");
  expect(mocks.compute).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(
    mocks.updateMany.mock.calls.at(-1)?.[0].data.optimizationToken,
  ).toBeNull();
});
