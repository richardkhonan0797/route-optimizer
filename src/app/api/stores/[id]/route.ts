import { api, json, readJson } from "@/lib/http";
import { storeSchema } from "@/lib/validation";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  return api(request, async () => {
    const { id } = await context.params;
    return json(
      await db.store.update({
        where: { id },
        data: storeSchema.parse(await readJson(request)),
      }),
    );
  });
}

export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    const { id } = await context.params;
    return json(
      await db.store.update({ where: { id }, data: { isActive: false } }),
    );
  });
}
