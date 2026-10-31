import { compare } from "bcryptjs";
import { api, json, readJson } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { consumeLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AppError } from "@/lib/errors";

export async function POST(request: Request) {
  return api(
    request,
    async () => {
      await consumeLimit("login:global", 10, 300);
      const data = loginSchema.parse(await readJson(request));
      const admin = await db.admin.findUnique({ where: { id: "admin" } });
      const valid = admin && (await compare(data.password, admin.passwordHash));
      if (!valid || admin.username !== data.username)
        throw new AppError("Nama pengguna atau kata sandi salah.", 401);
      const session = await getSession();
      session.adminId = admin.id;
      session.version = admin.sessionVersion;
      await session.save();
      return json({ ok: true });
    },
    false,
  );
}
