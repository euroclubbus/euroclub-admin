import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildEvent, cors, listDestinations, sendToPixel, META_EVENTS } from "./_lib/meta.js";

// Кеп (29.09): Conversions API. Застосунок шле сюди подію (лише при згоді користувача),
// сервер розсилає її в УСІ активні кабінети з адмінки ("Meta-кабінети").
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    if (!META_EVENTS.includes(b.event) || typeof b.eventId !== "string") { res.status(400).json({ error: "bad event" }); return; }
    const dests = (await listDestinations()).filter((d) => d.enabled && d.pixelId && d.accessToken && (!d.events?.length || d.events.includes(b.event)));
    if (!dests.length) { res.status(200).json({ sent: 0 }); return; }
    const ev = buildEvent({
      event: b.event, eventId: b.eventId, platform: String(b.platform || "pwa"),
      deviceId: b.deviceId, url: b.url, data: b.data,
      ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || undefined,
      userAgent: String(req.headers["user-agent"] || "") || undefined,
    });
    const results = await Promise.all(dests.map((d) => sendToPixel(d, [ev]).then((r) => ({ id: d.id, ok: r.ok }))));
    res.status(200).json({ sent: results.filter((r) => r.ok).length, results });
  } catch (e: any) {
    console.error("[meta-capi]", e);
    res.status(500).json({ error: e?.message || "error" });
  }
}
