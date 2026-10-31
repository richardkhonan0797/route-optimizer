import { api, json, readJson } from "@/lib/http";
import { locationSchema } from "@/lib/validation";
import { db } from "@/lib/db";
export async function GET(request: Request) {
  return api(request, async () =>
    json(await db.warehouse.findUnique({ where: { id: "main" } })),
  );
}
export async function PUT(request: Request) {
  return api(request, async () => {
    const data = locationSchema.parse(await readJson(request));
    return json(
      await db.warehouse.upsert({
        where: { id: "main" },
        create: { id: "main", ...data },
        update: data,
      }),
    );
  });
}
