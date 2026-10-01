import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { cors, db } from "./_lib/meta.js";

// Кеп (01.10): бекенд сайту шле сюди дату народження та обрані міста при КОЖНІЙ зміні
// (і пакетом — для першого завантаження). Пише в ту саму таблицю user_profiles, що й
// застосунок. Захист — заголовок x-sync-key (ключ генерується в адмінці, вкладка
// "Клієнти: ДН і міста", зберігається в server_secrets/profileSync — клієнтам недоступно).
async function syncKey(): Promise<string | null> {
  const snap = await db().collection("server_secrets").doc("profileSync").get();
  return (snap.data()?.key as string) || null;
}

const normDate = (v: unknown): string => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (!m) return "";
  return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-sync-key");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }
  try {
    const key = await syncKey();
    if (!key || req.headers["x-sync-key"] !== key) { res.status(401).json({ ok: false, error: "bad x-sync-key" }); return; }
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const items: any[] = Array.isArray(b.items) ? b.items : [b];
    if (items.length > 500) { res.status(400).json({ ok: false, error: "max 500 items" }); return; }
    const batch = db().batch();
    let saved = 0;
    for (const it of items) {
      const uid = String(it?.user_id ?? "").trim();
      if (!uid) continue;
      const data: Record<string, unknown> = {
        userId: uid,
        source: String(it.source || "site"),
        siteUpdatedAt: String(it.updated_at || ""),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if ("birthday" in it) data.birthday = normDate(it.birthday);
      if ("favcity" in it) data.favCities = String(it.favcity ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
      if (typeof it.header === "string" && it.header.trim()) data.header = it.header.trim();
      batch.set(db().collection("user_profiles").doc(uid), data, { merge: true });
      saved++;
    }
    if (!saved) { res.status(400).json({ ok: false, error: "user_id required" }); return; }
    await batch.commit();
    res.status(200).json({ ok: true, saved });
  } catch (e: any) {
    console.error("[profile-sync]", e);
    res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
