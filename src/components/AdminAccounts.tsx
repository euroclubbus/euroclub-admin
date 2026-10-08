import { useEffect, useState } from "react";
import { sessionHeaders } from "../lib/session";
import { NAV, MANAGER_TABS } from "./Layout";

// Кеп (08.10): акаунти адмінки (тільки власник). Нові акаунти — повний адмінський доступ.
interface Acc { id: string; name: string; role: "admin" | "manager"; managerId: string; tabs: string[] | null; active: boolean; lastLoginAt: number }

async function api(method: string, body?: unknown, query = "") {
  const r = await fetch(`/api/admin?action=users${query}`, { method, headers: { "Content-Type": "application/json", ...sessionHeaders() }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Помилка");
  return d;
}

export function AdminAccounts() {
  const [list, setList] = useState<Acc[]>([]);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [mid, setMid] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api("GET").then((d) => setList(d.users)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  async function act(fn: () => Promise<unknown>, ok = "") {
    setMsg("");
    try { await fn(); await load(); if (ok) setMsg(ok); } catch (e) { setMsg(e instanceof Error ? e.message : "Помилка"); }
  }

  return (
    <div style={card}>
      <div style={h}>Акаунти адмінки</div>
      {list.map((a) => (
        <div key={a.id} style={row}>
          <b style={{ minWidth: 160 }}>{a.name}</b>
          <button style={ghost} title="Змінити id_account" onClick={() => { const v = prompt(`id_account для ${a.name}`, a.managerId); if (v !== null) act(() => api("POST", { id: a.id, managerId: v })); }}>id_account: {a.managerId || "—"}</button>
          <select style={input} value={a.role} onChange={(e) => act(() => api("POST", { id: a.id, role: e.target.value }))}>
            <option value="admin">Адмін (повний доступ)</option>
            <option value="manager">Менеджер</option>
          </select>
          <label style={chk}><input type="checkbox" checked={a.active} onChange={(e) => act(() => api("POST", { id: a.id, active: e.target.checked }))} /> активний</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: "100%", paddingLeft: 4 }}>
            {NAV.filter((n) => n.id !== "accounts").map((n) => {
              const cur = a.tabs ?? (a.role === "admin" ? NAV.filter((x) => x.id !== "accounts").map((x) => x.id as string) : (MANAGER_TABS as string[]));
              const on = cur.includes(n.id);
              return (
                <label key={n.id} style={chk}>
                  <input type="checkbox" checked={on} onChange={() => act(() => api("POST", { id: a.id, tabs: on ? cur.filter((t) => t !== n.id) : [...cur, n.id] }))} /> {n.label}
                </label>
              );
            })}
          </div>
          <span style={muted}>{a.lastLoginAt ? `вхід ${new Date(a.lastLoginAt).toLocaleString("uk-UA")}` : "ще не входив"}</span>
          <button style={ghost} onClick={() => { const p = prompt(`Новий пароль для ${a.name}`); if (p) act(() => api("POST", { id: a.id, password: p }), "Пароль змінено"); }}>Пароль</button>
          <button style={{ ...ghost, color: "var(--danger)" }} onClick={() => confirm(`Видалити ${a.name}?`) && act(() => api("DELETE", undefined, `&id=${a.id}`))}>Видалити</button>
        </div>
      ))}
      {list.length === 0 && <div style={muted}>Акаунтів ще немає</div>}
      <div style={{ ...row, borderBottom: "none", marginTop: 10 }}>
        <input style={input} placeholder="Ім'я" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={input} placeholder="id_account" value={mid} onChange={(e) => setMid(e.target.value)} />
        <input style={input} placeholder="Пароль" value={pass} onChange={(e) => setPass(e.target.value)} />
        <button style={primary} disabled={!name.trim() || !pass} onClick={() => act(() => api("POST", { name, password: pass, role: "admin", managerId: mid }).then(() => { setName(""); setPass(""); setMid(""); }), "Акаунт створено — вхід цим паролем")}>Створити</button>
      </div>
      {msg && <div style={{ ...muted, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 };
const h: React.CSSProperties = { fontWeight: 700, fontSize: 15, marginBottom: 12 };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--hairline)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: 12 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit" };
const ghost: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 };
const primary: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" };
