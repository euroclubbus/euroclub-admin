import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "crypto";

// Кеп (29.09): спільне для Meta Pixel / Conversions API.
// Кабінети зберігаються в Firestore meta_destinations — ТІЛЬКИ через сервер (правило
// Firestore: read/write false для клієнтів), бо там Access Token-и.

export function db() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT не задано в env-змінних Vercel");
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getFirestore();
}

export const META_EVENTS = ["CompleteRegistration", "Search", "ViewContent", "InitiateCheckout", "AddPaymentInfo", "Purchase"] as const;

export interface Destination {
  id: string;
  name: string;
  pixelId: string;
  accessToken: string;
  enabled: boolean;
  events: string[]; // порожньо = усі
  createdAt?: string;
  updatedAt?: string;
}

export async function listDestinations(): Promise<Destination[]> {
  const snap = await db().collection("meta_destinations").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Destination, "id">) }));
}

export function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
}

export function isAdmin(req: VercelRequest) {
  const expected = process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD;
  return !!expected && req.headers["x-admin-password"] === expected;
}

export const sha256 = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");

export interface CapiInput {
  event: string;
  eventId: string;
  platform: string; // android | ios | pwa
  deviceId?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  data?: {
    value?: number; currency?: string; contentId?: string; searchString?: string;
    numItems?: number; orderId?: string; email?: string; phone?: string;
  };
}

export function buildEvent(i: CapiInput) {
  const d = i.data || {};
  const user_data: Record<string, unknown> = {};
  if (i.deviceId) user_data.external_id = [sha256(i.deviceId)];
  if (i.ip) user_data.client_ip_address = i.ip;
  if (i.userAgent) user_data.client_user_agent = i.userAgent;
  if (d.email) user_data.em = [sha256(d.email)];
  if (d.phone) { const digits = String(d.phone).replace(/\D/g, ""); if (digits) user_data.ph = [sha256(digits)]; }
  const custom_data: Record<string, unknown> = {};
  if (d.currency) custom_data.currency = d.currency;
  if (d.value) custom_data.value = d.value;
  if (d.orderId) custom_data.order_id = d.orderId;
  if (d.contentId) { custom_data.content_ids = [d.contentId]; custom_data.content_type = "product"; }
  if (d.numItems) custom_data.num_items = d.numItems;
  if (d.searchString) custom_data.search_string = d.searchString;
  return {
    event_name: i.event,
    event_time: Math.floor(Date.now() / 1000),
    event_id: i.eventId,
    // Веб — 'website'; покупка з нативного застосунку підтверджена сервером — 'system_generated'.
    action_source: i.platform === "pwa" ? "website" : "system_generated",
    ...(i.platform === "pwa" && i.url ? { event_source_url: i.url } : {}),
    user_data,
    custom_data,
  };
}

export async function sendToPixel(dest: Pick<Destination, "pixelId" | "accessToken">, events: unknown[], testEventCode?: string) {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(dest.pixelId)}/events?access_token=${encodeURIComponent(dest.accessToken)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: events, ...(testEventCode ? { test_event_code: testEventCode } : {}) }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}
