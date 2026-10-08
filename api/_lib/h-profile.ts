import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, findUserByPassword, hashPassword, ownerPassword, readSession, signSession } from "./session.js";

// Кеп (08.10): профіль користувача адмінки — ім'я і свій пароль (логін = id менеджера).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Увійдіть ще раз" });
  if (s.role === "owner") return res.status(400).json({ error: "Пароль власника задається в налаштуваннях Vercel" });
  const ref = adminDb().collection("admin_users").doc(s.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Акаунт не знайдено" });
  if (req.method === "GET") {
    const u = snap.data()!;
    return res.status(200).json({ name: u.name, login: u.login, hasPassword: !!u.hash, managerId: u.managerId || null });
  }
  if (req.method !== "POST") return res.status(405).end();
  const { name, password } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) { patch.name = name.trim(); patch.nameCustom = true; }
  if (typeof password === "string" && password) {
    if (password.length < 4) return res.status(400).json({ error: "Пароль мінімум 4 символи" });
        if (password === ownerPassword() || (await findUserByPassword(password, s.id))) return res.status(400).json({ error: "Такий пароль уже зайнятий — оберіть інший" });
    Object.assign(patch, hashPassword(password));
  }
  await ref.update(patch);
  const u = (await ref.get()).data()!;
  const ns = { ...s, name: u.name, tabs: Array.isArray(u.tabs) ? u.tabs : undefined };
  return res.status(200).json({ ok: true, token: signSession(ns), user: ns });
}
