import { useEffect, useState } from "react";
import { apiGet, apiPost, EcrmUser } from "./api";

const DEFAULT_QR: Record<string, string[]> = {
  "Маршрути": ["Яких маршрутів до Європи вас цікавить?", "Ми їздимо в Німеччину, Австрію, Польщу, Угорщину й Словаччину.", "Київ → Відень, Київ → Берлін, Київ → Краків — найпопулярніші."],
  "Ціни": ["На Київ–Відень зараз €62 (знижка -15%).", "Ціни залежать від дати — в пікові дні дорожче.", "Є знижки для дітей (30%), студентів та пенсіонерів."],
  "Бронювання": ["Для бронювання потрібні: ПІБ пасажира, паспорт, номер телефону.", "Ви можете забронювати онлайн або написати нам — допоможемо.", "Оплата: карта, LiqPay, Приват24, банківський переказ."],
  "Документи": ["Для міжнародного рейсу потрібен дійсний паспорт.", "EES реєструється на кордоні автоматично.", "Страхування обовʼязкове для рейсів в ЄС."],
};

export function QuickReplies({ me }: { me: EcrmUser }) {
  const canEdit = me.role !== "manager";
  const [list, setList] = useState<{ id: number; category: string; body: string }[]>([]);
  const [cat, setCat] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const load = () => apiGet("/api/quick-replies?action=list").then((d) => setList(d.data || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => setErr(e.message));

  async function importDefaults() {
    for (const [c, arr] of Object.entries(DEFAULT_QR)) for (const b of arr) await apiPost("/api/quick-replies?action=create", { category: c, body: b });
    load();
  }

  const cats = Array.from(new Set(list.map((r) => r.category)));
  return (
    <div style={card}>
      {err && <div style={{ color: "#E5484D", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {list.length === 0 && canEdit && (
        <div style={{ marginBottom: 12 }}>
          <span style={muted}>Швидких відповідей у базі ще немає. </span>
          <button style={ghost} onClick={importDefaults}>Додати стандартний набір</button>
        </div>
      )}
      {cats.map((c) => (
        <div key={c} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{c}</div>
          {list.filter((r) => r.category === c).map((r) => (
            <div key={r.id} style={row}>
              {canEdit ? (
                <input style={{ ...input, flex: 1 }} defaultValue={r.body} onBlur={(e) => e.target.value !== r.body && act(apiPost("/api/quick-replies?action=update", { id: r.id, body: e.target.value }))} />
              ) : (
                <span style={{ flex: 1 }}>{r.body}</span>
              )}
              {canEdit && <button style={{ ...ghost, color: "#E5484D" }} onClick={() => confirm("Видалити?") && act(apiPost("/api/quick-replies?action=delete", { id: r.id }))}>✕</button>}
            </div>
          ))}
        </div>
      ))}
      {canEdit && (
        <div style={{ ...row, marginTop: 8 }}>
          <input style={{ ...input, width: 160 }} list="qr-cats" placeholder="Категорія" value={cat} onChange={(e) => setCat(e.target.value)} />
          <datalist id="qr-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          <input style={{ ...input, flex: 1 }} placeholder="Текст відповіді" value={body} onChange={(e) => setBody(e.target.value)} />
          <button style={primary} disabled={!cat.trim() || !body.trim()} onClick={() => act(apiPost("/api/quick-replies?action=create", { category: cat.trim(), body: body.trim() }).then(() => setBody("")))}>Додати</button>
        </div>
      )}
    </div>
  );
}

export function Users({ me }: { me: EcrmUser }) {
  const isSuper = me.role === "superadmin";
  const [list, setList] = useState<{ id: number; login: string; name: string; email: string; role: string; active: boolean }[]>([]);
  const [f, setF] = useState({ login: "", password: "", name: "", role: "manager" });
  const [err, setErr] = useState("");
  const load = () => apiGet("/api/users?action=list").then((d) => setList(d.data || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = (p: Promise<unknown>) => { setErr(""); return p.then(load).catch((e) => setErr(e.message)); };

  return (
    <div style={card}>
      {err && <div style={{ color: "#E5484D", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {list.map((u) => (
        <div key={u.id} style={row}>
          <b style={{ minWidth: 160 }}>{u.name || u.login}</b>
          <span style={muted}>логін: {u.login}</span>
          {isSuper ? (
            <select style={input} value={u.role} onChange={(e) => act(apiPost("/api/users?action=update", { id: u.id, role: e.target.value }))}>
              <option value="superadmin">SuperAdmin</option><option value="admin">Admin</option><option value="manager">Manager</option>
            </select>
          ) : <span style={muted}>{u.role}</span>}
          {isSuper && (
            <>
              <label style={{ display: "flex", gap: 5, fontSize: 12, alignItems: "center" }}>
                <input type="checkbox" checked={u.active} onChange={(e) => act(apiPost("/api/users?action=update", { id: u.id, active: e.target.checked }))} /> активний
              </label>
              <button style={ghost} onClick={() => { const p = prompt(`Новий пароль для ${u.name || u.login}`); if (p) act(apiPost("/api/auth?action=reset-password", { user_id: u.id, new_password: p })); }}>Скинути пароль</button>
              {u.id !== me.id && <button style={{ ...ghost, color: "#E5484D" }} onClick={() => confirm(`Видалити ${u.login}?`) && act(apiPost("/api/users?action=delete", { id: u.id }))}>Видалити</button>}
            </>
          )}
        </div>
      ))}
      {isSuper && (
        <div style={{ ...row, marginTop: 12 }}>
          <input style={input} placeholder="Логін" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} />
          <input style={input} placeholder="Пароль" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <input style={input} placeholder="Ім'я" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select style={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="manager">Manager</option><option value="admin">Admin</option><option value="superadmin">SuperAdmin</option>
          </select>
          <button style={primary} disabled={!f.login || !f.password} onClick={() => act(apiPost("/api/users?action=create", f).then(() => setF({ login: "", password: "", name: "", role: "manager" })))}>Додати</button>
        </div>
      )}
      <MyPassword />
    </div>
  );
}

function MyPassword() {
  const [o, setO] = useState("");
  const [n, setN] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div style={{ ...row, marginTop: 20, borderBottom: "none" }}>
      <b>Мій пароль</b>
      <input style={input} type="password" placeholder="Старий" value={o} onChange={(e) => setO(e.target.value)} />
      <input style={input} type="password" placeholder="Новий" value={n} onChange={(e) => setN(e.target.value)} />
      <button style={ghost} disabled={!o || !n} onClick={() => apiPost("/api/auth?action=change-password", { old_password: o, new_password: n }).then(() => { setMsg("Змінено"); setO(""); setN(""); }).catch((e) => setMsg(e.message))}>Змінити</button>
      <span style={muted}>{msg}</span>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16 };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--hairline)" };
const input: React.CSSProperties = { padding: "7px 9px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", fontSize: 13 };
const ghost: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 };
const primary: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
