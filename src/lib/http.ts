import { ZodError } from "zod";
import { AppError } from "./errors";
import { requireAdmin } from "./session";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}
export async function readJson(request: Request, allowEmpty = false) {
  if (!request.body) throw new AppError("Data wajib diisi.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new AppError("Data terlalu besar.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (allowEmpty && size === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("Format data tidak valid.");
  }
}
export function checkOrigin(request: Request) {
  if (request.method === "GET") return;
  const expected = process.env.APP_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    throw new AppError("Asal permintaan tidak diizinkan.", 403);
}
export async function api(
  request: Request,
  handler: () => Promise<Response>,
  authenticated = true,
) {
  try {
    if (authenticated) await requireAdmin();
    checkOrigin(request);
    return await handler();
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Data tidak valid." },
        400,
      );
    console.error("Unhandled API error", request.method, new URL(request.url).pathname, error);
    return json(
      {
        error:
          "Layanan belum tersedia. Periksa konfigurasi database atau coba lagi.",
      },
      500,
    );
  }
}
