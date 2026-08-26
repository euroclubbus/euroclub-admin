import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Багато послідовних запитів + ретраї (Кеп: потрібні 100% замовлень, не просто "більшість")
// можуть зайняти довше за типовий ліміт Vercel-функції. Піднімаємо стелю максимально —
// спрацює настільки, наскільки дозволяє план (ігнорується на Hobby, спрацює на Pro+).
export const config = { maxDuration: 300 };

// Звіт "ефективність каналу застосунку" (Кеп, 25.08): для кожного УНІКАЛЬНОГО userId,
// відомого нам (з order_registry), робимо ОДИН запит oid2user-orders (адмінський метод,
// повертає ПОВНУ історію юзера — усі канали: сайт, менеджер, застосунок, не тільки те, що
// пройшло через order_registry). З цієї повної історії рахуємо реальні метрики — включно
// з тим, чи БУВ застосунок першим каналом комунікації (найперше за датою замовлення юзера
// має app=1 або app=2).

const BACKEND_URL = "https://eclub.com.ua/input.php";
const DMNKEY = process.env.BACKEND_DMNKEY || "FTP3\"O?m9)r6Ufrcg[L;9URn(2-3I$+tL£n!l<r.DfJ[LM";
const CONCURRENCY = 3; // Кеп (26.08): 8 перевантажувало базу бекенду (db_connect_err) —
// зменшено, разом з ретраями нижче.

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ретраї при db_connect_err (бекенд сам каже "не можу підключитись до бази" — тимчасове,
// не постійна помилка per-замовлення, підтверджено: усі невдачі в одному запуску мають
// однаковий час, тобто це наш паралельний потік перевантажує їхню БД у ту секунду).
// Кеп: "мені треба 100% по всіх замовленнях" — тому повторюємо з паузою, а не здаємось одразу.
async function fetchUserOrdersByOidWithRetry(oid: string, maxRetries = 4): Promise<{ orders: any[]; raw: string; httpStatus: number }> {
  let lastResult: { orders: any[]; raw: string; httpStatus: number } | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fetchUserOrdersByOid(oid);
    lastResult = result;
    if (result.orders.length > 0) return result;
    if (!result.raw.includes("db_connect_err")) return result; // інша причина — не повторюємо навмання
    if (attempt < maxRetries) await sleep(800 * (attempt + 1)); // 800мс, 1.6с, 2.4с, 3.2с
  }
  return lastResult!;
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function fetchUserOrdersByOid(oid: string): Promise<{ orders: any[]; raw: string; httpStatus: number }> {
  const body = new URLSearchParams({
    work: "work",
    mod: "apimobile",
    dmnkey: DMNKEY,
    opr: "oid2user-orders",
    oid2user: oid,
  });
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const rawText = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(rawText); } catch { /* нижче обробимо як сиру відповідь */ }
  const orders = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
  return { orders, raw: rawText, httpStatus: res.status };
}

// "date" з бекенду — формат DD.MM.YYYY. Парсимо для сортування за найранішим замовленням.
function parseBackendDate(s: string | undefined): number {
  if (!s) return Infinity;
  const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return Infinity;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Метод не підтримується" });
    return;
  }

  // Кеп (25.08): опційний діапазон дат (YYYY-MM-DD, як з <input type="date">) — якщо
  // задано, у метрики й у визначення "першого каналу" йдуть тільки замовлення юзера, чия
  // дата (поле "date" з бекенду) потрапляє в цей діапазон. Юзери без жодного замовлення
  // в діапазоні просто не враховуються в жодній цифрі цього звіту.
  // Кеп (26.08): статус БІЛЬШЕ НЕ фільтр-перемикач — усі три (оплачені/очікують/скасовані)
  // рахуються ОДРАЗУ, окремими полями в тому самому звіті.
  const { dateFrom, dateTo, excludeUserIds } = req.body ?? {};
  const hasRange = typeof dateFrom === "string" && dateFrom.length > 0 || typeof dateTo === "string" && dateTo.length > 0;

  function orderDateISO(o: any): string {
    const m = String(o?.date ?? "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!m) return "";
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  function inRange(o: any): boolean {
    if (!hasRange) return true;
    const iso = orderDateISO(o);
    if (!iso) return false;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  }
  // Та сама класифікація, що й у Реєстрі замовлень (OrderRegistry.tsx): 0 = скасовано,
  // 2/3 = оплачено, інакше = очікує оплати.
  function orderStatusBucket(o: any): "paid" | "unpaid" | "cancelled" {
    const n = Number(o?.status);
    if (n === 0) return "cancelled";
    if (n === 2 || n === 3) return "paid";
    return "unpaid";
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    const snap = await db.collection("order_registry").get();
    const userIdToOid = new Map<string, string>(); // перший відомий нам oid цього userId
    for (const doc of snap.docs) {
      const data = doc.data() as { backendUserId?: string; userId?: string };
      const userId = data.backendUserId ?? data.userId;
      if (userId && !userIdToOid.has(userId)) userIdToOid.set(userId, doc.id);
    }

    const excludeSet = new Set<string>(Array.isArray(excludeUserIds) ? excludeUserIds.map(String) : []);
    const userIds = Array.from(userIdToOid.keys()).filter((uid) => !excludeSet.has(uid));
    const results: { userId: string; orders: any[] }[] = [];
    const failureSamples: { userId: string; pivotOid: string; httpStatus?: number; raw?: string; error?: string }[] = [];

    // Обробляємо пачками по CONCURRENCY, щоб не заваливати бекенд усіма запитами одразу.
    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      const batch = userIds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (uid) => {
          const pivotOid = userIdToOid.get(uid)!;
          try {
            const { orders, raw, httpStatus } = await fetchUserOrdersByOidWithRetry(pivotOid);
            if (orders.length === 0 && failureSamples.length < 10) {
              failureSamples.push({ userId: uid, pivotOid, httpStatus, raw: raw.slice(0, 300) });
            }
            return { userId: uid, orders };
          } catch (e) {
            if (failureSamples.length < 10) {
              failureSamples.push({ userId: uid, pivotOid, error: e instanceof Error ? e.message : String(e) });
            }
            return { userId: uid, orders: [] };
          }
        })
      );
      results.push(...batchResults);
    }

    let totalTickets = 0;
    let appOrders = 0;
    let appOrdersPaid = 0;
    let appOrdersUnpaid = 0;
    let appOrdersCancelled = 0;
    let androidOrders = 0;
    let iphoneOrders = 0;
    let usersFirstFromApp = 0;
    let usersWithNoData = 0;
    let usersInRange = 0;
    let existingUsersNowUsingApp = 0; // раніше купували НЕ через додаток, у цьому періоді — купують і через нього

    for (const { orders } of results) {
      if (orders.length === 0) { usersWithNoData++; continue; }
      const ordersInRange = orders.filter(inRange);
      if (ordersInRange.length === 0) continue; // юзер активний, але не в цьому діапазоні
      usersInRange++;
      let hasAppOrderInRange = false;
      for (const o of ordersInRange) {
        const appVal = String(o.app ?? "");
        if (appVal === "1" || appVal === "2") {
          // Кеп (25.08): рахуємо ТІЛЬКИ замовлення й квитки з додатку — не всі канали.
          appOrders++;
          totalTickets += Array.isArray(o.passengers) ? o.passengers.length : 0;
          if (appVal === "1") androidOrders++; else iphoneOrders++;
          hasAppOrderInRange = true;
          const bucket = orderStatusBucket(o);
          if (bucket === "paid") appOrdersPaid++;
          else if (bucket === "cancelled") appOrdersCancelled++;
          else appOrdersUnpaid++;
        }
      }
      const sorted = [...orders].sort((a, b) => parseBackendDate(a.date) - parseBackendDate(b.date));
      const first = sorted[0]; // АБСОЛЮТНО перше замовлення за все життя юзера (не тільки в діапазоні) —
      // юзер уже кваліфікований як "активний у цьому періоді" (ordersInRange.length > 0 вище).
      const firstApp = String(first?.app ?? "");
      const isNewFromApp = firstApp === "1" || firstApp === "2";
      if (isNewFromApp) usersFirstFromApp++;
      // Кеп (25.08): "старий" клієнт (перше замовлення НЕ через додаток), який У ЦЬОМУ
      // ПЕРІОДІ хоч раз купив через додаток — тобто перейшов на новий канал.
      else if (hasAppOrderInRange) existingUsersNowUsingApp++;
    }

    res.status(200).json({
      totalUsers: usersInRange,
      usersWithNoData,
      totalTickets,
      appOrders,
      appOrdersPaid,
      appOrdersUnpaid,
      appOrdersCancelled,
      androidOrders,
      iphoneOrders,
      usersFirstFromApp,
      existingUsersNowUsingApp,
      generatedAt: new Date().toISOString(),
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      failureSamples,
    });
  } catch (err) {
    console.error("channel-report error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
