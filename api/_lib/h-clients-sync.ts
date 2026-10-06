import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, ownerPassword, readSession } from "./session.js";

// Кеп (06.10): історія ВСІХ поїздок клієнта з беку для сегментації. Беремо будь-який
// відомий oid клієнта (order_registry) → oid2user-orders → повна історія, всі канали.
// Пишемо стисло в client_trips/{userId}. Обробка порціями з курсором: кнопка в адмінці
// крутить до кінця, нічний cron продовжує з місця, де зупинився.

const BACKEND_URL = "https://eclub.com.ua/input.php";
const DMNKEY = process.env.BACKEND_DMNKEY || "FTP3\"O?m9)r6Ufrcg[L;9URn(2-3I$+tL£n!l<r.DfJ[LM";
const PARALLEL = 8;
const TIME_BUDGET_MS = 50_000;

function isoDate(d?: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(d || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function normalize(o: any) {
  const legs: { from: string; to: string; date: string | null; open: boolean }[] = [];
  if (o.route1 || o.from1) legs.push({ from: String(o.from1 ?? ""), to: String(o.to1 ?? ""), date: isoDate(o.date1), open: Number(o.open1) === 1 });
  if (o.route2 || o.from2) legs.push({ from: String(o.from2 ?? ""), to: String(o.to2 ?? ""), date: isoDate(o.date2), open: Number(o.open2) === 1 || String(o.route2) === "-1" });
  const pax = Array.isArray(o.passengers) ? o.passengers : Array.isArray(o.passangers) ? o.passangers : [];
  return {
    oid: String(o.oid ?? ""),
    status: Number(o.status ?? 0),
    app: String(o.app ?? ""),
    bookedAt: isoDate(o.date),
    legs,
    dsc: pax.map((p: any) => String(p.dsc ?? "0")),
  };
}

async function fetchHistory(oid: string): Promise<any[]> {
  const body = new URLSearchParams({ work: "work", mod: "apimobile", dmnkey: DMNKEY, opr: "oid2user-orders", oid2user: oid });
  const r = await fetch(BACKEND_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const raw = await r.json().catch(() => null);
  return Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isCron = String(req.headers["user-agent"] || "").includes("vercel-cron");
  const pwdOk = ownerPassword() && req.headers["x-admin-password"] === ownerPassword();
  if (!isCron && !readSession(req) && !pwdOk) return res.status(403).json({ error: "Немає доступу" });

  const started = Date.now();
  const db = adminDb();
  const stateRef = db.collection("settings").doc("clientsSync");

  try {
    // Один клієнт на вимогу (відкрили чат у «Вхідних») — шукаємо будь-який його oid.
    const single = String(req.body?.userId ?? "").trim();
    if (single) {
      let snap = await db.collection("order_registry").where("backendUserId", "==", single).limit(1).get();
      if (snap.empty) snap = await db.collection("order_registry").where("userId", "==", single).limit(1).get();
      if (snap.empty) return res.status(404).json({ error: "no_oid" });
      const orders = await fetchHistory(snap.docs[0].id);
      await db.collection("client_trips").doc(single).set({ userId: single, orders: orders.map(normalize), updatedAt: Date.now() });
      return res.status(200).json({ ok: true, count: orders.length });
    }

    // Карта userId → один oid (будь-який — метод повертає всю історію клієнта).
    const reg = await db.collection("order_registry").select("userId", "backendUserId").get();
    const map = new Map<string, string>();
    for (const d of reg.docs) {
      const u = String(d.get("backendUserId") ?? d.get("userId") ?? "").trim();
      if (u && !map.has(u)) map.set(u, d.id);
    }
    const users = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const total = users.length;

    let cursor = Number(req.body?.cursor ?? req.query.cursor ?? NaN);
    if (!Number.isFinite(cursor)) cursor = Number((await stateRef.get()).get("cursor") ?? 0);
    if (cursor >= total) cursor = 0;

    let processed = 0;
    let errors = 0;
    while (cursor < total && Date.now() - started < TIME_BUDGET_MS) {
      const chunk = users.slice(cursor, cursor + PARALLEL);
      await Promise.all(
        chunk.map(async ([userId, oid]) => {
          try {
            const orders = await fetchHistory(oid);
            await db.collection("client_trips").doc(userId).set({ userId, orders: orders.map(normalize), updatedAt: Date.now() });
          } catch {
            errors++;
          }
        })
      );
      cursor += chunk.length;
      processed += chunk.length;
      // Кнопка в адмінці: одна порція на запит, щоб показувати прогрес.
      if (!isCron && processed >= 40) break;
    }
    const done = cursor >= total;
    await stateRef.set({ cursor: done ? 0 : cursor, total, lastRunAt: Date.now(), ...(done ? { lastFullAt: Date.now() } : {}) }, { merge: true });
    return res.status(200).json({ done, next: cursor, total, processed, errors });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Помилка синхронізації" });
  }
}
