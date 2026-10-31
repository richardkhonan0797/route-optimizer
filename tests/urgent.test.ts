import { expect, it } from "vitest";
import { planSchema } from "../src/lib/validation";

const input = { deliveryDate: "2026-10-30", storeIds: ["a", "b"] };
it("defaults old payloads to no urgent destinations", () => {
  expect(planSchema.parse(input).urgentStoreIds).toEqual([]);
});
it.each([["a"], ["a", "b"], []])("accepts urgent subset %j", (...ids) => {
  expect(
    planSchema.parse({ ...input, urgentStoreIds: ids }).urgentStoreIds,
  ).toEqual(ids);
});
it.each([["a", "a"], ["c"]])("rejects invalid urgent subset %j", (...ids) => {
  expect(planSchema.safeParse({ ...input, urgentStoreIds: ids }).success).toBe(
    false,
  );
});
