import { api, json, readJson } from "@/lib/http";
import { optimizePlan } from "@/lib/plans";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async () =>
    json(
      await optimizePlan(
        (await context.params).id,
        request.body ? await readJson(request, true) : undefined,
      ),
    ),
  );
}
