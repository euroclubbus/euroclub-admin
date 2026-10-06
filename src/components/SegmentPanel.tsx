import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { CITIES, cityName } from "../lib/cities";
import { currentUser, sessionHeaders } from "../lib/session";

// Кеп (06.10): сегментація розсилок. Дані — client_trips (повна історія поїздок клієнта
// з беку, синк кнопкою або щоночі). Збережені сегменти — тільки міста + кількість
// поїздок + період, склад перераховується щоразу (нові клієнти додаються самі).

export interface SegmentTarget {
  userIds: string[];
  label: string;
  segmentId?: string;
}

interface ClientTrips {
  userId: string;
  orders: { oid: string; status: number; legs: { from: string; to: string; date: string | null; open: boolean }[]; dsc: string[] }[];
}

interface SavedSegment {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  cities: string[];
  minTrips: string;
  maxTrips: string;
  periodDays: string;
  createdAt: number;
}

const FIXED_DISCOUNTS: { id: string; name: string }[] = [
  { id: "4", name: "Особи, старші за 60" },
  { id: "5", name: "Особи з інвалідністю" },
  { id: "64", name: "Військові з УБД" },
  { id: "7", name: "Група від 6 осіб" },
  { id: "66", name: "Діти до 1 року" },
  { id: "67", name: "Діти 1–10 років" },
  { id: "68", name: "Діти 10–15 років" },
  { id: "51", name: "Тварина" },
  { id: "8", name: "Доп. місце" },
];
const KIDS = new Set(["66", "67", "68"]);

interface Filters {
  cities: string[];
  minTrips: string;
  maxTrips: string;
  periodDays: string; // порожньо = за весь час
  periodFrom: string;
  periodTo: string;
  excludeDsc: string[];
  kids: boolean;
  pets: boolean;
}
const EMPTY: Filters = { cities: [], minTrips: "", maxTrips: "", periodDays: "", periodFrom: "", periodTo: "", excludeDsc: [], kids: false, pets: false };

function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function matchClient(ct: ClientTrips, f: Filters): boolean {
  const cities = new Set(f.cities);
  const ex = new Set(f.excludeDsc);
  const from = f.periodDays ? isoDaysAgo(Number(f.periodDays)) : f.periodFrom || null;
  const to = f.periodDays ? null : f.periodTo || null;
  let trips = 0;
  let kids = false;
  let pets = false;
  for (const o of ct.orders || []) {
    if (o.status === 0) continue; // скасовані не рахуємо
    if (o.dsc.some((d) => KIDS.has(d))) kids = true;
    if (o.dsc.includes("51")) pets = true;
    // Замовлення виключаємо, тільки якщо ВСІ квитки в ньому з обраними знижками.
    if (ex.size && o.dsc.length && o.dsc.every((d) => ex.has(d))) continue;
    for (const l of o.legs) {
      if (l.open || !l.date) continue;
      if (from && l.date < from) continue;
      if (to && l.date > to) continue;
      if (cities.size && !cities.has(l.from) && !cities.has(l.to)) continue;
      trips++;
    }
  }
  if (f.kids && !kids) return false;
  if (f.pets && !pets) return false;
  const anyTripFilter = cities.size > 0 || !!from || !!to || !!f.minTrips;
  const min = f.minTrips ? Number(f.minTrips) : anyTripFilter ? 1 : 0;
  if (trips < min) return false;
  if (f.maxTrips && trips > Number(f.maxTrips)) return false;
  return true;
}

function describe(f: Filters): string {
  const parts: string[] = [];
  if (f.cities.length) parts.push(f.cities.map(cityName).join(", "));
  if (f.minTrips || f.maxTrips) parts.push(`поїздок ${f.minTrips || 1}–${f.maxTrips || "∞"}`);
  if (f.periodDays) parts.push(`за ${f.periodDays} дн.`);
  else if (f.periodFrom || f.periodTo) parts.push(`${f.periodFrom || "…"} — ${f.periodTo || "…"}`);
  if (f.excludeDsc.length) parts.push(`без знижок: ${f.excludeDsc.join(",")}`);
  if (f.kids) parts.push("з дітьми");
  if (f.pets) parts.push("з тваринами");
  return parts.join(" · ") || "усі клієнти з поїздками";
}

export function SegmentPanel({ onApply, onClose }: { onApply: (t: SegmentTarget) => void; onClose: () => void }) {
  const me = currentUser();
  const [clients, setClients] = useState<ClientTrips[]>([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<Filters>(EMPTY);
  const [citySearch, setCitySearch] = useState("");
  const [saved, setSaved] = useState<SavedSegment[]>([]);
  const [activeSaved, setActiveSaved] = useState<SavedSegment | null>(null);
  const [newName, setNewName] = useState("");
  const [sync, setSync] = useState<string>("");

  async function loadClients() {
    setLoading(true);
    const snap = await getDocs(collection(db, "client_trips"));
    setClients(snap.docs.map((d) => d.data() as ClientTrips));
    setLoading(false);
  }
  useEffect(() => {
    loadClients().catch(() => setLoading(false));
    return onSnapshot(collection(db, "push_segments"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedSegment, "id">) }));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setSaved(list);
    });
  }, []);

  const visibleSaved = me?.role === "owner" ? saved : saved.filter((s) => s.ownerId === me?.id);
  const matched = useMemo(() => clients.filter((c) => matchClient(c, f)), [clients, f]);

  async function runSync() {
    let cursor = 0;
    setSync("Синхронізація…");
    try {
      for (let i = 0; i < 500; i++) {
        const r = await fetch("/api/clients-sync", { method: "POST", headers: { "Content-Type": "application/json", ...sessionHeaders() }, body: JSON.stringify({ cursor }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Помилка");
        setSync(`Синхронізація… ${d.next} з ${d.total}`);
        if (d.done) break;
        cursor = d.next;
      }
      setSync("Готово");
      await loadClients();
    } catch (e) {
      setSync(e instanceof Error ? e.message : "Помилка");
    }
  }

  async function saveSegment() {
    if (!newName.trim() || !me) return;
    await addDoc(collection(db, "push_segments"), {
      name: newName.trim(),
      ownerId: me.id,
      ownerName: me.name,
      cities: f.cities,
      minTrips: f.minTrips,
      maxTrips: f.maxTrips,
      periodDays: f.periodDays,
      createdAt: Date.now(),
    });
    setNewName("");
  }

  function loadSegment(s: SavedSegment) {
    setActiveSaved(s);
    setF({ ...EMPTY, cities: s.cities || [], minTrips: s.minTrips || "", maxTrips: s.maxTrips || "", periodDays: s.periodDays || "" });
  }

  const set = (patch: Partial<Filters>) => {
    setActiveSaved(null);
    setF((p) => ({ ...p, ...patch }));
  };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const cityOptions = CITIES.filter((c) => c.name.toLowerCase().includes(citySearch.toLowerCase())).slice(0, 40);

  return (
    <div style={st.card}>
      <div style={st.row}>
        <div style={st.h}>Сегментація</div>
        <button style={st.ghost} onClick={onClose}>✕</button>
      </div>

      <div style={st.section}>
        <div style={st.label}>Збережені сегменти {me?.role === "owner" ? "(усі менеджери)" : "(мої)"}</div>
        <div style={st.chips}>
          {visibleSaved.length === 0 && <span style={st.muted}>Ще немає</span>}
          {visibleSaved.map((s) => (
            <span key={s.id} style={{ ...st.chip, ...(activeSaved?.id === s.id ? st.chipOn : {}) }}>
              <span onClick={() => loadSegment(s)} style={{ cursor: "pointer" }}>
                {s.name}{me?.role === "owner" ? ` · ${s.ownerName}` : ""}
              </span>
              {(me?.role === "owner" || s.ownerId === me?.id) && (
                <span style={{ cursor: "pointer", opacity: 0.6 }} onClick={() => confirm(`Видалити сегмент «${s.name}»?`) && deleteDoc(doc(db, "push_segments", s.id))}> ✕</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div style={st.section}>
        <div style={st.label}>Міста (клієнт підходить, якщо їхав з/до будь-якого з обраних)</div>
        <div style={st.chips}>
          {f.cities.map((id) => (
            <span key={id} style={{ ...st.chip, ...st.chipOn }} onClick={() => set({ cities: f.cities.filter((x) => x !== id) })}>
              {cityName(id)} ✕
            </span>
          ))}
        </div>
        <input style={st.input} placeholder="Пошук міста…" value={citySearch} onChange={(e) => setCitySearch(e.target.value)} />
        {citySearch && (
          <div style={st.chips}>
            {cityOptions.map((c) => (
              <span key={c.id} style={st.chip} onClick={() => { set({ cities: toggle(f.cities, c.id) }); setCitySearch(""); }}>
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={st.grid}>
        <label style={st.label}>Поїздок від<input style={st.input} type="number" min={0} value={f.minTrips} onChange={(e) => set({ minTrips: e.target.value })} /></label>
        <label style={st.label}>Поїздок до<input style={st.input} type="number" min={0} value={f.maxTrips} onChange={(e) => set({ maxTrips: e.target.value })} /></label>
        <label style={st.label}>За останні N днів<input style={st.input} type="number" min={1} placeholder="весь час" value={f.periodDays} onChange={(e) => set({ periodDays: e.target.value, periodFrom: "", periodTo: "" })} /></label>
        <label style={st.label}>або з дати<input style={st.input} type="date" value={f.periodFrom} onChange={(e) => set({ periodFrom: e.target.value, periodDays: "" })} /></label>
        <label style={st.label}>по дату<input style={st.input} type="date" value={f.periodTo} onChange={(e) => set({ periodTo: e.target.value, periodDays: "" })} /></label>
      </div>

      <div style={st.section}>
        <div style={st.label}>Виключити замовлення з фіксованими знижками (замовлення, де хоч один квиток без знижки, враховується)</div>
        <div style={st.chips}>
          {FIXED_DISCOUNTS.map((d) => (
            <span key={d.id} style={{ ...st.chip, ...(f.excludeDsc.includes(d.id) ? st.chipOn : {}) }} onClick={() => set({ excludeDsc: toggle(f.excludeDsc, d.id) })}>
              {d.name}
            </span>
          ))}
        </div>
      </div>

      <div style={{ ...st.row, justifyContent: "flex-start", gap: 16 }}>
        <label style={st.check}><input type="checkbox" checked={f.kids} onChange={(e) => set({ kids: e.target.checked })} /> Тільки з дітьми</label>
        <label style={st.check}><input type="checkbox" checked={f.pets} onChange={(e) => set({ pets: e.target.checked })} /> Тільки з тваринами</label>
        <button style={st.ghost} onClick={() => { setActiveSaved(null); setF(EMPTY); }}>Скинути</button>
      </div>

      <div style={st.result}>
        {loading ? "Завантаження клієнтів…" : <>У сегменті: <b>{matched.length}</b> з {clients.length} клієнтів з історією</>}
        <span style={st.muted}> · {describe(f)}</span>
      </div>

      <div style={{ ...st.row, gap: 8, flexWrap: "wrap" }}>
        <input style={{ ...st.input, flex: 1, minWidth: 180 }} placeholder="Назва сегмента (зберігаються міста, поїздки, період)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button style={st.ghost} disabled={!newName.trim()} onClick={saveSegment}>Зберегти сегмент</button>
        <button
          style={st.primary}
          disabled={!matched.length}
          onClick={() => onApply({ userIds: matched.map((c) => c.userId), label: activeSaved ? `${activeSaved.name}: ${describe(f)}` : describe(f), segmentId: activeSaved?.id })}
        >
          Розсилати цьому сегменту ({matched.length})
        </button>
      </div>

      <div style={{ ...st.row, marginTop: 10 }}>
        <span style={st.muted}>Історія поїздок оновлюється щоночі автоматично.</span>
        <button style={st.ghost} onClick={runSync} disabled={sync.startsWith("Синхронізація")}>{sync || "Оновити історію зараз"}</button>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  card: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  h: { fontWeight: 700, fontSize: 15 },
  section: { marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  chip: { padding: "5px 10px", borderRadius: 999, border: "1px solid var(--hairline)", fontSize: 12, cursor: "pointer" },
  chipOn: { background: "var(--amber)", color: "#111", borderColor: "var(--amber)" },
  check: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 },
  result: { padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", marginBottom: 10, fontSize: 13 },
  muted: { color: "var(--text-muted)", fontSize: 12 },
  ghost: { padding: "7px 12px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 },
  primary: { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer", fontSize: 13 },
};
