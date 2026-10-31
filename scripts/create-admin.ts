import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (
    !username ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  )
    throw new Error("Isi ADMIN_USERNAME dan ADMIN_PASSWORD (12–72 byte).");
  const passwordHash = await hash(password, 12);
  await db.admin.upsert({
    where: { id: "admin" },
    create: { id: "admin", username, passwordHash },
    update: { username, passwordHash, sessionVersion: { increment: 1 } },
  });
  console.log("Admin siap. Sesi lama telah dibatalkan.");
}
main()
  .catch(() => {
    console.error(
      "Gagal membuat admin. Periksa database dan variabel admin (password 12–72 byte).",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
