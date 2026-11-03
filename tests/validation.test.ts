import { describe, expect, it } from "vitest";
import { locationSchema, planSchema } from "../src/lib/validation";
describe("input validation", () => {
  it.each([0, "0", -90, 90])("accepts latitude %s", (latitude) =>
    expect(
      locationSchema.safeParse({ name: "Gudang", latitude, longitude: 0 })
        .success,
    ).toBe(true),
  );
  it.each(["", " ", null, undefined, true, 91, -91, Infinity, NaN])(
    "rejects invalid latitude %s",
    (latitude) =>
      expect(
        locationSchema.safeParse({ name: "Gudang", latitude, longitude: 0 })
          .success,
      ).toBe(false),
  );
  it.each([-180, 180, 0])("accepts longitude boundary %s", (longitude) =>
    expect(
      locationSchema.safeParse({ name: "Toko", latitude: 0, longitude })
        .success,
    ).toBe(true),
  );
  it.each([-181, 181])("rejects longitude %s", (longitude) =>
    expect(
      locationSchema.safeParse({ name: "Toko", latitude: 0, longitude })
        .success,
    ).toBe(false),
  );
  it("requires 1–30 unique destinations", () => {
    const parse = (storeIds: string[]) =>
      planSchema.safeParse({ deliveryDate: "2026-10-15", storeIds }).success;
    expect(parse([])).toBe(false);
    expect(parse(["a", "a"])).toBe(false);
    expect(parse(Array.from({ length: 30 }, (_, i) => String(i)))).toBe(true);
    expect(parse(Array.from({ length: 31 }, (_, i) => String(i)))).toBe(false);
  });
  it("rejects impossible date", () =>
    expect(
      planSchema.safeParse({ deliveryDate: "2026-02-30", storeIds: ["a"] })
        .success,
    ).toBe(false));
});
