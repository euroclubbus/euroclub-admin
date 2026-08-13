import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ПЕРЕРОБЛЕНО (13.08, Кеп): раніше ця функція сама читала device_tokens і слала через
// Firebase Admin SDK (messaging.sendEachForMulticast) — це вміє ТІЛЬКИ Android (FCM),
// iOS-токени сирі (APNs), Admin SDK їх не приймає. Через це push на iOS взагалі не долітав
// — ні масові розсилки, ні відповіді у "Вхідні". Той самий Cloudflare Worker
// (euroclub-push-sender), яким користується сам застосунок для власних потреб, УЖЕ вміє
// обидві платформи правильно (читає ту саму підколекцію device_tokens/{uid}/devices/*,
// шле FCM для Android і напряму APNs для iOS). Тепер адмінка НЕ дублює цю логіку —
// просто передає запит Worker'у. Єдине джерело правди для "як слати push" — Worker,
// не два окремі місця, які можуть розійтися (як і сталося).

const PUSH_WORKER_URL = "https://euroclub-push-sender.eclubbus21.workers.dev/send";

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

  const { title, body, deepLink, userIds } = req.body ?? {};

  if (typeof title !== "string" || !title.trim() || typeof body !== "string" || !body.trim()) {
    res.status(400).json({ error: "Потрібні поля title і body" });
    return;
  }
  if (userIds !== undefined && !Array.isArray(userIds)) {
    res.status(400).json({ error: "userIds має бути масивом" });
    return;
  }

  const apiSecret = process.env.PUSH_WORKER_API_SECRET;
  if (!apiSecret) {
    res.status(500).json({ error: "PUSH_WORKER_API_SECRET не задано в env-змінних Vercel" });
    return;
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    // userIds не задано (або порожній) — розсилка ВСІМ: Worker вимагає явний список
    // user_ids (не має режиму "broadcast"), тому тут збираємо id ВСІХ документів
    // device_tokens (id документа = userId, самі токени Worker дістане сам зі своєї
    // підколекції /devices/). userIds задано — цільова розсилка (сегмент/Вхідні).
    let targetUserIds: string[];
    if (Array.isArray(userIds) && userIds.length > 0) {
      targetUserIds = userIds.map(String);
    } else {
      const snap = await db.collection("device_tokens").listDocuments();
      targetUserIds = snap.map((d) => d.id);
    }

    const targetCount = targetUserIds.length;
    let successCount = 0;
    let status: "sent" | "partial" | "failed" = "failed";

    if (targetCount > 0) {
      const workerRes = await fetch(PUSH_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiSecret },
        body: JSON.stringify({
          user_ids: targetUserIds,
          title: title.trim(),
          body: body.trim(),
          data: deepLink ? { deepLink: String(deepLink) } : undefined,
        }),
      });
      const workerData: any = await workerRes.json();
      const results: any[] = Array.isArray(workerData?.results) ? workerData.results : [];
      successCount = results.filter((r) => r.success).length;
      status = successCount === targetCount ? "sent" : successCount > 0 ? "partial" : "failed";
    }

    const silent = req.body?.silent === true; // відповіді у Вхідних не засмічують історію розсилок
    if (!silent) {
      await db.collection("push_campaigns").add({
        title: title.trim(),
        body: body.trim(),
        deepLink: deepLink ? String(deepLink) : null,
        sentAt: Date.now(),
        targetCount,
        successCount,
        status,
        segment: Array.isArray(userIds) && userIds.length > 0 ? userIds.length : null, // null = всім
      });
    }

    res.status(200).json({ targetCount, successCount, status });
  } catch (err) {
    console.error("send-push error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
