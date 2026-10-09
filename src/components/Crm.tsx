import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { currentUser, sessionHeaders } from "../lib/session";
import { CITIES } from "../lib/cities";

// Кеп (09.10): CRM пасажирів. Дані — у Google-таблиці (сервер /api/admin?action=crm).
// Колонки переставляються стрілками в шапці; щоденний список «На сьогодні» — кому дзвонити.

type Row = Record<string, string | number> & { _row: number };

const SELECTS: Record<string, string[]> = {
  "Джерело": ["Система бронювання", "Агентські пасажири", "Рекламні заявки", "Інше"],
  "Статус": ["Кваліфікований", "Активний", "Неактивний"],
};
const DATE_COLS = ["Дата", "Остання поїздка", "Запланована поїздка", "Нагадування"];
const DATETIME_COLS = ["Дата і час дзвінка"];
const CITY_COLS = ["Місто 1", "Місто 2"];

async function api(op: string, body?: unknown) {
  const r = await fetch(`/api/admin?action=crm&op=${op}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Помилка");
  return d;
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function isDue(r: Row): boolean {
  if (String(r["Статус"]) === "Неактивний") return false;
  const rem = String(r["Нагадування"] || "");
  const plan = String(r["Запланована поїздка"] || "");
  return (!!rem && rem <= today()) || (!!plan && plan >= today() && plan <= plusDays(14));
}

export function Crm() {
  const [info, setInfo] = useState<{ email: string; sheetId: string; order: string[] | null } | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [view, setView] = useState<"due" | "all">("due");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [link, setLink] = useState("");

  async function load() {
    setErr(""); setBusy(true);
    try {
      const i = await api("info");
      setInfo(i);
      if (i.sheetId) {
        const d = await api("list");
        setColumns(d.columns);
        setRows(d.rows);
        const base = (d.columns as string[]).filter((c) => c !== "ID");
        const saved = (i.order || []).filter((c: string) => base.includes(c));
        setOrder([...saved, ...base.filter((c) => !saved.includes(c))]);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Помилка"); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  function move(col: string, dir: -1 | 1) {
    const i = order.indexOf(col), j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    api("order", { order: next }).catch(() => {});
  }

  const shown = useMemo(() => {
    let list = view === "due" ? rows.filter(isDue) : rows;
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => columns.some((c) => String(r[c] || "").toLowerCase().includes(s)));
    return [...list].sort((a, b) => String(a["Нагадування"] || "9").localeCompare(String(b["Нагадування"] || "9")));
  }, [rows, view, q, columns]);

  async function save(r: Row) {
    setBusy(true); setErr("");
    try {
      const { _row, ...data } = r;
      await api("save", { row: _row || 0, data });
      setEdit(null);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Помилка"); setBusy(false); }
  }
  async function remove(r: Row) {
    if (!confirm(`Видалити ${r["Прізвище ім'я"] || "запис"}?`)) return;
    setBusy(true);
    try { await api("delete", { row: r._row }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Помилка"); setBusy(false); }
  }

  if (info && !info.sheetId) {
    return (
      <div style={card}>
        <div style={h}>Підключення Google-таблиці</div>
        {currentUser()?.role === "owner" ? (
          <>
            <ol style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18, margin: "0 0 12px" }}>
              <li>Створіть порожню Google-таблицю на своєму Диску.</li>
              <li>«Поділитися» → додайте <b style={{ userSelect: "all" }}>{info.email}</b> з правами «Редактор».</li>
              <li>Вставте посилання на таблицю нижче — колонки створяться самі.</li>
            </ol>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={{ ...inp, flex: 1, minWidth: 260 }} placeholder="https://docs.google.com/spreadsheets/d/…" value={link} onChange={(e) => setLink(e.target.value)} />
              <button style={primary} disabled={busy || !link} onClick={async () => { setBusy(true); setErr(""); try { await api("config", { sheetId: link }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Помилка"); setBusy(false); } }}>Підключити</button>
            </div>
          </>
        ) : <div style={muted}>Таблицю ще не підключив власник.</div>}
        {err && <div style={{ color: "var(--danger)", marginTop: 10, fontSize: 13 }}>{err}</div>}
      </div>
    );
  }

  const blank = (): Row => ({ _row: 0, ...Object.fromEntries(columns.map((c) => [c, ""])), "Дата": today(), "Статус": "Активний" } as Row);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <button style={view === "due" ? primary : ghost} onClick={() => setView("due")}>На сьогодні ({rows.filter(isDue).length})</button>
        <button style={view === "all" ? primary : ghost} onClick={() => setView("all")}>Усі ({rows.length})</button>
        <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Пошук" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={ghost} onClick={load} disabled={busy}><RefreshCw size={13} /></button>
        {info?.sheetId && <a style={{ ...ghost, textDecoration: "none" }} href={`https://docs.google.com/spreadsheets/d/${info.sheetId}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Таблиця</a>}
        <button style={primary} onClick={() => setEdit(blank())}><Plus size={14} /> Пасажир</button>
      </div>
      {view === "due" && <div style={{ ...muted, marginBottom: 8 }}>Нагадування на сьогодні й прострочені + заплановані поїздки на найближчі 14 днів (крім неактивних).</div>}
      {err && <div style={{ color: "var(--danger)", marginBottom: 10, fontSize: 13 }}>{err}</div>}

      <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              {order.map((c, i) => (
                <th key={c} style={th}>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
                    <button style={arrow} disabled={i === 0} onClick={() => move(c, -1)}><ChevronLeft size={12} /></button>
                    <span>{c}</span>
                    <button style={arrow} disabled={i === order.length - 1} onClick={() => move(c, 1)}><ChevronRight size={12} /></button>
                  </div>
                </th>
              ))}
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r._row} style={{ background: isDue(r) && view === "all" ? "rgba(245,166,35,.08)" : undefined }}>
                {order.map((c) => <td key={c} style={td}>{fmt(c, r[c])}</td>)}
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button style={arrow} onClick={() => setEdit({ ...r })}><Pencil size={13} /></button>
                  <button style={{ ...arrow, color: "var(--danger)" }} onClick={() => remove(r)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td style={{ ...td, ...muted }} colSpan={order.length + 1}>{busy ? "Завантаження…" : view === "due" ? "На сьогодні нікому дзвонити" : "Записів ще немає"}</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div style={overlay} onClick={() => setEdit(null)}>
          <div style={{ ...card, width: "min(720px, 94vw)", maxHeight: "90vh", overflowY: "auto", marginBottom: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={h}>{edit._row ? "Редагувати пасажира" : "Новий пасажир"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {order.map((c) => (
                <label key={c} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, gridColumn: c === "Коментар" ? "1 / -1" : undefined }}>
                  <span style={muted}>{c}{c === "Нагадування" ? " (дата)" : ""}</span>
                  <Field col={c} value={String(edit[c] ?? "")} onChange={(v) => setEdit({ ...edit, [c]: v })} />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button style={ghost} onClick={() => setEdit(null)}>Скасувати</button>
              <button style={primary} disabled={busy} onClick={() => save(edit)}>{busy ? "Збереження…" : "Зберегти"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ col, value, onChange }: { col: string; value: string; onChange: (v: string) => void }) {
  if (SELECTS[col]) return <select style={inp} value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{SELECTS[col].map((o) => <option key={o}>{o}</option>)}</select>;
  if (CITY_COLS.includes(col)) return <select style={inp} value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{CITIES.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>;
  if (DATE_COLS.includes(col)) return <input type="date" style={inp} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (DATETIME_COLS.includes(col)) return <input type="datetime-local" style={inp} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (col === "Частота поїздок на рік") return <input type="number" min={0} style={inp} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (col === "Коментар") return <textarea rows={3} style={inp} value={value} onChange={(e) => onChange(e.target.value)} />;
  return <input style={inp} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function fmt(col: string, v: unknown): string {
  const s = String(v ?? "");
  if (!s) return "";
  if (DATE_COLS.includes(col) && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split("-").reverse().join(".");
  if (DATETIME_COLS.includes(col) && s.includes("T")) { const [d, t] = s.split("T"); return d.split("-").reverse().join(".") + " " + t; }
  return s;
}

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 };
const h: React.CSSProperties = { fontWeight: 700, fontSize: 15, marginBottom: 12 };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface)", color: "inherit", fontSize: 13 };
const ghost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 };
const primary: React.CSSProperties = { ...ghost, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 8px", borderBottom: "1px solid var(--hairline)", background: "var(--surface)", fontWeight: 600, fontSize: 12, position: "sticky", top: 0 };
const td: React.CSSProperties = { padding: "8px 8px", borderBottom: "1px solid var(--hairline)", verticalAlign: "top", maxWidth: 260 };
const arrow: React.CSSProperties = { background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 2, display: "inline-flex", opacity: 0.7 };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
