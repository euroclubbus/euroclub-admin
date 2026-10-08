import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, ownerPassword, readSession } from "./session.js";

// Кеп (08.10): статистика реакцій на розсилки — лайк/дизлайк і прочитання по кожній розсилці
// і загалом. Джерело — notifications/{uid}/messages/* (поле feedback ставить застосунок).
// Нові сповіщення мають campaignId; старі зіставляємо за заголовком і текстом.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pwdOk = ownerPassword() && req.headers["x-admin-password"] === ownerPassword();
  if (!readSession(req) && !pwdOk) return res.status(403).json({ error: "Немає доступу" });
  try {
    const snap = await adminDb().collectionGroup("messages").select("title", "body", "feedback", "read", "campaignId", "type").get();
    const by: Record<string, { sent: number; read: number; like: number; dislike: number }> = {};
    const total = { sent: 0, read: 0, like: 0, dislike: 0 };
    for (const d of snap.docs) {
      if (d.ref.parent.parent?.parent.id !== "notifications") continue; // лише папка сповіщень
      const v = d.data();
      const key = v.campaignId ? `id:${v.campaignId}` : `t:${v.title || ""}|${v.body || ""}`;
      const b = (by[key] ||= { sent: 0, read: 0, like: 0, dislike: 0 });
      b.sent++; total.sent++;
      if (v.read) { b.read++; total.read++; }
      if (v.feedback === "like") { b.like++; total.like++; }
      if (v.feedback === "dislike") { b.dislike++; total.dislike++; }
    }
    return res.status(200).json({ by, total });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Помилка" });
  }
}
