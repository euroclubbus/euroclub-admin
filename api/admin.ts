import type { VercelRequest, VercelResponse } from "@vercel/node";
import login from "./_lib/h-login.js";
import users from "./_lib/h-users.js";
import clientsSync from "./_lib/h-clients-sync.js";
import pushStats from "./_lib/h-push-stats.js";
import sso from "./_lib/h-sso.js";
import profile from "./_lib/h-profile.js";
import whoami from "./_lib/h-whoami.js";

// Один роутер замість трьох функцій — ліміт Vercel Hobby 12 serverless-функцій.
// ?action=login | users | clients-sync
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || "");
  if (action === "login") return login(req, res);
  if (action === "users") return users(req, res);
  if (action === "clients-sync") return clientsSync(req, res);
  if (action === "push-stats") return pushStats(req, res);
  if (action === "sso") return sso(req, res);
  if (action === "profile") return profile(req, res);
  if (action === "whoami") return whoami(req, res);
  return res.status(404).json({ error: "Невідома дія" });
}
