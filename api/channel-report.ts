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

    let totalOrders = 0;
    let totalTickets = 0;
    let appOrders = 0;
    let androidOrders = 0;
    let iphoneOrders = 0;
    let usersFirstFromApp = 0;
    let usersWithNoData = 0;

    for (const { orders } of results) {
      if (orders.length === 0) { usersWithNoData++; continue; }
      totalOrders += orders.length;
      for (const o of orders) {
        totalTickets += Array.isArray(o.passengers) ? o.passengers.length : 0;
        const appVal = String(o.app ?? "");
        if (appVal === "1") { appOrders++; androidOrders++; }
        else if (appVal === "2") { appOrders++; iphoneOrders++; }
      }
      const sorted = [...orders].sort((a, b) => parseBackendDate(a.date) - parseBackendDate(b.date));
      const first = sorted[0];
      const firstApp = String(first?.app ?? "");
      if (firstApp === "1" || firstApp === "2") usersFirstFromApp++;
    }

    res.status(200).json({
      totalUsers: userIds.length,
      usersWithNoData,
      totalOrders,
      totalTickets,
      appOrders,
      androidOrders,
      iphoneOrders,
      usersFirstFromApp,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("channel-report error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
