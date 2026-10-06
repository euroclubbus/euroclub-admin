import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, hashPassword, readSession } from "./_lib/session.js";

// Керування менеджерами — тільки власник. Паролі зберігаються лише як scrypt-хеш.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req);
  if (!s || s.role !== "owner") return res.status(403).json({ error: "Тільки для власника" });
  const col = adminDb().collection("admin_users");

  try {
    if (req.method === "GET") {
      const snap = await col.get();
      const users = snap.docs.map((d) => {
        const u = d.data();
        return { id: d.id, name: u.name, login: u.login, canBypass: !!u.canBypass, active: u.active !== false, createdAt: u.createdAt || 0, lastLoginAt: u.lastLoginAt || 0 };
      });
      return res.status(200).json({ users });
    }
    if (req.method === "POST") {
      const { id, name, login, password, canBypass, active } = req.body ?? {};
      const data: Record<string, unknown> = {};
      if (typeof name === "string") data.name = name.trim();
      if (typeof login === "string") data.login = login.trim().toLowerCase();
      if (typeof canBypass === "boolean") data.canBypass = canBypass;
      if (typeof active === "boolean") data.active = active;
      if (typeof password === "string" && password) {
        if (password.length < 6) return res.status(400).json({ error: "Пароль мінімум 6 символів" });
        Object.assign(data, hashPassword(password));
      }
      if (data.login) {
        const dup = await col.where("login", "==", data.login).get();
        if (dup.docs.some((d) => d.id !== id)) return res.status(400).json({ error: "Такий логін уже існує" });
      }
      if (id) {
        await col.doc(String(id)).update(data);
        return res.status(200).json({ ok: true, id });
      }
      if (!data.name || !data.login || !data.hash) return res.status(400).json({ error: "Потрібні ім'я, логін і пароль" });
      const ref = await col.add({ canBypass: false, active: true, ...data, createdAt: Date.now() });
      return res.status(200).json({ ok: true, id: ref.id });
    }
    if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (!id) return res.status(400).json({ error: "Потрібен id" });
      await col.doc(id).delete();
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Метод не підтримується" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Помилка" });
  }
}
