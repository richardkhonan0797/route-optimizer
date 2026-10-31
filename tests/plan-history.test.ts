import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../src/lib/db", () => ({
  db: { deliveryPlan: { findUnique: mocks.find } },
}));
vi.mock("../src/lib/http", () => ({
  api: async (_request: Request, action: () => Promise<Response>) => action(),
  json: (data: unknown, status = 200) => Response.json(data, { status }),
}));
import { GET } from "../src/app/api/plans/[id]/route";
it.each([
  { routingProvider: "ORS", distanceMeters: 3210, durationSeconds: 600 },
  {
    routingProvider: "GOOGLE_LEGACY",
    distanceMeters: null,
    durationSeconds: null,
  },
])(
  "returns persisted history without hiding order or inventing metrics",
  async (fields) => {
    const plan = {
      id: "plan",
      status: "OPTIMIZED",
      optimizedAt: "2026-10-28T00:00:00.000Z",
      stops: [
        { visitOrder: 1, isUrgent: true },
        { visitOrder: 2, isUrgent: false },
      ],
      ...fields,
    };
    mocks.find.mockResolvedValue(plan);
    const response = await GET(new Request("http://localhost/api/plans/plan"), {
      params: Promise.resolve({ id: "plan" }),
    });
    expect(await response.json()).toEqual(plan);
  },
);
