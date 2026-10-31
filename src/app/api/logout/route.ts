import { api, json } from "@/lib/http";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  return api(request, async () => {
    (await getSession()).destroy();
    return json({ ok: true });
  });
}
