import crypto from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Кеп (06.10): акаунти менеджерів. Власник входить старим паролем адмінки (без логіна),
// менеджери — логін+пароль із колекції admin_users (тільки сервер, хеш scrypt).
// Сесія — підписаний HMAC токен (живе в пам'яті вкладки адмінки, як і раніше пароль).

export interface AdminSession {
  id: string; // "owner" або id документа admin_users
  name: string;
  role: "owner" | "manager";
  canBypass: boolean; // право обходити автоматичну модерацію розсилок
}

export function adminDb() {
  const app = getApps().length
    ? getApps()[0]
    : (() => {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано");
        return initializeApp({ credential: cert(JSON.parse(raw)) });
      })();
  return getFirestore(app);
}

export function ownerPassword(): string {
  return process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || "";
}

function secret(): string {
  return "eclub-session:" + ownerPassword();
}

const TTL_MS = 1000 * 60 * 60 * 24; // 24 год

export function signSession(s: AdminSession): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readSession(req: VercelRequest): AdminSession | null {
  const raw = String(req.headers["x-admin-session"] || "");
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return { id: data.id, name: data.name, role: data.role, canBypass: !!data.canBypass };
  } catch {
    return null;
  }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

export function checkPassword(password: string, salt: string, hash: string): boolean {
  const h = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

// Кеп (08.10): вхід лише паролем — шукаємо активного користувача, чий пароль збігається.
export async function findUserByPassword(password: string, exceptId?: string) {
  const snap = await adminDb().collection("admin_users").get();
  return snap.docs.find((d) => {
    const u = d.data();
    return d.id !== exceptId && u.hash && u.salt && checkPassword(password, u.salt, u.hash);
  }) || null;
}
