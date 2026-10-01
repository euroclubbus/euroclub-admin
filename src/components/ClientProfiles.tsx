import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Download, KeyRound } from "lucide-react";
import { db } from "../lib/firebase";
import { CITIES, cityName } from "../lib/cities";

// Кеп (01.10): дата народження + цікаві міста клієнтів. Пишуть: застосунок (Профіль)
// і бекенд сайту (api/profile-sync). "Є застосунок" = є документ device_tokens/{userId}.
interface Profile {
  id: string;
  userId?: string;
  header?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  favCities?: string[];
  favCityNames?: string[];
  source?: string;
  platform?: string;
  hasApp?: boolean;
  updatedAt?: any;
}
const toDate = (ts: any): Date | null => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);
const fmtBday = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");

export function ClientProfiles() {
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [tokens, setTokens] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [onlyBday, setOnlyBday] = useState<"" | "today" | "month">("");
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const snap = await getDocs(collection(db, "user_profiles"));
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) { setError(e?.message || String(e)); }
    try {
      const t = await getDocs(collection(db, "device_tokens"));
      setTokens(new Set(t.docs.map((d) => d.id)));
    } catch { /* без доступу — беремо прапорець hasApp з профілю */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const names = (p: Profile) => (p.favCities || []).map((id, i) => { const n = cityName(id); return n !== id ? n : (p.favCityNames?.[i] || id); });
  const hasApp = (p: Profile) => tokens.has(p.id) || !!p.hasApp;

  const filtered = useMemo(() => {
    if (!rows) return [];
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const s = q.trim().toLowerCase();
    return rows
      .filter((p) => !city || (p.favCities || []).includes(city))
      .filter((p) => !onlyBday || (p.birthday && (onlyBday === "today" ? p.birthday.slice(5) === `${mm}-${dd}` : p.birthday.slice(5, 7) === mm)))
      .filter((p) => !s || [p.id, p.header, p.email, p.phone].some((v) => String(v || "").toLowerCase().includes(s)))
      .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));
  }, [rows, q, city, onlyBday]);

  const usedCities = useMemo(() => {
    const ids = new Set<string>();
    (rows || []).forEach((p) => (p.favCities || []).forEach((c) => ids.add(c)));
    return CITIES.filter((c) => ids.has(c.id));
  }, [rows]);

  const exportCsv = () => {
    const data = [["user_id", "Ім'я", "Email", "Телефон", "Дата народження", "Міста", "Джерело", "Є застосунок", "Оновлено"],
      ...filtered.map((p) => [p.id, p.header || "", p.email || "", p.phone || "", fmtBday(p.birthday), names(p).join("; "), p.source || "", hasApp(p) ? "так" : "ні", toDate(p.updatedAt)?.toLocaleString("uk-UA") || ""])];
    const csv = data.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `clients_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const showKey = async (regenerate = false) => {
    if (regenerate && !confirm("Створити новий ключ? Старий перестане працювати — його треба буде замінити на бекенді.")) return;
    setKeyMsg("");
    try {
      const r = await fetch("/api/profile-sync-key", { method: regenerate ? "POST" : "GET", headers: { "x-admin-password": import.meta.env.VITE_ADMIN_PASSWORD || "" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      setKey(j.key);
    } catch (e: any) { setKeyMsg(String(e?.message || e)); }
  };

  const total = rows?.length || 0;
  const withBday = (rows || []).filter((p) => p.birthday).length;
  const withCities = (rows || []).filter((p) => p.favCities?.length).length;

  return (
    <div>
      <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Клієнти: ДН і міста</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 620 }}>
            Дата народження і цікаві міста — із Профілю в застосунку та з сайту (бекенд шле через API).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={styles.btn}>{loading ? "Оновлюю…" : "Оновити"}</button>
          <button onClick={exportCsv} disabled={!filtered.length} style={styles.primary}><Download size={14} /> CSV</button>
        </div>
      </header>

      {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Помилка: {error}. Перевір правило Firestore для user_profiles.</div>}

      <div style={styles.grid}>
        <Card label="Усього клієнтів" value={total} />
        <Card label="Вказали дату народження" value={withBday} />
        <Card label="Обрали міста" value={withCities} />
        <Card label="З них мають застосунок" value={(rows || []).filter(hasApp).length} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук: id, ім'я, email, телефон" style={{ ...styles.input, width: 260 }} />
        <select value={city} onChange={(e) => setCity(e.target.value)} style={styles.input}>
          <option value="">Усі міста</option>
          {usedCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={onlyBday} onChange={(e) => setOnlyBday(e.target.value as any)} style={styles.input}>
          <option value="">Будь-яка дата народження</option>
          <option value="today">ДН сьогодні</option>
          <option value="month">ДН цього місяця</option>
        </select>
        <span style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-muted)" }}>Показано: {filtered.length}</span>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{["user_id", "Ім'я", "Дата народження", "Міста", "Джерело", "Застосунок", "Оновлено"].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td style={styles.td}>{p.id}</td>
                <td style={styles.td}>{p.header || "—"}<div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{[p.email, p.phone].filter(Boolean).join(" · ")}</div></td>
                <td style={styles.td}>{fmtBday(p.birthday) || "—"}</td>
                <td style={styles.td}>{names(p).join(", ") || "—"}</td>
                <td style={styles.td}>{p.source === "app" ? `застосунок${p.platform ? ` (${p.platform})` : ""}` : p.source || "—"}</td>
                <td style={styles.td}>{hasApp(p) ? "✅" : "—"}</td>
                <td style={styles.td}>{toDate(p.updatedAt)?.toLocaleString("uk-UA") || "—"}</td>
              </tr>
            ))}
            {!filtered.length && !loading && <tr><td colSpan={7} style={{ ...styles.td, color: "var(--text-muted)" }}>Поки порожньо</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: 16, border: "1px solid var(--hairline)", borderRadius: "var(--radius)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 6 }}><KeyRound size={15} /> Ключ для бекенду (x-sync-key)</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
          Бекенд сайту надсилає дані на <code>POST https://euroclub-admin.vercel.app/api/profile-sync</code> із заголовком <code>x-sync-key</code>.
        </div>
        {key ? <code style={{ display: "block", padding: 10, background: "var(--surface-raised)", borderRadius: 6, wordBreak: "break-all", marginBottom: 10 }}>{key}</code> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => showKey(false)} style={styles.btn}>Показати ключ</button>
          <button onClick={() => showKey(true)} style={styles.btn}>Створити новий</button>
        </div>
        {keyMsg && <div style={{ color: "#ff6b6b", fontSize: 12.5, marginTop: 8 }}>{keyMsg}</div>}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: { display: "flex", alignItems: "center", gap: 6, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 12.5, color: "var(--text)", cursor: "pointer" },
  primary: { display: "flex", alignItems: "center", gap: 6, background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305", cursor: "pointer" },
  input: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--text)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--hairline)", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid var(--hairline)", verticalAlign: "top" },
};
