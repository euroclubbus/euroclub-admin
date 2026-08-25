import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ПЕРЕРОБЛЕНО (25.08, Кеп): прогер дав справжній адмін-метод — oid2user-orders. Будь-який
// oid → повна історія юзера, адмінським ключем, без sessionKey/user_sessions взагалі. Це
// повністю замінює попередній підхід (10-18.08, Варіант C) — той був обхідним рішенням,
// поки такого методу не було. Дедуплікація тепер по userId (якщо вже відомий із
// попереднього синку) — один запит на юзера, незалежно від кількості його замовлень у
// вибірці. Якщо userId ще невідомий для якогось orderNo — той оброблюється як окрема
// група (сам собі pivot, метод працює для будь-якого oid однаково).

const BACKEND_URL = "https://eclub.com.ua/input.php";
const DMNKEY = process.env.BACKEND_DMNKEY || "\"O?m9)r6Ufrcg[L;9URn(2-3I$+tL£n!l<r.DfJ[LM";

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

    // Групуємо по userId (якщо вже відомий) — так дедуплікуємо запити для юзерів із
    // кількома замовленнями у вибірці. Невідомий userId → окрема група (сам собі pivot).
    const groups = new Map<string, string[]>(); // key: userId АБО "solo:{orderNo}" -> [orderNo,...]
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { backendUserId?: string; userId?: string };
      const userId = data.backendUserId ?? data.userId;
      const key = userId ? `uid:${userId}` : `solo:${snap.id}`;
      const arr = groups.get(key) ?? [];
      arr.push(snap.id);
      groups.set(key, arr);
    }

    let updated = 0;
    let notFoundInBackend = 0;
    let writeBatch = db.batch();
    let batchCount = 0;
    const backendCallsMade = groups.size;

    for (const orderNosInGroup of groups.values()) {
      const pivotOid = orderNosInGroup[0];
      let list: any[] = [];
      try {
        list = await fetchUserOrdersByOid(pivotOid);
      } catch {
        continue; // мережева помилка — пропускаємо цю групу, решта продовжує
      }
      const byOid = new Map<string, any>();
      for (const o of list) byOid.set(String(o.oid ?? o.hash), o);

      for (const orderNo of orderNosInGroup) {
        const found = byOid.get(orderNo);
        if (!found) { notFoundInBackend++; continue; }
        const ref = db.collection("order_registry").doc(orderNo);
        writeBatch.set(ref, {
          backendStatus: found.status ?? null,
          backendPaidUah: Number(found.paid_uah) || 0,
          backendPaidEur: Number(found.paid_eur) || 0,
          backendSyncedAt: new Date().toISOString(),
          ...(found.app !== undefined && found.app !== null && found.app !== "" ? { backendAppPlatform: String(found.app) } : {}),
          ...(found.user_id !== undefined && found.user_id !== null && found.user_id !== "" ? { backendUserId: String(found.user_id) } : {}),
        }, { merge: true });
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
      backendCallsMade,
      updated,
      notFoundInBackend,
    });
  } catch (err) {
    console.error("bulk-refresh error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
