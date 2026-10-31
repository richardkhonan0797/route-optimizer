import assert from "node:assert/strict";

// Read-only smoke checks after authentication; no paid Google requests or fixture writes.
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const unauthorized = await fetch(`${baseUrl}/api/stores`);
assert.equal(unauthorized.status, 401, "Data must require an admin session");
const login = await fetch(`${baseUrl}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  }),
});
assert.equal(login.status, 200, "Admin login must succeed");
const cookies = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
assert.ok(cookies, "Login must set a session cookie");
for (const endpoint of ["warehouse", "stores", "plans"]) {
  const response = await fetch(`${baseUrl}/api/${endpoint}`, {
    headers: { Cookie: cookies },
  });
  assert.equal(response.status, 200, `${endpoint} must load`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
}
const forbidden = await fetch(`${baseUrl}/api/warehouse`, {
  method: "PUT",
  headers: {
    Cookie: cookies,
    Origin: "https://untrusted.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "Must not save", latitude: 0, longitude: 0 }),
});
assert.equal(forbidden.status, 403, "Cross-origin mutations must be rejected");
const logout = await fetch(`${baseUrl}/api/logout`, {
  method: "POST",
  headers: { Cookie: cookies, Origin: baseUrl },
});
assert.equal(logout.status, 200, "Logout must succeed");
console.log(
  "HTTP smoke passed: unauthenticated protection, admin session, data endpoints, no-store, Origin protection, logout.",
);
