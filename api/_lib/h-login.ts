import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, checkPassword, findUserByPassword, ownerPassword, signSession, AdminSession } from "./session.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не підтримується" });
  const login = String(req.body?.login || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ error: "Введіть пароль" });

  try {
    // Без логіна — вхід власника старим паролем адмінки.
    // Кеп (08.10): вхід лише паролем — пароль власника або пароль менеджера (паролі унікальні).
    if (!login) {
      if (ownerPassword() && password === ownerPassword()) {
        const s: AdminSession = { id: "owner", name: "Власник", role: "owner", canBypass: true };
        return res.status(200).json({ token: signSession(s), user: s });
      }
      const doc = await findUserByPassword(password);
      const u = doc?.data();
      if (!doc || !u || u.active === false) return res.status(401).json({ error: "Невірний пароль" });
      const s: AdminSession = { id: doc.id, name: u.name, role: u.role === "admin" ? "admin" : "manager", canBypass: u.role === "admin" || !!u.canBypass, tabs: Array.isArray(u.tabs) ? u.tabs : undefined };
      await doc.ref.update({ lastLoginAt: Date.now() });
      return res.status(200).json({ token: signSession(s), user: s });
    }
    const snap = await adminDb().collection("admin_users").where("login", "==", login).limit(1).get();
    const doc = snap.docs[0];
    const u = doc?.data();
    if (doc && u && !u.hash) return res.status(401).json({ error: "Пароль ще не встановлено — увійдіть за посиланням із системи і задайте його в «Профілі»" });
    if (!doc || !u || u.active === false || !checkPassword(password, u.salt, u.hash)) {
      return res.status(401).json({ error: "Невірний логін або пароль" });
    }
    const s: AdminSession = { id: doc.id, name: u.name, role: u.role === "admin" ? "admin" : "manager", canBypass: u.role === "admin" || !!u.canBypass, tabs: Array.isArray(u.tabs) ? u.tabs : undefined };
    await doc.ref.update({ lastLoginAt: Date.now() });
    return res.status(200).json({ token: signSession(s), user: s });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Помилка входу" });
  }
}
