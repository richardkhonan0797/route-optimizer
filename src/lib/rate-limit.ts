import { db } from "./db";
import { AppError } from "./errors";
// An atomic PostgreSQL upsert shares limits across app instances, without trusting proxy IP headers.
export async function consumeLimit(
  key: string,
  maximum: number,
  seconds: number,
) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, NOW(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < NOW() - (${seconds} * INTERVAL '1 second') THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < NOW() - (${seconds} * INTERVAL '1 second') THEN NOW() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  if (rows[0].count > maximum)
    throw new AppError(
      "Terlalu banyak permintaan. Tunggu beberapa saat sebelum mencoba lagi.",
      429,
    );
}
