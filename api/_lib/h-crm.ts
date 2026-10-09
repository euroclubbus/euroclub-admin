import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { adminDb, readSession } from "./session.js";

// Кеп (09.10): CRM пасажирів — дані живуть у Google-таблиці (не в базі).
// Доступ — сервісним акаунтом Firebase (FIREBASE_SERVICE_ACCOUNT); таблицю треба
// поділити з його email (права «Редактор»). Колонки мапляться за назвою в 1-му рядку,
// тож їх можна вільно переставляти і в таблиці, і в адмінці.

export const CRM_COLUMNS = [
  "ID", "Номер замовлення", "Прізвище ім'я", "Телефон", "Місто 1", "Місто 2", "Джерело", "Дата",
  "Частота поїздок на рік", "Остання поїздка", "Запланована поїздка", "Передача",
  "Дата і час дзвінка", "Акція", "Нагадування", "Коментар", "Статус",
];

function sa() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано");
  return JSON.parse(raw) as { client_email: string; private_key: string };
}

let cached: { token: string; exp: number } | null = null;
async function gToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const { client_email, private_key } = sa();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`,
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error("Google auth: " + (d.error_description || d.error || r.status));
  cached = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cached.token;
}

async function g(path: string, init: { method?: string; body?: unknown } = {}) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    method: init.method || "GET",
    headers: { Authorization: `Bearer ${await gToken()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.error?.message || `HTTP ${r.status}`;
    if (r.status === 403 || r.status === 404) throw new Error(`Немає доступу до таблиці — поділіться нею з ${sa().client_email} (Редактор) і увімкніть Google Sheets API. (${msg})`);
    throw new Error(msg);
  }
  return d;
}

const colLetter = (n: number) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

async function sheetInfo(id: string) {
  const meta = await g(`${id}?fields=sheets.properties`);
  const p = meta.sheets[0].properties;
  return { title: p.title as string, gid: p.sheetId as number };
}

async function header(id: string, title: string): Promise<string[]> {
  const d = await g(`${id}/values/${encodeURIComponent(`'${title}'!1:1`)}`);
  let h: string[] = (d.values?.[0] || []).map((x: string) => String(x).trim());
  const missing = CRM_COLUMNS.filter((c) => !h.includes(c));
  if (missing.length) {
    h = [...h, ...missing];
    await g(`${id}/values/${encodeURIComponent(`'${title}'!1:1`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [h] } });
  }
  return h;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Увійдіть в адмінку" });
  const op = String(req.query.op || "");
  const cfgRef = adminDb().collection("settings").doc("crm");
  try {
    if (op === "info") {
      const c = (await cfgRef.get()).data() || {};
      return res.status(200).json({ email: sa().client_email, sheetId: c.sheetId || "", order: c.order || null });
    }
    if (op === "config") {
      if (s.role !== "owner") return res.status(403).json({ error: "Тільки для власника" });
      const m = String(req.body?.sheetId || "").match(/[-\w]{25,}/);
      if (!m) return res.status(400).json({ error: "Вставте посилання на Google-таблицю" });
      const { title } = await sheetInfo(m[0]);
      await header(m[0], title);
      await cfgRef.set({ sheetId: m[0] }, { merge: true });
      return res.status(200).json({ ok: true, sheetId: m[0] });
    }
    if (op === "order") {
      if (!Array.isArray(req.body?.order)) return res.status(400).json({ error: "order" });
      await cfgRef.set({ order: req.body.order.map(String) }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    const id = String((await cfgRef.get()).data()?.sheetId || "");
    if (!id) return res.status(400).json({ error: "Таблицю ще не підключено" });
    const { title, gid } = await sheetInfo(id);
    const h = await header(id, title);

    if (op === "list") {
      const d = await g(`${id}/values/${encodeURIComponent(`'${title}'!A2:${colLetter(h.length - 1)}`)}`);
      const rows = (d.values || []).map((v: string[], i: number) => {
        const o: Record<string, string | number> = { _row: i + 2 };
        h.forEach((k, j) => { o[k] = v[j] ?? ""; });
        return o;
      }).filter((o: any) => h.some((k) => String(o[k] || "").trim()));
      return res.status(200).json({ columns: h, rows });
    }
    if (op === "save") {
      const data = (req.body?.data || {}) as Record<string, string>;
      const row = Number(req.body?.row || 0);
      if (!row && !data["ID"]) data["ID"] = Date.now().toString(36).toUpperCase();
      if (row) {
        const cur = await g(`${id}/values/${encodeURIComponent(`'${title}'!A${row}:${colLetter(h.length - 1)}${row}`)}`);
        const old = cur.values?.[0] || [];
        const vals = h.map((k, j) => (k in data ? String(data[k] ?? "") : old[j] ?? ""));
        await g(`${id}/values/${encodeURIComponent(`'${title}'!A${row}`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [vals] } });
      } else {
        const vals = h.map((k) => String(data[k] ?? ""));
        await g(`${id}/values/${encodeURIComponent(`'${title}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values: [vals] } });
      }
      return res.status(200).json({ ok: true });
    }
    if (op === "delete") {
      const row = Number(req.body?.row || 0);
      if (row < 2) return res.status(400).json({ error: "row" });
      await g(`${id}:batchUpdate`, { method: "POST", body: { requests: [{ deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] } });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "op" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Помилка" });
  }
}
