import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "crypto";
import { cors, db, isAdmin } from "./_lib/meta.js";

// Кеп (01.10): показати / перегенерувати ключ x-sync-key для бекенду (лише з паролем адмінки).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!isAdmin(req)) { res.status(401).json({ error: "Невірний пароль адмінки" }); return; }
  const ref = db().collection("server_secrets").doc("profileSync");
  const regenerate = req.method === "POST";
  let key = (await ref.get()).data()?.key as string | undefined;
  if (!key || regenerate) {
    key = randomBytes(24).toString("hex");
    await ref.set({ key, updatedAt: new Date().toISOString() });
  }
  res.status(200).json({ key });
}
