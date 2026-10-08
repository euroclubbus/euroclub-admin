import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, findUserByPassword, hashPassword, ownerPassword, readSession } from "./session.js";

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
        return { id: d.id, name: u.name, login: u.login, role: u.role === "admin" ? "admin" : "manager", managerId: u.managerId || "", tabs: Array.isArray(u.tabs) ? u.tabs : null, canBypass: !!u.canBypass, active: u.active !== false, createdAt: u.createdAt || 0, lastLoginAt: u.lastLoginAt || 0 };
      });
      return res.status(200).json({ users });
    }
    if (req.method === "POST") {
      const { id, name, login, password, canBypass, active, role, managerId, tabs } = req.body ?? {};
      const data: Record<string, unknown> = {};
      if (typeof name === "string") data.name = name.trim();
      if (typeof login === "string") data.login = login.trim().toLowerCase();
      if (typeof canBypass === "boolean") data.canBypass = canBypass;
      if (typeof active === "boolean") data.active = active;
      if (Array.isArray(tabs)) data.tabs = tabs.map(String);
      if (typeof managerId === "string") data.managerId = managerId.trim();
      if (role === "admin" || role === "manager") data.role = role;
      if (typeof password === "string" && password) {
        if (password.length < 4) return res.status(400).json({ error: "Пароль мінімум 4 символи" });
        if (password === ownerPassword() || (await findUserByPassword(password, id ? String(id) : undefined))) return res.status(400).json({ error: "Такий пароль уже зайнятий — оберіть інший" });
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
      if (!data.login) data.login = `u${Date.now().toString(36)}`; // логін не обов'язковий — вхід паролем
      if (!data.name || !data.hash) return res.status(400).json({ error: "Потрібні ім'я і пароль" });
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
