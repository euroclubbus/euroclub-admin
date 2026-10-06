// Сесія адмінки (Кеп, 06.10): власник або менеджер. Живе тільки в пам'яті вкладки —
// як і раніше пароль: перезавантаження сторінки = повторний вхід.
export interface AdminUser {
  id: string;
  name: string;
  role: "owner" | "manager";
  canBypass: boolean;
}

let token = "";
let user: AdminUser | null = null;

export function setSession(t: string, u: AdminUser) {
  token = t;
  user = u;
}
export function currentUser(): AdminUser | null {
  return user;
}
export function sessionHeaders(): Record<string, string> {
  return token ? { "x-admin-session": token } : {};
}
