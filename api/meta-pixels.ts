import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, listDestinations } from "./_lib/meta.js";

// Кеп (29.09): ПУБЛІЧНИЙ список пікселів для вебверсії застосунку — тільки Pixel ID
// (вони й так видимі в браузері) і фільтр подій. Токенів тут немає.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  try {
    const pixels = (await listDestinations())
      .filter((d) => d.enabled && d.pixelId)
      .map((d) => ({ id: d.pixelId, events: d.events || [] }));
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ pixels });
  } catch (e: any) {
    res.status(200).json({ pixels: [], error: e?.message });
  }
}
