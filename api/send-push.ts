import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Service account береться з env-змінної FIREBASE_SERVICE_ACCOUNT (JSON-рядок
// повністю, як він є у ключі, завантаженому з Firebase Console -> Project
// Settings -> Service Accounts -> Generate new private key).
// Ставиться в Vercel: Settings -> Environment Variables.
function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
  }
  const serviceAccount = JSON.parse(raw);

  return initializeApp({
    credential: cert(serviceAccount),
  });
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

  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    const messaging = getMessaging(app);

    // userIds не задано (або порожній масив із явним прапорцем all) — розсилка всім,
    // як і раніше. userIds задано — цільова розсилка лише цим користувачам
    // (сегмент зі звіту, або відповідь у Вхідних одному конкретному id).
    let tokens: string[];
    if (Array.isArray(userIds) && userIds.length > 0) {
      const docs = await Promise.all(userIds.map((uid: string) => db.collection("device_tokens").doc(String(uid)).get()));
      tokens = docs.map((d) => (d.data() as { token?: string } | undefined)?.token).filter((t): t is string => Boolean(t));
    } else {
      const tokensSnap = await db.collection("device_tokens").get();
      tokens = tokensSnap.docs.map((d) => (d.data() as { token?: string }).token).filter((t): t is string => Boolean(t));
    }

    const targetCount = tokens.length;
    let successCount = 0;
    let status: "sent" | "partial" | "failed" = "failed";

    if (targetCount > 0) {
      // sendEachForMulticast приймає максимум 500 токенів за раз.
      const chunks: string[][] = [];
      for (let i = 0; i < tokens.length; i += 500) {
        chunks.push(tokens.slice(i, i + 500));
      }

      for (const chunk of chunks) {
        const result = await messaging.sendEachForMulticast({
          tokens: chunk,
          notification: { title: title.trim(), body: body.trim() },
          data: deepLink ? { deepLink: String(deepLink) } : undefined,
        });
        successCount += result.successCount;
      }

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
