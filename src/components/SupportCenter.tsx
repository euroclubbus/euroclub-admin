import { FormEvent, useEffect, useState } from "react";
import { currentUser, getSessionToken } from "../lib/session";
import { ExternalLink, LogOut } from "lucide-react";
import { apiPost, ECRM, EcrmUser, getEcrmUser, getToken, setAuth } from "./support/api";
import { Chats } from "./support/Chats";
import { QuickReplies, Ratings, Users } from "./support/Manage";
import { TabGroup } from "./TabGroup";

// Кеп (06.10): EUROCLUB SUPPORT CENTER перенесено в адмінку (інтерфейс). Сервер, база Neon,
// вебхуки й канали лишаються на ecrm — сюди звертаємось через його API.
export function SupportCenter() {
  // Кеп (09.10): вхід у Support Center автоматично за сесією адмінки — профіль створюється сам.
  const adminId = currentUser()?.id || "";
  const bound = () => { try { return localStorage.getItem("ecrm_admin_id") === adminId; } catch { return false; } };
  const [me, setMe] = useState<EcrmUser | null>(() => (getToken() && bound() ? getEcrmUser() : null));
  const [auto, setAuto] = useState<"idle" | "busy" | "fail">(() => (getToken() && bound() ? "idle" : "busy"));
  const logout = () => { setAuth("", null); setMe(null); };

  useEffect(() => {
    if (auto !== "busy" || !getSessionToken()) { if (auto === "busy") setAuto("fail"); return; }
    setAuth("", null);
    apiPost<{ token: string; user: EcrmUser }>("/api/auth?action=admin-sso", { adminToken: getSessionToken() })
      .then((d) => { setAuth(d.token, d.user); try { localStorage.setItem("ecrm_admin_id", adminId); } catch { /* */ } setMe(d.user); setAuto("idle"); })
      .catch(() => setAuto("fail"));
  }, [auto]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, letterSpacing: "0.03em", margin: 0 }}>EUROCLUB SUPPORT CENTER</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
          {me && <span>{me.name || me.login} · {me.role}</span>}
          {me && <button onClick={logout} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", gap: 4, alignItems: "center" }}><LogOut size={13} /> Вийти</button>}
          <a href={`${ECRM}/legacy.html`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, color: "inherit" }}><ExternalLink size={13} /> Стара версія</a>
        </div>
      </div>
      {!me && auto === "busy" ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Вхід у Support Center…</div>
      ) : !me ? (
        <Login onDone={(u) => { try { localStorage.setItem("ecrm_admin_id", adminId); } catch { /* */ } setMe(u); }} />
      ) : (
        <TabGroup tabs={[
          { id: "chats", label: "Чати", render: () => <Chats me={me} onAuthLost={() => { setMe(null); setAuto("busy"); }} /> },
          { id: "qr", label: "Швидкі відповіді", render: () => <QuickReplies me={me} /> },
          { id: "ratings", label: "Рейтинги", render: () => <Ratings me={me} /> },
          ...(me.role !== "manager" ? [{ id: "users", label: "Користувачі", render: () => <Users me={me} /> }] : []),
        ]} />
      )}
    </div>
  );
}

function Login({ onDone }: { onDone: (u: EcrmUser) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const d = await apiPost<{ token: string; user: EcrmUser }>("/api/auth?action=login", { login, password });
      setAuth(d.token, d.user);
      onDone(d.user);
    } catch (e) {
      setErr(e instanceof Error && e.message === "Invalid credentials" ? "Невірний логін або пароль" : e instanceof Error ? e.message : "Помилка");
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ maxWidth: 360, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <b>Вхід у Support Center</b>
      <input autoFocus placeholder="Логін" value={login} onChange={(e) => setLogin(e.target.value)} style={inp} />
      <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} style={inp} />
      {err && <div style={{ color: "#E5484D", fontSize: 12 }}>{err}</div>}
      <button type="submit" disabled={busy || !login || !password} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" }}>{busy ? "Вхід…" : "Увійти"}</button>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Логін і пароль ті самі, що в Support Center. Вхід запам'ятовується на цьому комп'ютері.</span>
    </form>
  );
}
const inp: React.CSSProperties = { padding: "9px 11px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit" };
