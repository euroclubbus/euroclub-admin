import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Багато послідовних запитів до бекенду (по одному на унікального юзера) — типовий ліміт
// Vercel-функції (10с на Hobby) може не вистачити. Піднімаємо стелю, наскільки дозволяє
// план (ігнорується на Hobby, спрацює на Pro+).
export const config = { maxDuration: 60 };

// Звіт "ефективність каналу застосунку" (Кеп, 25.08): для кожного УНІКАЛЬНОГО userId,
// відомого нам (з order_registry), робимо ОДИН запит oid2user-orders (адмінський метод,
// повертає ПОВНУ історію юзера — усі канали: сайт, менеджер, застосунок, не тільки те, що
// пройшло через order_registry). З цієї повної історії рахуємо реальні метрики — включно
// з тим, чи БУВ застосунок першим каналом комунікації (найперше за датою замовлення юзера
// має app=1 або app=2).

const BACKEND_URL = "https://eclub.com.ua/input.php";
const DMNKEY = process.env.BACKEND_DMNKEY || "FTP3\"O?m9)r6Ufrcg[L;9URn(2-3I$+tL£n!l<r.DfJ[LM";
const CONCURRENCY = 8; // паралельних запитів до бекенду одночасно — не заваливаємо його

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function fetchUserOrdersByOid(oid: string): Promise<any[]> {
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
  const raw = await res.json();
  return Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
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
  const { dateFrom, dateTo, statusFilter } = req.body ?? {};
  const hasRange = typeof dateFrom === "string" && dateFrom.length > 0 || typeof dateTo === "string" && dateTo.length > 0;
  const status: "all" | "paid" | "unpaid" | "cancelled" = ["paid", "unpaid", "cancelled"].includes(statusFilter) ? statusFilter : "all";

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
  function matchesStatus(o: any): boolean {
    if (status === "all") return true;
    const n = Number(o?.status);
    if (status === "cancelled") return n === 0;
    if (status === "paid") return n === 2 || n === 3;
    return n !== 0 && n !== 2 && n !== 3; // unpaid
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

    const userIds = Array.from(userIdToOid.keys());
    const results: { userId: string; orders: any[] }[] = [];

    // Обробляємо пачками по CONCURRENCY, щоб не заваливати бекенд усіма запитами одразу.
    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      const batch = userIds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (uid) => {
          try {
            const orders = await fetchUserOrdersByOid(userIdToOid.get(uid)!);
            return { userId: uid, orders };
          } catch {
            return { userId: uid, orders: [] };
          }
        })
      );
      results.push(...batchResults);
    }

    let totalTickets = 0;
    let appOrders = 0;
    let androidOrders = 0;
    let iphoneOrders = 0;
    let usersFirstFromApp = 0;
    let usersWithNoData = 0;
    let usersInRange = 0;
    let existingUsersNowUsingApp = 0; // раніше купували НЕ через додаток, у цьому періоді — купують і через нього

    for (const { orders } of results) {
      if (orders.length === 0) { usersWithNoData++; continue; }
      const ordersInRange = orders.filter((o) => inRange(o) && matchesStatus(o));
      if (ordersInRange.length === 0) continue; // юзер активний, але не в цьому діапазоні/статусі
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
      androidOrders,
      iphoneOrders,
      usersFirstFromApp,
      existingUsersNowUsingApp,
      generatedAt: new Date().toISOString(),
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      statusFilter: status,
    });
  } catch (err) {
    console.error("channel-report error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
