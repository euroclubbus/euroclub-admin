// Сесія адмінки (Кеп, 06.10 / 08.10): власник або менеджер. Зберігається в sessionStorage
// вкладки — оновлення сторінки не викидає, закриття вкладки = вихід.
export interface AdminUser {
  id: string;
  name: string;
  role: "owner" | "admin" | "manager";
  canBypass: boolean;
}

const KEY = "admin_session";
let token = "";
let user: AdminUser | null = null;

function decode(t: string): (AdminUser & { exp?: number }) | null {
  try {
    const p = t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(p + "=".repeat((4 - (p.length % 4)) % 4))));
    return JSON.parse(json);
  } catch { return null; }
}

export function setSession(t: string, u?: AdminUser) {
  const d = u || decode(t);
  if (!d) return;
  token = t;
  user = { id: d.id, name: d.name, role: d.role, canBypass: !!d.canBypass };
  try { sessionStorage.setItem(KEY, t); } catch { /* */ }
}
export function restoreSession(): boolean {
  try {
    const t = sessionStorage.getItem(KEY);
    if (!t) return false;
    const d = decode(t);
    if (!d || (d.exp && d.exp < Date.now())) { sessionStorage.removeItem(KEY); return false; }
    setSession(t, d);
    return true;
  } catch { return false; }
}
export function clearSession() {
  token = ""; user = null;
  try { sessionStorage.removeItem(KEY); } catch { /* */ }
}
export function currentUser(): AdminUser | null {
  return user;
}
export function sessionHeaders(): Record<string, string> {
  return token ? { "x-admin-session": token } : {};
}
