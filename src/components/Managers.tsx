import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sessionHeaders } from "../lib/session";
import { PushHistory } from "./PushHistory";

// Кеп (06.10): менеджери (тільки власник) — акаунти, право обходити модерацію,
// правила автоматичної модерації і огляд сегментів/розсилок по кожному менеджеру.

interface Manager { id: string; name: string; login: string; canBypass: boolean; active: boolean; lastLoginAt: number }
interface Rules { dedupHours: number; quietFrom: number; quietTo: number; maxPerDayPerSender: number }
const DEFAULT_RULES: Rules = { dedupHours: 24, quietFrom: 21, quietTo: 9, maxPerDayPerSender: 3 };

async function api(method: string, body?: unknown, query = "") {
  const r = await fetch(`/api/admin?action=users${query}`, { method, headers: { "Content-Type": "application/json", ...sessionHeaders() }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Помилка");
  return d;
}

export function Managers() {
  const [list, setList] = useState<Manager[]>([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", login: "", password: "", canBypass: false });
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [rulesMsg, setRulesMsg] = useState("");
  const [who, setWho] = useState<string>("");
  const [segments, setSegments] = useState<{ id: string; name: string; ownerId: string; ownerName: string }[]>([]);

  const load = () => api("GET").then((d) => setList(d.users)).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    getDoc(doc(db, "settings", "pushModeration")).then((s) => s.exists() && setRules({ ...DEFAULT_RULES, ...(s.data() as Rules) }));
    return onSnapshot(collection(db, "push_segments"), (snap) => setSegments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setErr("");
    try { await fn(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Помилка"); }
  }

  return (
    <div>
      {err && <div style={{ color: "var(--danger)", marginBottom: 12 }}>{err}</div>}

      <div style={card}>
        <div style={h}>Акаунти</div>
        {list.map((m) => (
          <div key={m.id} style={row}>
            <b style={{ minWidth: 140 }}>{m.name}</b>
            <span style={muted}>логін: {m.login}</span>
            <label style={chk}><input type="checkbox" checked={m.active} onChange={(e) => act(() => api("POST", { id: m.id, active: e.target.checked }))} /> активний</label>
            <label style={chk}><input type="checkbox" checked={m.canBypass} onChange={(e) => act(() => api("POST", { id: m.id, canBypass: e.target.checked }))} /> може обходити модерацію</label>
            <span style={muted}>{m.lastLoginAt ? `вхід ${new Date(m.lastLoginAt).toLocaleString("uk-UA")}` : "ще не входив"}</span>
            <button style={ghost} onClick={() => { const p = prompt(`Новий пароль для ${m.name} (мін. 6 символів)`); if (p) act(() => api("POST", { id: m.id, password: p })); }}>Пароль</button>
            <button style={{ ...ghost, color: "var(--danger)" }} onClick={() => confirm(`Видалити ${m.name}?`) && act(() => api("DELETE", undefined, `&id=${m.id}`))}>Видалити</button>
          </div>
        ))}
        {list.length === 0 && <div style={muted}>Менеджерів ще немає</div>}
        <div style={{ ...row, marginTop: 12 }}>
          <input style={input} placeholder="Ім'я" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={input} placeholder="Логін" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <input style={input} placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <label style={chk}><input type="checkbox" checked={form.canBypass} onChange={(e) => setForm({ ...form, canBypass: e.target.checked })} /> обхід модерації</label>
          <button style={primary} onClick={() => act(async () => { await api("POST", form); setForm({ name: "", login: "", password: "", canBypass: false }); })}>Додати</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Правила автоматичної модерації (маркетингові розсилки)</div>
        <div style={row}>
          <label style={lbl}>Не слати клієнту повторно протягом, год<input style={input} type="number" min={0} value={rules.dedupHours} onChange={(e) => setRules({ ...rules, dedupHours: Number(e.target.value) })} /></label>
          <label style={lbl}>Тихі години з<input style={input} type="number" min={0} max={23} value={rules.quietFrom} onChange={(e) => setRules({ ...rules, quietFrom: Number(e.target.value) })} /></label>
          <label style={lbl}>до<input style={input} type="number" min={0} max={23} value={rules.quietTo} onChange={(e) => setRules({ ...rules, quietTo: Number(e.target.value) })} /></label>
          <label style={lbl}>Макс. розсилок на добу від одного менеджера<input style={input} type="number" min={1} value={rules.maxPerDayPerSender} onChange={(e) => setRules({ ...rules, maxPerDayPerSender: Number(e.target.value) })} /></label>
          <button style={primary} onClick={async () => { await setDoc(doc(db, "settings", "pushModeration"), rules); setRulesMsg("Збережено"); setTimeout(() => setRulesMsg(""), 2000); }}>Зберегти</button>
          <span style={muted}>{rulesMsg}</span>
        </div>
        <div style={muted}>Клієнти, які вже отримали маркетингову розсилку за вказаний час, автоматично виключаються з нової — від будь-кого. Обійти правила можете ви і менеджери з правом обходу.</div>
      </div>

      <div style={card}>
        <div style={h}>Сегменти і розсилки по менеджерах</div>
        <select style={{ ...input, marginBottom: 12 }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Усі</option>
          <option value="owner">Власник</option>
          {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div style={{ ...h, fontSize: 13 }}>Сегменти</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {segments.filter((s) => !who || s.ownerId === who).map((s) => <span key={s.id} style={pill}>{s.name} · {s.ownerName}</span>)}
          {segments.filter((s) => !who || s.ownerId === who).length === 0 && <span style={muted}>Немає</span>}
        </div>
        <PushHistory refreshKey={0} senderId={who || undefined} />
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 };
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 };
const h: React.CSSProperties = { fontWeight: 700, fontSize: 15, marginBottom: 12 };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--hairline)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: 12 };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text-muted)" };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit" };
const ghost: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 };
const primary: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" };
const pill: React.CSSProperties = { padding: "5px 10px", borderRadius: 999, border: "1px solid var(--hairline)", fontSize: 12 };
