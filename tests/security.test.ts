import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => mocks);
import {
  GET as stores,
  POST as createStore,
} from "../src/app/api/stores/route";
import { GET as plans, POST as createPlan } from "../src/app/api/plans/route";
import {
  GET as warehouse,
  PUT as updateWarehouse,
} from "../src/app/api/warehouse/route";
import { POST as optimize } from "../src/app/api/plans/[id]/optimize/route";
import { GET as plan } from "../src/app/api/plans/[id]/route";
import {
  PUT as updateStore,
  DELETE as deactivateStore,
} from "../src/app/api/stores/[id]/route";
import { api, readJson } from "../src/lib/http";
beforeEach(() => {
  mocks.requireAdmin.mockRejectedValue(new AppError("Silakan masuk.", 401));
});
it("protects all data and mutation endpoints without a session", async () => {
  for (const handler of [
    stores,
    createStore,
    plans,
    createPlan,
    warehouse,
    updateWarehouse,
  ]) {
    const response = await handler(new Request("http://localhost/api"));
    expect(response.status).toBe(401);
  }
  for (const handler of [optimize, plan, updateStore, deactivateStore]) {
    const response = await handler(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(response.status).toBe(401);
  }
});
it("blocks cross origin mutations before business logic", async () => {
  mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  vi.stubEnv("APP_URL", "https://rute.example.com");
  const handler = vi.fn();
  const response = await api(
    new Request("https://rute.example.com/api", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
    handler,
  );
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

it("rejects an oversized streamed body and malformed JSON", async () => {
  await expect(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        body: "x".repeat(16385),
      }),
    ),
  ).rejects.toThrow("terlalu besar");
  await expect(
    readJson(new Request("http://localhost", { method: "POST", body: "{" })),
  ).rejects.toThrow("Format data");
  await expect(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        body: '{"latitude":0}',
      }),
    ),
  ).resolves.toEqual({ latitude: 0 });
});
