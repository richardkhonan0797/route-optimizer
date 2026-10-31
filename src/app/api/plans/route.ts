import { api, json, readJson } from "@/lib/http";
import { pagingSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { createPlan } from "@/lib/plans";
export async function GET(request: Request) {
  return api(request, async () => {
    const { page } = pagingSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const [items, total] = await db.$transaction([
      db.deliveryPlan.findMany({
        orderBy: [{ deliveryDate: "desc" }, { id: "desc" }],
        take: 20,
        skip: (page - 1) * 20,
        select: {
          id: true,
          deliveryDate: true,
          status: true,
          warehouseNameSnapshot: true,
          _count: { select: { stops: true } },
        },
      }),
      db.deliveryPlan.count(),
    ]);
    return json({ items, total, page });
  });
}
export async function POST(request: Request) {
  return api(request, async () =>
    json(await createPlan(await readJson(request)), 201),
  );
}
