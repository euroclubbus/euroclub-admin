import type { VercelRequest, VercelResponse } from "@vercel/node";

// Кеп (01.09): "справжня кількість" по кнопці — на відміну від userStatsMap (лічить лише
// документи order_registry, тобто ЛИШЕ замовлення через застосунок), цей ендпоінт іде
// напряму на бекенд через oid2user-orders (адмінський метод, той самий, що вже
// використовує bulk-refresh/channel-report) і повертає ПОВНУ історію користувача —
// сайт + застосунок + вручну створені менеджером. Викликається ТІЛЬКИ по кнопці, для
// одного конкретного user_id за раз (не масово) — щоб не навантажувати бекенд.

const BACKEND_URL = "https://eclub.com.ua/input.php";
const DMNKEY = process.env.BACKEND_DMNKEY || "FTP3\"O?m9)r6Ufrcg[L;9URn(2-3I$+tL£n!l<r.DfJ[LM";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const oid = String(req.body?.oid ?? req.query?.oid ?? "").trim();
  if (!oid) return res.status(400).json({ error: "oid обов'язковий (будь-який відомий oid цього user_id)" });

  try {
    const body = new URLSearchParams({
      work: "work",
      mod: "apimobile",
      dmnkey: DMNKEY,
      opr: "oid2user-orders",
      oid2user: oid,
    });
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const rawText = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(rawText); } catch { /* нижче обробимо як помилку */ }
    if (!parsed) {
      return res.status(502).json({ error: "Бекенд повернув не-JSON відповідь", raw: rawText.slice(0, 300) });
    }
    const list: any[] = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
    let app1 = 0, app2 = 0, other = 0;
    for (const o of list) {
      const app = String(o?.app ?? "");
      if (app === "1") app1++;
      else if (app === "2") app2++;
      else other++;
    }
    return res.status(200).json({ total: list.length, app1, app2, other, userId: list[0]?.user_id ?? null });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Невідома помилка запиту до бекенду" });
  }
}
