import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildEvent, cors, db, isAdmin, listDestinations, sendToPixel } from "./_lib/meta.js";

// Кеп (29.09): керування "Meta-кабінетами" з адмінки. Захищено паролем адмінки
// (заголовок x-admin-password). Токени назад у браузер НЕ віддаються — тільки маска.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!isAdmin(req)) { res.status(401).json({ error: "Невірний пароль адмінки" }); return; }
  const col = db().collection("meta_destinations");
  try {
    if (req.method === "GET") {
      const list = await listDestinations();
      res.status(200).json({
        destinations: list.map((d) => ({ ...d, accessToken: undefined, tokenMask: d.accessToken ? `••••${d.accessToken.slice(-6)}` : "" })),
      });
      return;
    }
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    if (req.method === "DELETE") {
      if (!b.id) { res.status(400).json({ error: "id" }); return; }
      await col.doc(String(b.id)).delete();
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "POST" && b.action === "test") {
      const snap = await col.doc(String(b.id)).get();
      const d = snap.data() as any;
      if (!d) { res.status(404).json({ error: "not found" }); return; }
      const ev = buildEvent({ event: "Purchase", eventId: `test-${Date.now()}`, platform: "pwa", url: "https://euroclub-app.vercel.app/", deviceId: "admin-test", data: { value: 1, currency: "UAH", orderId: "TEST" } });
      const r = await sendToPixel(d, [ev], b.testEventCode || undefined);
      res.status(200).json({ ok: r.ok, status: r.status, response: r.body });
      return;
    }
    if (req.method === "POST") {
      const name = String(b.name || "").trim();
      const pixelId = String(b.pixelId || "").replace(/\D/g, "");
      if (!name || !pixelId) { res.status(400).json({ error: "Потрібні назва і Pixel ID" }); return; }
      const now = new Date().toISOString();
      const data: Record<string, unknown> = {
        name, pixelId, enabled: b.enabled !== false,
        events: Array.isArray(b.events) ? b.events.map(String) : [],
        updatedAt: now,
      };
      if (typeof b.accessToken === "string" && b.accessToken.trim()) data.accessToken = b.accessToken.trim();
      if (b.id) await col.doc(String(b.id)).set(data, { merge: true });
      else {
        if (!data.accessToken) { res.status(400).json({ error: "Потрібен Access Token" }); return; }
        await col.add({ ...data, createdAt: now });
      }
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "method" });
  } catch (e: any) {
    console.error("[meta-destinations]", e);
    res.status(500).json({ error: e?.message || "error" });
  }
}
