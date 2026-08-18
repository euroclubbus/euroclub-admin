import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Масове "Оновити" для відфільтрованого списку (Кеп, 17.08): замовлень стане багато, і
// по одному через api/refresh-order.ts — це забагато запитів на бекенд. Тут — та сама
// ідея (sessionKey з order_registry → один запит user-orders на сервері), але з
// ДЕДУПЛІКАЦІЄЮ по sessionKey: якщо той самий юзер зробив 5 замовлень з обраного діапазону
// — це ОДИН запит до бекенду (user-orders повертає всю його історію одразу), а не 5.
// Ініціюється вручну з адмінки, для конкретного відфільтрованого діапазону (дата/маршрут/
// статус) — НЕ автоматично й НЕ для всього реєстру одразу.

const WORKER = "https://curly-voice-8a71.eclubbus21.workers.dev";

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function fetchUserOrders(sessionKey: string): Promise<any[]> {
  const body = new URLSearchParams({
    work: "work",
    app: "1",
    lng: "uk",
    uidkey: sessionKey,
    mod: "apimobile",
    opr: "user-orders",
    _ts: String(Date.now()),
  });
  const res = await fetch(`${WORKER}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const raw = await res.json();
  return Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Метод не підтримується" });
    return;
  }

  const { orderNos } = req.body ?? {};
  if (!Array.isArray(orderNos) || orderNos.length === 0) {
    res.status(400).json({ error: "Потрібен непорожній масив orderNos" });
    return;
  }
  if (orderNos.length > 500) {
    res.status(400).json({ error: "Забагато замовлень за раз (макс. 500) — звузьте фільтр" });
    return;
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    const refs = orderNos.map((oid: string) => db.collection("order_registry").doc(oid));
    const snaps = await db.getAll(...refs);

    // Кеп (18.08): якщо в самого замовлення немає sessionKey — пробуємо "живий" ключ цього
    // ж юзера з user_sessions/{userId} (записується там щоразу, коли юзер щось відкриває
    // в застосунку — не лише при бронюванні). Це і закриває проблему "160 старих замовлень
    // без sessionKey" — досить, щоб той юзер БУДЬ-КОЛИ відкрив застосунок останнім часом.
    type OrderInfo = { orderNo: string; ownSessionKey?: string; userId?: string };
    const orderInfos: OrderInfo[] = [];
    const userIdsNeedingLookup = new Set<string>();
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { sessionKey?: string; backendUserId?: string; userId?: string };
      const userId = data.backendUserId ?? data.userId;
      orderInfos.push({ orderNo: snap.id, ownSessionKey: data.sessionKey, userId });
      if (!data.sessionKey && userId) userIdsNeedingLookup.add(userId);
    }

    const userSessionMap = new Map<string, string>(); // userId -> sessionKey
    if (userIdsNeedingLookup.size > 0) {
      const userIds = Array.from(userIdsNeedingLookup);
      const userRefs = userIds.map((uid) => db.collection("user_sessions").doc(uid));
      const userSnaps = await db.getAll(...userRefs);
      userSnaps.forEach((s, i) => {
        if (s.exists) {
          const sk = (s.data() as { sessionKey?: string })?.sessionKey;
          if (sk) userSessionMap.set(userIds[i], sk);
        }
      });
    }

    // Групуємо за ЕФЕКТИВНИМ sessionKey (власний АБО підхоплений з user_sessions).
    const bySessionKey = new Map<string, string[]>();
    let skippedNoSessionKey = 0;
    let recoveredViaUserSession = 0;
    for (const info of orderInfos) {
      let effectiveKey = info.ownSessionKey;
      if (!effectiveKey && info.userId) {
        effectiveKey = userSessionMap.get(info.userId);
        if (effectiveKey) recoveredViaUserSession++;
      }
      if (!effectiveKey) { skippedNoSessionKey++; continue; }
      const arr = bySessionKey.get(effectiveKey) ?? [];
      arr.push(info.orderNo);
      bySessionKey.set(effectiveKey, arr);
    }

    const uniqueSessionKeys = Array.from(bySessionKey.keys());
    let updated = 0;
    let notFoundInBackend = 0;
    let writeBatch = db.batch();
    let batchCount = 0;

    for (const sessionKey of uniqueSessionKeys) {
      const orderNosForKey = bySessionKey.get(sessionKey)!;
      let list: any[] = [];
      try {
        list = await fetchUserOrders(sessionKey);
      } catch {
        continue; // токен застарів чи мережева помилка — пропускаємо цю групу, решта продовжує
      }
      const byOid = new Map<string, any>();
      for (const o of list) byOid.set(String(o.oid ?? o.hash), o);

      for (const orderNo of orderNosForKey) {
        const found = byOid.get(orderNo);
        if (!found) { notFoundInBackend++; continue; }
        const ref = db.collection("order_registry").doc(orderNo);
        writeBatch.update(ref, {
          backendStatus: found.status ?? null,
          backendPaidUah: Number(found.paid_uah) || 0,
          backendPaidEur: Number(found.paid_eur) || 0,
          backendSyncedAt: new Date().toISOString(),
          ...(found.app !== undefined && found.app !== null && found.app !== "" ? { backendAppPlatform: String(found.app) } : {}),
          ...(found.user_id !== undefined && found.user_id !== null && found.user_id !== "" ? { backendUserId: String(found.user_id) } : {}),
        });
        updated++;
        batchCount++;
        if (batchCount >= 400) {
          await writeBatch.commit();
          writeBatch = db.batch();
          batchCount = 0;
        }
      }
    }
    if (batchCount > 0) await writeBatch.commit();

    res.status(200).json({
      requested: orderNos.length,
      backendCallsMade: uniqueSessionKeys.length,
      updated,
      notFoundInBackend,
      skippedNoSessionKey,
      recoveredViaUserSession,
    });
  } catch (err) {
    console.error("bulk-refresh error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
