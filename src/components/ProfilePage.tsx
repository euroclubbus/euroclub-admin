import { useEffect, useState } from "react";
import { clearSession, currentUser, sessionHeaders, setSession } from "../lib/session";

// Кеп (08.10): профіль — ім'я і власний пароль (логін = id менеджера). Для всіх.
export function ProfilePage({ onLogout }: { onLogout: () => void }) {
  const me = currentUser();
  const [name, setName] = useState(me?.name || "");
  const [login, setLogin] = useState("");
  const [hasPwd, setHasPwd] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const isOwner = me?.role === "owner";

  useEffect(() => {
    if (isOwner) return;
    fetch("/api/admin?action=profile", { headers: sessionHeaders() }).then((r) => r.json()).then((d) => { setLogin(d.login || ""); setHasPwd(!!d.hasPassword); if (d.name) setName(d.name); }).catch(() => {});
  }, [isOwner]);

  async function save() {
    if (p1 && p1 !== p2) return setMsg("Паролі не збігаються");
    const r = await fetch("/api/admin?action=profile", { method: "POST", headers: { "Content-Type": "application/json", ...sessionHeaders() }, body: JSON.stringify({ name, password: p1 || undefined }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error || "Помилка");
    setSession(d.token, d.user);
    if (p1) setHasPwd(true);
    setP1(""); setP2("");
    setMsg("Збережено");
  }

  const inp: React.CSSProperties = { padding: "9px 11px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", width: "100%" };
  return (
    <div style={{ maxWidth: 460 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, margin: "0 0 20px" }}>Профіль</h1>
      <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {isOwner ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Ви увійшли як власник. Пароль власника задається в налаштуваннях Vercel (ADMIN_PASSWORD).</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Логін для входу без посилання: <b style={{ color: "var(--text)" }}>{login}</b> {hasPwd ? "· пароль встановлено" : "· пароль ще не встановлено"}</div>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Ім'я<input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>{hasPwd ? "Новий пароль" : "Пароль"}<input style={inp} type="password" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="мінімум 6 символів" /></label>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Повторіть пароль<input style={inp} type="password" value={p2} onChange={(e) => setP2(e.target.value)} /></label>
            <button onClick={save} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" }}>Зберегти</button>
            {msg && <div style={{ fontSize: 12 }}>{msg}</div>}
          </>
        )}
        <button onClick={() => { clearSession(); onLogout(); }} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer" }}>Вийти з адмінки</button>
      </div>
    </div>
  );
}
