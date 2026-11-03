import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computeRoute, mapOptimizedStops } from "../src/lib/ors-routes";
const warehouse = { latitude: -6, longitude: 106 };
const stores = [
  { latitude: -7, longitude: 107 },
  { latitude: -8, longitude: 108 },
];
const output = (ids = [2, 1]) => ({
  code: 0,
  unassigned: [],
  routes: [
    {
      vehicle: 1,
      distance: 2000,
      duration: 123,
      steps: [
        { type: "start" },
        ...ids.map((id) => ({ type: "job", id })),
        { type: "end" },
      ],
    },
  ],
});
beforeEach(() => vi.stubEnv("ORS_API_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());
it("sends coordinates, jobs, round trip and geometry option to HeiGIT", async () => {
  const mock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(output()));
  expect(await computeRoute(warehouse, stores, mock)).toEqual({
    indices: [1, 0],
    distanceMeters: 2000,
    durationSeconds: 123,
  });
  const [url, options] = mock.mock.calls[0];
  expect(url).toBe("https://api.heigit.org/vroom/v0");
  expect(new Headers(options?.headers).get("Authorization")).toBe("test-key");
  expect(JSON.parse(options?.body as string)).toEqual({
    vehicles: [
      { id: 1, profile: "driving-car", start: [106, -6], end: [106, -6] },
    ],
    jobs: [
      { id: 1, location: [107, -7] },
      { id: 2, location: [108, -8] },
    ],
    options: { g: true },
  });
});
it.each([1, 30])("supports %i stores", async (count) => {
  const mock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(output(Array.from({ length: count }, (_, i) => i + 1))),
    );
  expect(
    (await computeRoute(warehouse, Array(count).fill(stores[0]), mock)).indices,
  ).toHaveLength(count);
});
it.each([[], [1], [1, 1], [1, 3], [0, 2]])(
  "rejects incomplete job order %j",
  async (...ids) => {
    await expect(
      computeRoute(
        warehouse,
        stores,
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(output(ids))),
      ),
    ).rejects.toThrow();
  },
);
it.each([
  {},
  { ...output(), code: 1 },
  { ...output(), unassigned: [{ id: 1 }] },
  { ...output(), routes: [] },
  { ...output(), routes: [...output().routes, ...output().routes] },
  { ...output(), routes: [{ ...output().routes[0], distance: -1 }] },
  { ...output(), routes: [{ ...output().routes[0], duration: null }] },
])("rejects invalid output", async (body) => {
  await expect(
    computeRoute(
      warehouse,
      stores,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
    ),
  ).rejects.toThrow();
});
it.each([400, 401, 403, 422, 429, 500])(
  "sanitizes HTTP %i without retry",
  async (status) => {
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("test-key", { status }));
    await expect(computeRoute(warehouse, stores, mock)).rejects.not.toThrow(
      "test-key",
    );
    expect(mock).toHaveBeenCalledTimes(1);
  },
);
it("handles timeout and invalid JSON", async () => {
  await expect(
    computeRoute(
      warehouse,
      stores,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("secret")),
    ),
  ).rejects.toThrow("waktu tunggu");
  await expect(
    computeRoute(
      warehouse,
      stores,
      vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid")),
    ),
  ).rejects.toThrow("tidak valid");
});
it("requires key before network", async () => {
  vi.stubEnv("ORS_API_KEY", "");
  const mock = vi.fn<typeof fetch>();
  await expect(computeRoute(warehouse, stores, mock)).rejects.toThrow(
    "ORS_API_KEY",
  );
  expect(mock).not.toHaveBeenCalled();
});
it("validates input before network", async () => {
  const mock = vi.fn<typeof fetch>();
  for (const points of [
    [],
    Array(31).fill(stores[0]),
    [{ latitude: 91, longitude: 0 }],
  ])
    await expect(computeRoute(warehouse, points, mock)).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
  expect(mapOptimizedStops(["a", "b"], [1, 0])).toEqual(["b", "a"]);
});

it("supports an open urgent stage and a different return destination", async () => {
  const mock = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(output()));
  await computeRoute(warehouse, stores, mock, null);
  expect(
    JSON.parse(mock.mock.calls[0][1]?.body as string).vehicles[0],
  ).not.toHaveProperty("end");
  await computeRoute(stores[0], stores, mock, warehouse);
  expect(
    JSON.parse(mock.mock.calls[1][1]?.body as string).vehicles[0],
  ).toMatchObject({
    start: [107, -7],
    end: [106, -6],
  });
});
