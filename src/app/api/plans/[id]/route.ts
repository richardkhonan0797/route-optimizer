import { api, json } from "@/lib/http";
import { db } from "@/lib/db";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async () => {
    const { id } = await context.params;
    const plan = await db.deliveryPlan.findUnique({
      where: { id },
      include: { stops: { orderBy: { inputOrder: "asc" } } },
    });
    if (!plan) return json({ error: "Rencana tidak ditemukan." }, 404);
    return json(plan);
  });
}
