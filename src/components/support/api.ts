// Кеп (06.10): EUROCLUB SUPPORT CENTER — інтерфейс тепер в адмінці, сервер (Neon, вебхуки,
// канали) лишається на ecrm. Токен ecrm зберігається в localStorage цієї вкладки.
export const ECRM = "https://ecrm-fwbs.vercel.app";
const KEY = "ecrm_token";
const USER_KEY = "ecrm_user";

export interface EcrmUser { id: number; login: string; name: string; role: "superadmin" | "admin" | "manager" }

export function getToken(): string {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}
export function getEcrmUser(): EcrmUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
}
export function setAuth(token: string, user: EcrmUser | null) {
  try {
    if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  } catch { /* приватний режим */ }
}

export class AuthError extends Error {}

async function req<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const r = await fetch(ECRM + path, {
    method,
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AuthError(d.error || "Unauthorized");
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d as T;
}
export const apiGet = <T = any>(path: string) => req<T>("GET", path);
export const apiPost = <T = any>(path: string, body: unknown) => req<T>("POST", path, body);

export interface Chat {
  id: number; visitor_id: number; manager_id: number | null; segment: "site" | "social"; channel: string;
  status: "new" | "in_progress" | "resolved" | "archived"; order_value: string | null; deal_status: string | null;
  route: string | null; trip_date: string | null; notes: string | null; unread: number; last_msg_at: string; created_at: string;
  visitor_name?: string | null; phone?: string | null; email?: string | null; manager_name?: string | null;
}
export interface Message { id: number; sender_type: "user" | "manager"; body: string; channel: string; created_at: string }

export const STATUS_LABELS: Record<string, string> = { new: "Новий", in_progress: "В роботі", resolved: "Вирішено", archived: "Архів" };
export const DEAL_STATUSES: Record<string, string> = { new: "Новий лід", consideration: "Розглядає", negotiation: "Перемовини", won: "Куплено", lost: "Втрачено", support: "Підтримка" };
export const CHANNELS: Record<string, { label: string; color: string }> = {
  chat: { label: "Сайт", color: "#F5A623" },
  telegram: { label: "Telegram", color: "#3B82F6" },
  viber: { label: "Viber", color: "#8B5CF6" },
  facebook: { label: "Facebook", color: "#4A8CFF" },
  instagram: { label: "Instagram", color: "#EC4899" },
  whatsapp: { label: "WhatsApp", color: "#22C55E" },
};
