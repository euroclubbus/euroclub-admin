import type { VercelRequest, VercelResponse } from "@vercel/node";
import login from "./_lib/h-login.js";
import users from "./_lib/h-users.js";
import clientsSync from "./_lib/h-clients-sync.js";
import pushStats from "./_lib/h-push-stats.js";

// Один роутер замість трьох функцій — ліміт Vercel Hobby 12 serverless-функцій.
// ?action=login | users | clients-sync
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || "");
  if (action === "login") return login(req, res);
  if (action === "users") return users(req, res);
  if (action === "clients-sync") return clientsSync(req, res);
  if (action === "push-stats") return pushStats(req, res);
  return res.status(404).json({ error: "Невідома дія" });
}
