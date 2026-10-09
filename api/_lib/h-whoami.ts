import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, readSession } from "./session.js";

// Кеп (09.10): перевірка сесії адмінки для ecrm (автовхід у Support Center без логіна/пароля).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Unauthorized" });
  let managerId = "";
  if (s.id !== "owner") {
    const d = (await adminDb().collection("admin_users").doc(s.id).get()).data();
    if (!d || d.active === false) return res.status(401).json({ error: "Unauthorized" });
    managerId = String(d.managerId || "");
  }
  return res.status(200).json({ id: s.id, name: s.name, role: s.role, managerId });
}
