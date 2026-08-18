import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// "Оновити" (Кеп, 10.08, Варіант C): бекенд не має адмін-методу для довільного oid без
// сесії юзера — тому при бронюванні застосунок зберігає sessionKey (uidkey) юзера в
// order_registry, а тут, на СЕРВЕРІ (не в браузері адмінки), користуємось цим токеном щоб
// зробити один-єдиний запит "user-orders" — та сама точка, якою й сам застосунок регулярно
// оновлює свої замовлення (useOrderPolling), просто ініційований вручну з адмінки.
//
// Токен НІКОЛИ не повертається в тілі відповіді фронтенду — тільки статус успіху/помилки.

const WORKER = "https://curly-voice-8a71.eclubbus21.workers.dev";

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Метод не підтримується" });
    return;
  }

  const { orderNo } = req.body ?? {};
  if (typeof orderNo !== "string" || !orderNo.trim()) {
    res.status(400).json({ error: "Потрібне поле orderNo" });
    return;
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    const ref = db.collection("order_registry").doc(orderNo);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Замовлення не знайдено в реєстрі" });
      return;
    }
    const sessionKey = (snap.data() as { sessionKey?: string })?.sessionKey;
    let effectiveSessionKey = sessionKey;
    if (!effectiveSessionKey) {
      // Кеп (18.08): фолбек на "живий" ключ юзера з user_sessions/{userId} — записується
      // там щоразу, коли той юзер щось відкриває в застосунку, незалежно від того, чи є
      // sessionKey саме на ЦЬОМУ замовленні (закриває проблему старих замовлень до 11.08).
      const userId = (snap.data() as { backendUserId?: string; userId?: string })?.backendUserId
        ?? (snap.data() as { userId?: string })?.userId;
      if (userId) {
        const userSnap = await db.collection("user_sessions").doc(userId).get();
        if (userSnap.exists) effectiveSessionKey = (userSnap.data() as { sessionKey?: string })?.sessionKey;
      }
    }
    if (!effectiveSessionKey) {
      res.status(400).json({ error: "Немає sessionKey ні на замовленні, ні в user_sessions цього юзера — оновлення недоступне (юзер ще не заходив у застосунок після 18.08)" });
      return;
    }

    const body = new URLSearchParams({
      work: "work",
      app: "1",
      lng: "uk",
      uidkey: effectiveSessionKey,
      mod: "apimobile",
      opr: "user-orders",
      oid: orderNo, // прогер підтвердив (18.08): опційний фільтр — без нього бекенд
      // повертає ВСЮ історію юзера, з ним — лише одне замовлення. Менший payload.
      _ts: String(Date.now()),
    });

    const backendRes = await fetch(`${WORKER}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const raw = await backendRes.json();
    const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
    const found = list.find((o: any) => String(o.oid ?? o.hash) === orderNo);

    if (!found) {
      res.status(404).json({ error: "Бекенд не повернув це замовлення (можливо, токен сесії застарів)" });
      return;
    }

    await ref.update({
      backendStatus: found.status ?? null,
      backendPaidUah: Number(found.paid_uah) || 0,
      backendPaidEur: Number(found.paid_eur) || 0,
      backendSyncedAt: new Date().toISOString(),
      ...(found.app !== undefined && found.app !== null && found.app !== "" ? { backendAppPlatform: String(found.app) } : {}),
      ...(found.user_id !== undefined && found.user_id !== null && found.user_id !== "" ? { backendUserId: String(found.user_id) } : {}),
    });

    res.status(200).json({ ok: true, status: found.status ?? null });
  } catch (err) {
    console.error("refresh-order error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
