import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, checkPassword, ownerPassword, signSession, AdminSession } from "./_lib/session.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не підтримується" });
  const login = String(req.body?.login || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ error: "Введіть пароль" });

  try {
    // Без логіна — вхід власника старим паролем адмінки.
    if (!login) {
      if (!ownerPassword() || password !== ownerPassword()) return res.status(401).json({ error: "Невірний пароль" });
      const s: AdminSession = { id: "owner", name: "Власник", role: "owner", canBypass: true };
      return res.status(200).json({ token: signSession(s), user: s });
    }
    const snap = await adminDb().collection("admin_users").where("login", "==", login).limit(1).get();
    const doc = snap.docs[0];
    const u = doc?.data();
    if (!doc || !u || u.active === false || !checkPassword(password, u.salt, u.hash)) {
      return res.status(401).json({ error: "Невірний логін або пароль" });
    }
    const s: AdminSession = { id: doc.id, name: u.name, role: "manager", canBypass: !!u.canBypass };
    await doc.ref.update({ lastLoginAt: Date.now() });
    return res.status(200).json({ token: signSession(s), user: s });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Помилка входу" });
  }
}
