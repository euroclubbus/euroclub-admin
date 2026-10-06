import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CITIES } from "../../lib/cities";
import { computeLegPricing, legPriceWithFixedCategory } from "../../lib/pricing";
import { Chat, EcrmUser } from "./api";

// Кеп (06.10): пошук рейсів і бронювання прямо з чату Support Center.
// Замовлення йде на бек з app=10 і manager_id — бек сам знаходить клієнта за email/телефоном.
const WORKER = "https://curly-voice-8a71.eclubbus21.workers.dev";

function cur(c: string) { return /eur/i.test(c || "") ? "€" : "₴"; }
function hm(t?: string) { return (t || "").split(" ")[1]?.slice(0, 5) || ""; }
function dmy(t?: string) { return (t || "").split(" ")[0] || ""; }

export interface Booked { oid: string; summary: string; route: string; date: string; total: number; currency: string }

export function Booking({ chat, me, onBooked }: { chat: Chat; me: EcrmUser; onBooked: (b: Booked) => void }) {
  const mgrKey = `ecrm_manager_id_${me.id}`;
  const [managerId, setManagerId] = useState(() => { try { return localStorage.getItem(mgrKey) || ""; } catch { return ""; } });
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trips, setTrips] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [trip, setTrip] = useState<any | null>(null);
  const [pax, setPax] = useState<{ name: string; cat: string }[]>([{ name: chat.visitor_name || "", cat: "sale" }]);
  const [phone, setPhone] = useState(chat.phone || "");
  const [email, setEmail] = useState(chat.email || "");
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!from || !to || !date) return;
    setLoading(true); setErr(""); setTrips(null); setTrip(null);
    try {
      const [y, m, d] = date.split("-");
      const r = await fetch(`${WORKER}/v1/json/routes/?${new URLSearchParams({ from, to, date: `${d}-${m}-${y}`, crc: "auto" })}`);
      const data = await r.json();
      const list = (data.routes || []).filter((t: any) => { const f = Number(t?.free); return isNaN(f) || f > 0; });
      setTrips(list);
      if (!list.length) setErr(String(data.error ?? "0") === "0" ? "Рейсів з місцями на цю дату немає" : "Маршруту немає");
    } catch { setErr("Не вдалося отримати рейси"); }
    finally { setLoading(false); }
  }

  const cats = useMemo(() => (trip?.discounts || []).filter((d: any) => !/^\s*(SALE|MOB)\b/i.test(String(d.name || "")) && Number(d.discount) > 0 && String(d.id) !== "43"), [trip]);
  const lp = trip ? computeLegPricing(trip) : null;
  const paxPrice = (p: { cat: string }) => {
    if (!trip || !lp) return 0;
    if (p.cat === "sale") return lp.actual;
    const opt = cats.find((c: any) => String(c.id) === p.cat);
    return opt ? legPriceWithFixedCategory(trip, Number(opt.discount)).price : lp.actual;
  };
  const total = pax.reduce((s, p) => s + paxPrice(p), 0);

  async function book() {
    if (!trip || !lp) return;
    if (!managerId.trim()) { setErr("Вкажіть свій manager_id"); return; }
    if (!phone.trim() && !email.trim()) { setErr("Потрібен телефон або email клієнта"); return; }
    if (pax.some((p) => !p.name.trim())) { setErr("Вкажіть ПІБ усіх пасажирів"); return; }
    setBusy(true); setErr("");
    try {
      try { localStorage.setItem(mgrKey, managerId.trim()); } catch { /* */ }
      const body = new URLSearchParams();
      const fields: Record<string, string> = {
        work: "work", app: "10", lng: "uk", uidkey: "0", mod: "apimobile", opr: "neworder",
        manager_id: managerId.trim(),
        email: email.trim(), phone: phone.trim(),
        header: (pax[0].name || "PASSENGER").trim().toUpperCase(),
        price: String(lp.base * pax.length), // базовий тариф × пасажири (як у застосунку для one-way)
        crc: /eur/i.test(trip.currency || "") ? "eur" : "uah",
        from, to, route1: String(trip.id).split("-")[0],
      };
      Object.entries(fields).forEach(([k, v]) => body.set(k, v));
      const comments: string[] = [];
      pax.forEach((p, i) => {
        let dsc = lp.discountId != null ? String(lp.discountId) : "0";
        if (p.cat !== "sale") {
          const opt = cats.find((c: any) => String(c.id) === p.cat);
          const r = opt ? legPriceWithFixedCategory(trip, Number(opt.discount)) : null;
          if (r && r.usedTrip && r.discountId != null) { dsc = String(r.discountId); comments.push(`Пасажир ${i + 1} — ${opt.name}, використовується знижка рейсу`); }
          else dsc = p.cat;
        }
        body.append("psgr_name[]", p.name.trim().toUpperCase());
        body.append("psgr_dscnt[]", dsc);
        body.append("place_1[]", "");
      });
      if (comments.length) body.set("sale_comment", comments.join("; "));
      const r = await fetch(`${WORKER}/input`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
      const d = await r.json().catch(() => ({}));
      const oid = d?.oid ?? d?.data?.oid;
      if (!oid) throw new Error(d?.text || d?.err || d?.error || "Бек не повернув номер замовлення");
      const dep = trip.departure?.[0];
      const fromName = CITIES.find((c) => c.id === from)?.name || from;
      const toName = CITIES.find((c) => c.id === to)?.name || to;
      onBooked({
        oid: String(oid),
        route: `${fromName} → ${toName}`,
        date: dmy(dep?.time),
        total, currency: trip.currency || "uah",
        summary: `Ваше замовлення №${oid} оформлено ✅\n${fromName} → ${toName}, ${dmy(dep?.time)} о ${hm(dep?.time)}\nПасажирів: ${pax.length}\nДо сплати: ${total} ${cur(trip.currency)}\nЗамовлення з'явиться у вашому кабінеті EuroClub.`,
      });
      setTrip(null); setTrips(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Помилка бронювання"); }
    finally { setBusy(false); }
  }

  return (
    <div style={box}>
      <b style={{ marginBottom: 8, display: "block" }}>🚌 Пошук рейсів і бронювання</b>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <select style={inp} value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Звідки</option>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={inp} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Куди</option>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input style={inp} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button style={primary} onClick={search} disabled={loading || !from || !to}><Search size={13} /> {loading ? "Шукаю…" : "Знайти"}</button>
      </div>
      {err && <div style={{ color: "#E5484D", fontSize: 12, marginTop: 6 }}>{err}</div>}

      {trips && !trip && trips.map((t) => {
        const p = computeLegPricing(t);
        const dep = t.departure?.[0]; const arr = t.arrival?.[0];
        return (
          <div key={t.id} style={tripRow} onClick={() => setTrip(t)}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{hm(dep?.time)} → {hm(arr?.time)}</b>
              <b>{p.actual} {cur(t.currency)}</b>
            </div>
            <div style={muted}>{dep?.name} → {arr?.name}</div>
            <div style={muted}>{dmy(arr?.time) !== dmy(dep?.time) ? `прибуття ${dmy(arr?.time)} · ` : ""}{t.free != null ? `місць: ${t.free}` : ""}{p.pct ? ` · знижка ${p.pct}%` : ""}{Number(t.transfer) === 1 ? " · з пересадкою" : ""}</div>
          </div>
        );
      })}

      {trip && lp && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...tripRow, cursor: "default" }}>
            <b>{hm(trip.departure?.[0]?.time)} → {hm(trip.arrival?.[0]?.time)} · {dmy(trip.departure?.[0]?.time)}</b>
            <div style={muted}>{trip.departure?.[0]?.name}</div>
            <button style={link} onClick={() => setTrip(null)}>← інший рейс</button>
          </div>
          {pax.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
              <input style={{ ...inp, flex: 1 }} placeholder={`ПІБ пасажира ${i + 1}`} value={p.name} onChange={(e) => setPax(pax.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
              <select style={{ ...inp, width: 110 }} value={p.cat} onChange={(e) => setPax(pax.map((x, k) => (k === i ? { ...x, cat: e.target.value } : x)))}>
                <option value="sale">{lp.pct ? `Sale online ${lp.pct}%` : "Повний тариф"}</option>
                {cats.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
              <span style={{ ...muted, width: 52, textAlign: "right" }}>{paxPrice(p)}</span>
              {pax.length > 1 && <button style={link} onClick={() => setPax(pax.filter((_, k) => k !== i))}>✕</button>}
            </div>
          ))}
          <button style={{ ...link, marginTop: 6 }} onClick={() => setPax([...pax, { name: "", cat: "sale" }])}>+ пасажир</button>
          <input style={{ ...inp, width: "100%", marginTop: 6 }} placeholder="Телефон клієнта" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input style={{ ...inp, width: "100%", marginTop: 6 }} placeholder="Email клієнта" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={{ ...inp, width: "100%", marginTop: 6 }} placeholder="Мій manager_id" value={managerId} onChange={(e) => setManagerId(e.target.value)} />
          <button style={{ ...primary, width: "100%", marginTop: 8, justifyContent: "center" }} onClick={book} disabled={busy}>
            {busy ? "Бронюю…" : `Забронювати · ${total} ${cur(trip.currency)}`}
          </button>
        </div>
      )}
    </div>
  );
}

const box: React.CSSProperties = { padding: 12, borderRadius: 10, border: "1px solid var(--hairline)", marginBottom: 12, fontSize: 13 };
const inp: React.CSSProperties = { padding: "7px 8px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface)", color: "inherit", fontSize: 12.5, minWidth: 0 };
const primary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer", fontSize: 12.5, justifyContent: "center" };
const tripRow: React.CSSProperties = { marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid var(--hairline)", cursor: "pointer" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 11.5, marginTop: 2 };
const link: React.CSSProperties = { background: "none", border: "none", color: "var(--amber)", cursor: "pointer", fontSize: 12, padding: 0 };
