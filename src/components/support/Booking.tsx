import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { apiGet, apiPost, Chat, EcrmUser } from "./api";

// Кеп (07.10): бронювання з панелі через серверний модуль Support Center (/api/booking):
// рейси, карта місць, знижки менеджера (MOB 1–40% або 50%), app=10, manager_id береться
// з картки користувача (Users → ID менеджера EuroClub), лінк оплати, шаблон повідомлення.
const MOB_MAX = 40, SALE50_ID = 45;
const CUSTOM_PCTS = [...Array.from({ length: 40 }, (_, i) => i + 1), 50];
const mobId = (p: number) => { p = Math.round(+p || 0); if (p <= 0) return null; if (p >= 50) return SALE50_ID; return 100 + Math.min(p, MOB_MAX); };
const mobPct = (p: number) => { p = Math.round(+p || 0); if (p <= 0) return 0; if (p >= 50) return 50; return Math.min(p, MOB_MAX); };
function leg(t: any) {
  const old = +(t.price_old ?? t.price ?? 0), alt = +(t.price_alt ?? 0), dsc = +(t.price_dsc ?? 0), mob = +(t.price_mob_dsc ?? 0);
  const base = alt !== 0 ? alt : old;
  const pct = mobPct(mob > 0 ? mob : dsc > 0 ? dsc : 0);
  return { base, pct, id: mobId(pct) };
}
const isFull = (d: any) => d && (d.default === 1 || d.default === "1" || String(d.id) === "0");
const fullId = (t: any) => { const f = (t.discounts || []).find(isFull); return f ? String(f.id) : "0"; };
interface Pax { name: string; mode: "auto" | "full" | "cat" | "custom"; cat?: string; pct?: number }
function paxCalc(t: any, p: Pax) {
  const L = leg(t), r = Math.round;
  if (p.mode === "full") return { price: r(L.base), id: fullId(t), comment: "" };
  if (p.mode === "custom") {
    const pc = mobPct(p.pct || 0);
    if (!pc) return { price: r(L.base), id: fullId(t), comment: "" };
    return { price: r(L.base * (1 - pc / 100)), id: String(mobId(pc)), comment: `ручна знижка менеджера ${pc}%` };
  }
  if (p.mode === "cat") {
    const d = (t.discounts || []).find((x: any) => String(x.id) === String(p.cat));
    if (d) {
      const cp = +d.discount || 0;
      if (L.pct > cp && L.id != null) return { price: r(L.base * (1 - L.pct / 100)), id: String(L.id), comment: `категорія «${d.name}», використовується знижка рейсу` };
      return { price: r(L.base * (1 - cp / 100)), id: String(d.id), comment: "" };
    }
  }
  return { price: r(L.base * (1 - L.pct / 100)), id: L.id != null ? String(L.id) : fullId(t), comment: "" };
}
const cur = (t: any) => (/eur/i.test(t?.currency || "uah") ? "€" : "₴");
const hm = (s?: string) => (s || "").split(" ")[1]?.slice(0, 5) || "";
const dmy = (s?: string) => (s || "").split(" ")[0] || "";

type Cell = null | { wc: true } | { n: number; free: boolean };
function parseMap(pm: any): Cell[][] {
  if (!pm || typeof pm !== "object" || Array.isArray(pm)) return [];
  const floors = Object.values(pm) as any[]; if (!floors.length) return [];
  const fl = floors[0];
  return Object.keys(fl).sort((a, b) => +a - +b).map((rk) => {
    const ro = fl[rk];
    return Object.keys(ro).sort((a, b) => +a - +b).map((ck) => {
      const c = ro[ck];
      if (!c || Array.isArray(c)) return null;
      if (c.type === "wc") return { wc: true } as const;
      if (typeof c.nmr === "number") return { n: c.nmr, free: c.free === 1 && c.nmr !== 3 };
      return null;
    });
  });
}
function defaultMap(total: number): Cell[][] {
  const rows: Cell[][] = []; let n = 1; const reg = Math.floor(total / 4);
  for (let r = 0; r < reg; r++) { const a = n++, b = n++, c = n++, d = n++; rows.push([{ n: b, free: b !== 3 }, { n: a, free: a !== 3 }, null, { n: c, free: c !== 3 }, { n: d, free: d !== 3 }]); }
  const rest = total - reg * 4; if (rest > 0) { const row: Cell[] = []; for (let i = 0; i < rest; i++) { row.push({ n, free: n !== 3 }); n++; } rows.push(row); }
  return rows;
}

interface City { id: string | number; uk: string }
let citiesCache: City[] | null = null;

export function Booking({ chat, me, onSend }: { chat: Chat; me: EcrmUser; onSend: (text: string) => Promise<void> }) {
  const [cities, setCities] = useState<City[]>(citiesCache || []);
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trips, setTrips] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [trip, setTrip] = useState<any | null>(null);
  const [pax, setPax] = useState<Pax[]>([]);
  const [seats, setSeats] = useState<number[]>([]);
  const [payer, setPayer] = useState(chat.visitor_name || "");
  const [phone, setPhone] = useState(chat.phone || "");
  const [email, setEmail] = useState(chat.email || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ oid: string; link: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [tpl, setTpl] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const isAdmin = me.role !== "manager";

  useEffect(() => {
    if (citiesCache) return;
    apiGet("/api/booking?action=cities").then((r) => {
      const raw = (r && r.data && (r.data.cities || r.data)) || {};
      const arr = (Array.isArray(raw) ? raw : Object.values(raw)) as City[];
      citiesCache = arr.filter((c) => c && c.uk).sort((a, b) => a.uk.localeCompare(b.uk, "uk"));
      setCities(citiesCache);
    }).catch((e) => setErr(e.message));
  }, []);
  const byName = (n: string) => cities.find((c) => c.uk.toLowerCase() === n.trim().toLowerCase()) || null;

  async function search() {
    const f = byName(fromName), t = byName(toName);
    if (!f || !t || !date) { setErr("Оберіть міста зі списку та дату"); return; }
    setErr(""); setLoading(true); setTrips(null); setTrip(null);
    try {
      const [y, m, d] = date.split("-");
      const r = await apiGet(`/api/booking?action=routes&from=${f.id}&to=${t.id}&date=${d}-${m}-${y}`);
      const data = r.data || {}; const code = String(data.error ?? "0");
      setTrips(code === "102" || code === "103" ? [] : data.routes || []);
    } catch (e) { setErr(e instanceof Error ? e.message : "Помилка пошуку"); }
    finally { setLoading(false); }
  }

  const calc = useMemo(() => (trip ? pax.map((p) => paxCalc(trip, p)) : []), [trip, pax]);
  const total = calc.reduce((s, c) => s + c.price, 0);
  const needSeats = trip && +trip.place_select === 1;
  const map = useMemo(() => { if (!trip) return []; const r = parseMap(trip.places_map); return r.length ? r : defaultMap(+trip.places || 50); }, [trip]);
  const cats = (trip?.discounts || []).filter((d: any) => !isFull(d) && !/^\s*(SALE|MOB)\b/i.test(String(d.name || "")) && Number(d.discount) > 0);

  const setP = (i: number, patch: Partial<Pax>) => setPax(pax.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  function seat(n: number) {
    const k = seats.indexOf(n);
    if (k >= 0) setSeats(seats.filter((x) => x !== n));
    else if (seats.length < pax.length) setSeats([...seats, n]);
    else setSeats([...seats.slice(1), n]);
  }

  async function create() {
    if (!trip) return;
    setErr("");
    if (pax.some((p) => !p.name.trim())) return setErr("Вкажіть імена всіх пасажирів");
    if (pax.some((p) => p.mode === "custom" && !p.pct)) return setErr("Оберіть відсоток своєї знижки");
    if (needSeats && seats.length < pax.length) return setErr("Оберіть місця для всіх пасажирів");
    if (!payer.trim()) return setErr("Вкажіть імʼя платника");
    if (!phone.trim()) return setErr("Вкажіть телефон платника");
    const comments = calc.map((c, i) => (c.comment ? `Пасажир ${i + 1} — ${c.comment}` : null)).filter(Boolean).join("; ");
    setBusy(true);
    try {
      const f = byName(fromName)!, t = byName(toName)!;
      const r = await apiPost("/api/booking?action=order", {
        email: email.trim(), phone: phone.trim(), header: payer.trim().toUpperCase(),
        price: String(leg(trip).base * pax.length), crc: /eur/i.test(trip.currency || "uah") ? "eur" : "uah",
        from: String(f.id), to: String(t.id), route1: String(trip.id).split("-")[0], sale_comment: comments || undefined,
        passengers: pax.map((p, i) => ({ name: p.name.trim(), discount: calc[i].id, place1: needSeats ? seats[i] : "" })),
      });
      let template = tpl;
      if (!template) { const tr = await apiGet("/api/booking?action=template"); template = tr.template || ""; setTpl(template); }
      setResult({ oid: r.oid, link: r.link || "" });
      setSent(false);
      setMsg((template || "").replace(/\{номер\}/g, r.oid).replace(/\{лінк\}/g, r.link || ""));
    } catch (e) { setErr(e instanceof Error ? e.message : "Не вдалося створити замовлення"); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!msg.trim()) return;
    try { await onSend(msg); setSent(true); setErr(""); } catch { setErr("Не вдалося надіслати"); }
  }
  async function toggleTpl() {
    if (!tpl) { const tr = await apiGet("/api/booking?action=template"); setTpl(tr.template || ""); }
    setTplOpen(!tplOpen);
  }
  async function saveTpl() {
    try { await apiPost("/api/booking?action=template", { template: tpl }); setTplOpen(false); } catch { setErr("Не вдалося зберегти шаблон"); }
  }
  function reset() { setTrips(null); setTrip(null); setPax([]); setSeats([]); setResult(null); setMsg(""); setSent(false); setErr(""); setTplOpen(false); }

  if (result) {
    return (
      <div style={box}>
        <b>✅ Замовлення № {result.oid} створено</b>
        {!result.link && <div style={errS}>Бекенд не повернув лінк на оплату — вставте його вручну в текст нижче.</div>}
        <div style={{ ...muted, margin: "8px 0 4px" }}>Повідомлення клієнту (можна редагувати):</div>
        <textarea style={{ ...inp, width: "100%", minHeight: 200, fontFamily: "inherit", resize: "vertical" }} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button style={{ ...primary, width: "100%", marginTop: 6 }} onClick={send} disabled={sent}>{sent ? "Надіслано ✓" : "Надіслати в чат"}</button>
        {err && <div style={errS}>{err}</div>}
        {isAdmin && <button style={{ ...link, marginTop: 8 }} onClick={toggleTpl}>✎ Редагувати шаблон повідомлення</button>}
        {tplOpen && (
          <>
            <textarea style={{ ...inp, width: "100%", minHeight: 160, marginTop: 6, fontFamily: "inherit" }} value={tpl || ""} onChange={(e) => setTpl(e.target.value)} />
            <div style={muted}>Підстановки: {"{номер}"}, {"{лінк}"}</div>
            <button style={{ ...ghost, marginTop: 4 }} onClick={saveTpl}>Зберегти шаблон</button>
          </>
        )}
        <button style={{ ...ghost, width: "100%", marginTop: 8 }} onClick={reset}>Нове бронювання</button>
      </div>
    );
  }

  return (
    <div style={box}>
      <datalist id="bk-cities">{cities.map((c) => <option key={String(c.id)} value={c.uk} />)}</datalist>
      <div style={h}>1. Пошук рейсу</div>
      <input style={{ ...inp, width: "100%" }} list="bk-cities" placeholder="Звідки" value={fromName} onChange={(e) => setFromName(e.target.value)} />
      <input style={{ ...inp, width: "100%", marginTop: 6 }} list="bk-cities" placeholder="Куди" value={toName} onChange={(e) => setToName(e.target.value)} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input style={{ ...inp, flex: 1 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button style={primary} onClick={search} disabled={loading}><Search size={13} /> {loading ? "Шукаю…" : "Знайти рейси"}</button>
      </div>
      {err && !trip && <div style={errS}>{err}</div>}
      {trips && !trip && trips.length === 0 && <div style={{ ...muted, marginTop: 8 }}>Рейсів на цю дату немає</div>}
      {trips && !trip && trips.map((t, i) => {
        const L = leg(t), dep = t.departure?.[0], arr = t.arrival?.[0];
        const free = Number(t.free);
        return (
          <div key={i} style={{ ...tripS, opacity: !isNaN(free) && free <= 0 ? 0.45 : 1 }} onClick={() => { if (isNaN(free) || free > 0) { setTrip(t); setPax([{ name: payer, mode: "auto" }]); setSeats([]); setErr(""); } }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{hm(dep?.time)} → {hm(arr?.time)}</b>
              <b>{Math.round(L.base * (1 - L.pct / 100))} {cur(t)}</b>
            </div>
            <div style={muted}>{dep?.name}</div>
            <div style={muted}>{dmy(arr?.time) !== dmy(dep?.time) ? `прибуття ${dmy(arr?.time)} · ` : ""}{isNaN(free) ? "" : `вільно: ${free}`}{L.pct ? ` · знижка рейсу ${L.pct}%` : ""}{Number(t.transfer) === 1 ? " · пересадка" : ""}</div>
          </div>
        );
      })}

      {trip && (
        <>
          <div style={{ ...tripS, cursor: "default" }}>
            <b>{hm(trip.departure?.[0]?.time)} → {hm(trip.arrival?.[0]?.time)} · {dmy(trip.departure?.[0]?.time)}</b>
            <div style={muted}>{trip.departure?.[0]?.name}</div>
            <button style={link} onClick={() => { setTrip(null); setErr(""); }}>← інший рейс</button>
          </div>
          <div style={h}>2. Пасажири</div>
          {pax.map((p, i) => (
            <div key={i} style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 8, marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                <input style={{ ...inp, flex: 1 }} placeholder="Ім'я та прізвище (латиницею як у паспорті)" value={p.name} onChange={(e) => setP(i, { name: e.target.value })} />
                {pax.length > 1 && <button style={link} onClick={() => { setPax(pax.filter((_, k) => k !== i)); setSeats(seats.slice(0, pax.length - 1)); }}>✕</button>}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <select style={{ ...inp, flex: 1 }} value={p.mode === "cat" ? `cat:${p.cat}` : p.mode} onChange={(e) => { const v = e.target.value; v.startsWith("cat:") ? setP(i, { mode: "cat", cat: v.slice(4) }) : setP(i, { mode: v as Pax["mode"] }); }}>
                  <option value="auto">{leg(trip).pct ? `Авто (знижка рейсу ${leg(trip).pct}%)` : "Авто"}</option>
                  <option value="full">Повний тариф</option>
                  {cats.map((c: any) => <option key={c.id} value={`cat:${c.id}`}>{c.name} ({c.discount}%)</option>)}
                  <option value="custom">Своя знижка…</option>
                </select>
                {p.mode === "custom" && (
                  <select style={{ ...inp, width: 72 }} value={p.pct || ""} onChange={(e) => setP(i, { pct: +e.target.value })}>
                    <option value="">%</option>
                    {CUSTOM_PCTS.map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12 }}>
                <span style={muted}>{needSeats ? <>Місце: <b>{seats[i] ?? "—"}</b></> : ""}</span>
                <b>{calc[i]?.price} {cur(trip)}</b>
              </div>
            </div>
          ))}
          <button style={link} onClick={() => setPax([...pax, { name: "", mode: "auto" }])}>+ пасажир</button>

          {needSeats && (
            <>
              <div style={h}>3. Місця (обрано {seats.length} з {pax.length})</div>
              <div style={bus}>
                <div style={{ ...muted, textAlign: "center", marginBottom: 6 }}>🚌 Перед</div>
                {map.map((row, ri) => (
                  <div key={ri} style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 4 }}>
                    {row.map((c, ci) => {
                      if (!c) return <span key={ci} style={{ width: 30 }} />;
                      if ("wc" in c) return <span key={ci} style={{ ...seatS, opacity: 0.5 }}>WC</span>;
                      const sel = seats.includes(c.n);
                      return (
                        <button key={ci} disabled={!c.free} onClick={() => seat(c.n)} style={{ ...seatS, cursor: c.free ? "pointer" : "default", background: sel ? "var(--amber)" : c.free ? "transparent" : "rgba(255,255,255,0.08)", color: sel ? "#111" : c.free ? "inherit" : "var(--text-muted)" }}>{c.n}</button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={h}>{needSeats ? "4" : "3"}. Платник</div>
          <input style={{ ...inp, width: "100%" }} placeholder="Ім'я та прізвище платника" value={payer} onChange={(e) => setPayer(e.target.value)} />
          <input style={{ ...inp, width: "100%", marginTop: 6 }} placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input style={{ ...inp, width: "100%", marginTop: 6 }} placeholder="Email (необовʼязково)" value={email} onChange={(e) => setEmail(e.target.value)} />
          {err && <div style={errS}>{err}</div>}
          <button style={{ ...primary, width: "100%", marginTop: 8 }} onClick={create} disabled={busy}>{busy ? "Створюю…" : `Створити замовлення · ${total} ${cur(trip)}`}</button>
        </>
      )}
    </div>
  );
}

const box: React.CSSProperties = { fontSize: 13 };
const h: React.CSSProperties = { fontWeight: 700, margin: "12px 0 6px" };
const inp: React.CSSProperties = { padding: "7px 8px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface)", color: "inherit", fontSize: 12.5, minWidth: 0, boxSizing: "border-box" };
const primary: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer", fontSize: 12.5 };
const ghost: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12.5 };
const tripS: React.CSSProperties = { marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", cursor: "pointer" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 11.5, marginTop: 2 };
const link: React.CSSProperties = { background: "none", border: "none", color: "var(--amber)", cursor: "pointer", fontSize: 12, padding: 0 };
const errS: React.CSSProperties = { color: "#E5484D", fontSize: 12, marginTop: 6 };
const bus: React.CSSProperties = { border: "1px solid var(--hairline)", borderRadius: 12, padding: 10 };
const seatS: React.CSSProperties = { width: 30, height: 28, borderRadius: 6, border: "1px solid var(--hairline)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
