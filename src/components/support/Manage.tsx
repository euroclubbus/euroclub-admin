import { useEffect, useState } from "react";
import { apiGet, apiPost, EcrmUser } from "./api";

const DEFAULT_QR: Record<string, string[]> = {
  "Маршрути": ["Яких маршрутів до Європи вас цікавить?", "Ми їздимо в Німеччину, Австрію, Польщу, Угорщину й Словаччину.", "Київ → Відень, Київ → Берлін, Київ → Краків — найпопулярніші."],
  "Ціни": ["На Київ–Відень зараз €62 (знижка -15%).", "Ціни залежать від дати — в пікові дні дорожче.", "Є знижки для дітей (30%), студентів та пенсіонерів."],
  "Бронювання": ["Для бронювання потрібні: ПІБ пасажира, паспорт, номер телефону.", "Ви можете забронювати онлайн або написати нам — допоможемо.", "Оплата: карта, LiqPay, Приват24, банківський переказ."],
  "Документи": ["Для міжнародного рейсу потрібен дійсний паспорт.", "EES реєструється на кордоні автоматично.", "Страхування обовʼязкове для рейсів в ЄС."],
};

export function QuickReplies({ me }: { me: EcrmUser }) {
  // Кеп (06.10): загальні шаблони (admin/superadmin) + особисті шаблони кожного менеджера
  const isAdmin = me.role !== "manager";
  const [list, setList] = useState<{ id: number; category: string; body: string; owner_id: number | null }[]>([]);
  const [cat, setCat] = useState("");
  const [body, setBody] = useState("");
  const [personal, setPersonal] = useState(!isAdmin);
  const [err, setErr] = useState("");
  const load = () => apiGet("/api/quick-replies?action=list").then((d) => setList(d.data || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => setErr(e.message));

  async function importDefaults() {
    for (const [c, arr] of Object.entries(DEFAULT_QR)) for (const b of arr) await apiPost("/api/quick-replies?action=create", { category: c, body: b });
    load();
  }

  const section = (title: string, rows: typeof list, editable: boolean) => {
    const cats = Array.from(new Set(rows.map((r) => r.category)));
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{title}</div>
        {rows.length === 0 && <div style={muted}>Немає</div>}
        {cats.map((c) => (
          <div key={c} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{c}</div>
            {rows.filter((r) => r.category === c).map((r) => (
              <div key={r.id} style={row}>
                {editable ? (
                  <input style={{ ...input, flex: 1 }} defaultValue={r.body} onBlur={(e) => e.target.value !== r.body && act(apiPost("/api/quick-replies?action=update", { id: r.id, body: e.target.value }))} />
                ) : <span style={{ flex: 1 }}>{r.body}</span>}
                {editable && <button style={{ ...ghost, color: "#E5484D" }} onClick={() => confirm("Видалити?") && act(apiPost("/api/quick-replies?action=delete", { id: r.id }))}>✕</button>}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const common = list.filter((r) => r.owner_id === null);
  const mine = list.filter((r) => r.owner_id === me.id);
  const allCats = Array.from(new Set(list.map((r) => r.category)));
  return (
    <div style={card}>
      {err && <div style={{ color: "#E5484D", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {common.length === 0 && isAdmin && (
        <div style={{ marginBottom: 12 }}>
          <span style={muted}>Загальних шаблонів ще немає. </span>
          <button style={ghost} onClick={importDefaults}>Додати стандартний набір</button>
        </div>
      )}
      {section("Загальні шаблони", common, isAdmin)}
      {section("Мої шаблони", mine, true)}
      <div style={{ ...row, marginTop: 8 }}>
        <input style={{ ...input, width: 160 }} list="qr-cats" placeholder="Категорія" value={cat} onChange={(e) => setCat(e.target.value)} />
        <datalist id="qr-cats">{allCats.map((c) => <option key={c} value={c} />)}</datalist>
        <input style={{ ...input, flex: 1 }} placeholder="Текст відповіді" value={body} onChange={(e) => setBody(e.target.value)} />
        {isAdmin && (
          <label style={{ display: "flex", gap: 5, fontSize: 12, alignItems: "center" }}>
            <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} /> лише мій
          </label>
        )}
        <button style={primary} disabled={!cat.trim() || !body.trim()} onClick={() => act(apiPost("/api/quick-replies?action=create", { category: cat.trim(), body: body.trim(), personal }).then(() => setBody("")))}>Додати</button>
      </div>
    </div>
  );
}

export function Users({ me }: { me: EcrmUser }) {
  const isSuper = me.role === "superadmin";
  const [list, setList] = useState<{ id: number; login: string; name: string; email: string; role: string; active: boolean; euroclub_manager_id: number | null }[]>([]);
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
            <input style={{ ...input, width: 130 }} placeholder="ID менеджера EuroClub" defaultValue={u.euroclub_manager_id ?? ""} title="ID менеджера на беку EuroClub — йде в замовлення як manager_id"
              onBlur={(e) => e.target.value !== String(u.euroclub_manager_id ?? "") && act(apiPost("/api/users?action=update", { id: u.id, euroclub_manager_id: e.target.value.trim() || null }))} />
          ) : <span style={muted}>ID EuroClub: {u.euroclub_manager_id ?? "—"}</span>}
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

// Рейтинги менеджерів (дані з бази Support Center). Admin/superadmin бачить усіх і імпортує CSV.
function parseCsvLine(line: string): string[] {
  const sep = line.includes(";") ? ";" : ",";
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function Ratings({ me }: { me: EcrmUser }) {
  const isAdmin = me.role !== "manager";
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const load = () => apiGet("/api/stats?action=ratings").then((d) => setRows(d.data || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function importCsv(file: File) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const data = lines.slice(1).map(parseCsvLine).filter((c) => c.length >= 13).map((c) => ({
      manager: c[0].trim(), total: parseInt(c[3]) || 0, targeted: parseInt(c[4]) || 0, nonTargeted: parseInt(c[5]) || 0,
      consultations: parseInt(c[6]) || 0, purchases: parseInt(c[7]) || 0, speed: c[8].trim(), converted: parseInt(c[9]) || 0,
      lost: parseInt(c[10]) || 0, score: parseFloat(String(c[11]).replace(",", ".")), recommendations: c[12].trim(),
    }));
    try { await apiPost("/api/stats?action=ratings", { rows: data }); alert(`Імпортовано оцінок: ${data.length}`); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Помилка імпорту"); }
  }

  const best = rows.length ? Math.max(...rows.map((r) => Number(r.score) || 0)) : 0;
  return (
    <div style={card}>
      {err && <div style={{ color: "#E5484D", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {isAdmin && (
        <label style={{ ...ghost, display: "inline-block", marginBottom: 12 }}>
          Імпорт CSV
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        </label>
      )}
      {rows.length === 0 && <div style={muted}>Оцінок ще немає</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: `1px solid ${Number(r.score) === best ? "var(--amber)" : "var(--hairline)"}`, borderRadius: 10, padding: 12 }}>
            {Number(r.score) === best && <div style={{ color: "var(--amber)", fontSize: 11, fontWeight: 700 }}>Лідер</div>}
            <div style={{ fontWeight: 700 }}>{r.manager_name}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{r.score != null ? Number(r.score).toFixed(1) : "—"}</div>
            <div style={muted}>Звернень {r.total} · цільових {r.targeted} · нецільових {r.non_targeted}</div>
            <div style={muted}>Консультацій {r.consultations} · покупок {r.purchases} · конверсія {r.converted} · втрачено {r.lost}</div>
            <div style={muted}>Швидкість відповіді: {r.speed || "—"}</div>
            {r.recommendations && <div style={{ fontSize: 12, marginTop: 6 }}>{r.recommendations}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
