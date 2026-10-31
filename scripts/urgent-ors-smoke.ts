import { computeRoute } from "../src/lib/ors-routes";

// Explicit manual check: two real ORS requests, no database/business data changes.
const warehouse = { latitude: -6.1754, longitude: 106.8272 };
const urgent = [{ latitude: -6.1862, longitude: 106.823 }];
const normal = [{ latitude: -6.1939, longitude: 106.8229 }];
const first = await computeRoute(warehouse, urgent, fetch, null);
const second = await computeRoute(
  urgent[first.indices[0]],
  normal,
  fetch,
  warehouse,
);
console.log({
  stages: 2,
  distanceMeters: first.distanceMeters + second.distanceMeters,
  durationSeconds: first.durationSeconds + second.durationSeconds,
  valid: first.indices.length === 1 && second.indices.length === 1,
});
