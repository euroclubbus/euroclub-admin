import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ПЕРЕРОБЛЕНО (25.08, Кеп): прогер дав справжній адмін-метод — oid2user-orders. Приймає
// БУДЬ-ЯКИЙ oid і повертає ПОВНУ історію замовлень того юзера, з адмінським ключем
// (dmnkey), без жодної прив'язки до сесії/uidkey конкретного юзера. Це повністю замінює
// попередній підхід через sessionKey/user_sessions (Варіант C, 10-18.08) — той був
// обхідним рішенням, поки такого методу не було. Тепер working ОДРАЗУ для БУДЬ-ЯКОГО
// замовлення в реєстрі, незалежно від того, заходив юзер у застосунок чи ні.

const BACKEND_URL = "https://eclub.com.ua/input.php";
const DMNKEY = process.env.BACKEND_DMNKEY || "\"O?m9)r6Ufrcg[L;9URn(2-3I$+tL£n!l<r.DfJ[LM";

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function fetchUserOrdersByOid(oid: string): Promise<{ list: any[]; raw: string; httpStatus: number }> {
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
  const list = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
  return { list, raw: rawText, httpStatus: res.status };
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

    const { list, raw, httpStatus } = await fetchUserOrdersByOid(orderNo);
    const found = list.find((o: any) => String(o.oid ?? o.hash) === orderNo);

    if (!found) {
      res.status(404).json({ error: `Бекенд не повернув це замовлення. HTTP ${httpStatus}, сира відповідь: ${raw.slice(0, 500)}` });
      return;
    }

    await ref.set({
      backendStatus: found.status ?? null,
      backendPaidUah: Number(found.paid_uah) || 0,
      backendPaidEur: Number(found.paid_eur) || 0,
      backendSyncedAt: new Date().toISOString(),
      ...(found.app !== undefined && found.app !== null && found.app !== "" ? { backendAppPlatform: String(found.app) } : {}),
      ...(found.user_id !== undefined && found.user_id !== null && found.user_id !== "" ? { backendUserId: String(found.user_id) } : {}),
    }, { merge: true });

    res.status(200).json({ ok: true, status: found.status ?? null });
  } catch (err) {
    console.error("refresh-order error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
