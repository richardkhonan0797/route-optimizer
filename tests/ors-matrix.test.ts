import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computeDrivingLegs } from "../src/lib/ors-routes";
import { measureFixedRoute } from "../src/lib/ors-routes";

const start = { latitude: 1, longitude: 2 };
const destinations = [{ latitude: 3, longitude: 4 }];
beforeEach(() => vi.stubEnv("ORS_API_KEY", "secret-key"));
it("sums consecutive directed legs and the asymmetric return, ignoring unused unreachable cells", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        distances: [
          [0, 10, null],
          [500, 0, 20],
          [30, null, 0],
        ],
        durations: [
          [0, 1, null],
          [50, 0, 2],
          [3, null, 0],
        ],
      }),
    ),
  );
  try {
    const stops = [...destinations, { latitude: 5, longitude: 6 }];
    await expect(measureFixedRoute(start, stops, false)).resolves.toEqual({
      distanceMeters: 30,
      durationSeconds: 3,
    });
    await expect(measureFixedRoute(start, stops, true)).resolves.toEqual({
      distanceMeters: 60,
      durationSeconds: 6,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
afterEach(() => vi.unstubAllEnvs());

it.each([1, 30])(
  "requests driving distances and durations for %i destinations",
  async (count) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        distances: [Array(count).fill(123)],
        durations: [Array(count).fill(45)],
      }),
    );
    const result = await computeDrivingLegs(
      start,
      Array(count).fill(destinations[0]),
      fetcher,
    );
    expect(result).toEqual(
      Array(count).fill({ distanceMeters: 123, durationSeconds: 45 }),
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
    );
    expect(JSON.parse(options?.body as string)).toEqual({
      locations: [[2, 1], ...Array(count).fill([4, 3])],
      sources: ["0"],
      destinations: Array.from({ length: count }, (_, i) => String(i + 1)),
      metrics: ["distance", "duration"],
      units: "m",
    });
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "secret-key",
    );
    expect(options?.cache).toBe("no-store");
  },
);

it.each([
  {},
  { distances: [[1]] },
  { distances: [], durations: [[1]] },
  { distances: [[1, 2]], durations: [[1]] },
  { distances: [[1]], durations: [[-1]] },
  { distances: [["1"]], durations: [[1]] },
  { distances: [[null]], durations: [[1]] },
  { distances: [[1]], durations: [[null]] },
])("rejects malformed or unreachable matrix results", async (body) => {
  await expect(
    computeDrivingLegs(
      start,
      destinations,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
    ),
  ).rejects.toThrow();
});

it.each([400, 401, 403, 422, 429, 500])(
  "sanitizes HTTP %i without retry",
  async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret-key", { status }));
    await expect(
      computeDrivingLegs(start, destinations, fetcher),
    ).rejects.not.toThrow("secret-key");
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("validates coordinates, count, and key before sending a request", async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const points of [
    [],
    Array(31).fill(start),
    [{ latitude: 91, longitude: 0 }],
  ])
    await expect(computeDrivingLegs(start, points, fetcher)).rejects.toThrow();
  vi.stubEnv("ORS_API_KEY", "");
  await expect(
    computeDrivingLegs(start, destinations, fetcher),
  ).rejects.toThrow("ORS_API_KEY");
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects network failures and invalid JSON", async () => {
  await expect(
    computeDrivingLegs(
      start,
      destinations,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("secret-key")),
    ),
  ).rejects.toThrow("waktu tunggu");
  await expect(
    computeDrivingLegs(
      start,
      destinations,
      vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid")),
    ),
  ).rejects.toThrow("tidak valid");
});

it("honors an already expired overall deadline without fetching", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    computeDrivingLegs(start, destinations, fetcher, AbortSignal.abort()),
  ).rejects.toThrow("waktu tunggu");
  expect(fetcher).not.toHaveBeenCalled();
});

it("passes cancellation to an in-flight request", async () => {
  const controller = new AbortController();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, options) => {
      controller.abort();
      expect(options?.signal?.aborted).toBe(true);
      throw new Error("aborted");
    });
  await expect(
    computeDrivingLegs(start, destinations, fetcher, controller.signal),
  ).rejects.toThrow("waktu tunggu");
});
