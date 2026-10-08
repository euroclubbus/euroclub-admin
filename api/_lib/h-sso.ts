import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb, signSession, AdminSession, readSession } from "./session.js";

// Кеп (08.10): вхід менеджера за посиланням із системи (бекенд EuroClub шле POST).
// Поля: name, id, access, time, sign = HMAC-SHA256(name|id|access|time, ключ) у hex.
// Ключ — у server_secrets/sso (задає власник у Налаштуваннях) або env SSO_SECRET.
async function secret(): Promise<string> {
  if (process.env.SSO_SECRET) return process.env.SSO_SECRET;
  const d = await adminDb().collection("server_secrets").doc("sso").get();
  return String(d.get("key") || "");
}
function page(res: VercelResponse, status: number, html: string) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8").send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#111;color:#eee;font-family:sans-serif;padding:40px">${html}</body>`
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ключ входу: GET — чи задано, POST — зберегти (тільки власник).
  if (req.query.key === "1") {
    const s = readSession(req);
    if (!s || s.role !== "owner") return res.status(403).json({ error: "Тільки для власника" });
    const ref = adminDb().collection("server_secrets").doc("sso");
    if (req.method === "POST") {
      const key = String(req.body?.key || "");
      if (!key) return res.status(400).json({ error: "Порожній ключ" });
      await ref.set({ key, updatedAt: Date.now() });
      return res.status(200).json({ ok: true });
    }
    const d = await ref.get();
    return res.status(200).json({ set: !!d.get("key") || !!process.env.SSO_SECRET, fromEnv: !!process.env.SSO_SECRET });
  }

  if (req.method !== "POST") return page(res, 405, "Вхід можливий лише за посиланням із системи EuroClub.");
  const b = (req.body || {}) as Record<string, string>;
  const name = String(b.name ?? ""), id = String(b.id ?? ""), access = String(b.access ?? ""), time = String(b.time ?? ""), sign = String(b.sign ?? "").toLowerCase();
  if (!id || !sign) return page(res, 400, "Неповні дані входу.");
  const key = await secret();
  if (!key) return page(res, 500, "Ключ входу ще не налаштовано в адмінці.");

  // Кеп (08.10): пробуємо варіанти ключа (буквальне "\\n" або справжній перенос рядка, пробіли по краях),
  // бо в PHP рядок в одинарних лапках не перетворює \n — щоб розбіжність у копіюванні не блокувала вхід.
  const payload = time ? `${name}|${id}|${access}|${time}` : `${name}|${id}|${access}`;
  const keys = Array.from(new Set([key, key.trim(), key.replace(/\\n/g, "\n"), key.replace(/\n/g, "\\n")]));
  const ok = keys.some((k) => {
    const expected = crypto.createHmac("sha256", k).update(payload, "utf8").digest("hex");
    return sign.length === expected.length && crypto.timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
  });
  if (!ok) {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    return page(res, 403, `Невірний підпис входу.<pre style="color:#aaa;font-size:12px;margin-top:20px">Діагностика (покажіть розробнику):
name: "${esc(name)}" (${Buffer.byteLength(name)} байт)
id: "${esc(id)}"
access: "${esc(access)}"
time: "${esc(time)}" (зараз ${Math.floor(Date.now() / 1000)})
рядок підпису: "${esc(payload)}"
sign отримано: ${esc(sign)}
довжина ключа в адмінці: ${key.length} символів
content-type: ${esc(String(req.headers["content-type"] || ""))}</pre>`);
  }
  if (time && Math.abs(Date.now() / 1000 - Number(time)) > 300) return page(res, 403, "Посилання застаріло — відкрийте його із системи ще раз.");

  const ref = adminDb().collection("admin_users").doc(`m_${id}`);
  const snap = await ref.get();
  const prev = snap.data() || {};
  if (snap.exists && prev.active === false) return page(res, 403, "Ваш доступ до адмінки вимкнено.");
  await ref.set({
    name: prev.nameCustom ? prev.name : name || prev.name || `Менеджер ${id}`,
    login: id, managerId: id, access, role: "manager",
    active: true, canBypass: !!prev.canBypass, createdAt: prev.createdAt || Date.now(), lastLoginAt: Date.now(), via: "sso",
  }, { merge: true });
  const fresh = (await ref.get()).data()!;
  const s: AdminSession = { id: ref.id, name: fresh.name, role: "manager", canBypass: !!fresh.canBypass, tabs: Array.isArray(fresh.tabs) ? fresh.tabs : undefined };
  const token = signSession(s);
  // Кеп (08.10): перехід на ІНШУ адресу (?sso=1), інакше браузер міняє лише #хеш на цій
  // сторінці без перезавантаження і «Вхід…» висить.
  return page(res, 200, `<style>@keyframes s{to{transform:rotate(360deg)}}</style>
<div style="display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:20vh">
<div style="width:42px;height:42px;border:4px solid #333;border-top-color:#F5A623;border-radius:50%;animation:s .8s linear infinite"></div>
<div>Вхід в адмінку EuroClub…</div></div>
<script>location.replace('/?sso=1#sso=' + encodeURIComponent(${JSON.stringify(token)}));</script>`);
}
