import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { db } from "./db";
import { AppError } from "./errors";
type AdminSession = { adminId?: string; version?: number };
export async function getSession() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32)
    throw new AppError(
      "SESSION_SECRET belum dikonfigurasi (minimal 32 karakter).",
      503,
    );
  return getIronSession<AdminSession>(await cookies(), {
    password,
    cookieName: "rute-antar-session",
    ttl: 8 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_URL?.startsWith("https://") ?? false,
      path: "/",
    },
  });
}
export async function requireAdmin() {
  const session = await getSession();
  if (!session.adminId) throw new AppError("Silakan masuk sebagai admin.", 401);
  const admin = await db.admin.findUnique({ where: { id: session.adminId } });
  if (!admin || session.version !== admin.sessionVersion)
    throw new AppError("Sesi berakhir. Silakan masuk kembali.", 401);
  return admin;
}
