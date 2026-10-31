import { api, json, readJson } from "@/lib/http";
import { pagingSchema, storeSchema } from "@/lib/validation";
import { db } from "@/lib/db";
export async function GET(request: Request) {
  return api(request, async () => {
    const params = new URL(request.url).searchParams;
    const { q, page } = pagingSchema.parse(Object.fromEntries(params));
    const where = {
      name: { contains: q, mode: "insensitive" as const },
      ...(params.get("active") === "true" ? { isActive: true } : {}),
    };
    const [items, total] = await db.$transaction([
      db.store.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.store.count({ where }),
    ]);
    return json({ items, total, page });
  });
}
export async function POST(request: Request) {
  return api(request, async () =>
    json(
      await db.store.create({
        data: storeSchema.parse(await readJson(request)),
      }),
      201,
    ),
  );
}
