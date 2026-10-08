import { useEffect, useState } from "react";
import { sessionHeaders } from "../lib/session";

// Кеп (08.10): ключ підпису для входу менеджерів за посиланням із системи (тільки власник).
export function SsoKeySettings() {
  const [state, setState] = useState<{ set: boolean; fromEnv: boolean } | null>(null);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/admin?action=sso&key=1", { headers: sessionHeaders() }).then((r) => r.json()).then(setState).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save() {
    const r = await fetch("/api/admin?action=sso&key=1", { method: "POST", headers: { "Content-Type": "application/json", ...sessionHeaders() }, body: JSON.stringify({ key }) });
    setMsg(r.ok ? "Збережено" : "Помилка"); setKey(""); load();
  }
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Вхід менеджерів із системи EuroClub</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Адреса для POST: <code>https://euroclub-admin.vercel.app/api/admin?action=sso</code> · поля name, id, access, time, sign.
        Ключ: {state ? (state.set ? (state.fromEnv ? "задано у Vercel (SSO_SECRET)" : "задано") : "НЕ задано") : "…"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Новий ключ (як у програміста, символ у символ)" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit" }} />
        <button onClick={save} disabled={!key} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" }}>Зберегти</button>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
