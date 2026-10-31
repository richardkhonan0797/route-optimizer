import { cp } from "node:fs/promises";
// Next standalone output deliberately excludes static assets; copy them for local npm start.
await cp(
  new URL("../public", import.meta.url),
  new URL("../.next/standalone/public", import.meta.url),
  { recursive: true },
);
await cp(
  new URL("../.next/static", import.meta.url),
  new URL("../.next/standalone/.next/static", import.meta.url),
  { recursive: true },
);
process.env.HOSTNAME = process.env.APP_HOST ?? "127.0.0.1";
await import("../.next/standalone/server.js");
