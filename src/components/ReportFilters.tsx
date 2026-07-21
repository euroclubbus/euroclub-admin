import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { RefreshCw, Send, Users } from "lucide-react";
import { db } from "../lib/firebase";
import { TripReport } from "../lib/types";

interface UserAgg {
  userId: string;
  totalTrips: number;
  cities: Set<string>;
  fromCities: Set<string>;
  toCities: Set<string>;
  lastBookingDate: string;
  neverFixedDiscount: boolean; // усі поїздки — без коду знижки (завжди повний тариф)
  trips: TripReport[];
}

function aggregate(reports: TripReport[]): UserAgg[] {
  const byUser = new Map<string, UserAgg>();
  for (const r of reports) {
    if (!r.userId) continue;
    let agg = byUser.get(r.userId);
    if (!agg) {
      agg = { userId: r.userId, totalTrips: 0, cities: new Set(), fromCities: new Set(), toCities: new Set(), lastBookingDate: "", neverFixedDiscount: true, trips: [] };
      byUser.set(r.userId, agg);
    }
    agg.totalTrips += 1;
    agg.trips.push(r);
    if (r.fromCity) { agg.cities.add(r.fromCity); agg.fromCities.add(r.fromCity); }
    if (r.toCity) { agg.cities.add(r.toCity); agg.toCities.add(r.toCity); }
    if (r.bookingDate && r.bookingDate > agg.lastBookingDate) agg.lastBookingDate = r.bookingDate;
    const hasFixedDiscount = (r.discountIds ?? []).some((d) => d && d !== "0");
    if (hasFixedDiscount) agg.neverFixedDiscount = false;
  }
  return Array.from(byUser.values());
}

export function ReportFilters() {
  const [reports, setReports] = useState<TripReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [minTrips, setMinTrips] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [noFixedDiscountOnly, setNoFixedDiscountOnly] = useState(false);

  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "trip_reports"));
      setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TripReport, "id">) })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const allUsers = useMemo(() => aggregate(reports), [reports]);

  const allCities = useMemo(() => {
    const s = new Set<string>();
    reports.forEach((r) => {
      if (r.fromCity) s.add(r.fromCity);
      if (r.toCity) s.add(r.toCity);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "uk"));
  }, [reports]);

  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      if (fromCity && !u.fromCities.has(fromCity)) return false;
      if (toCity && !u.toCities.has(toCity)) return false;
      if (minTrips && u.totalTrips < Number(minTrips)) return false;
      if (noFixedDiscountOnly && !u.neverFixedDiscount) return false;
      if (periodFrom || periodTo) {
        const inPeriod = u.trips.some((t) => {
          const d = (t.bookingDate || "").slice(0, 10);
          if (!d) return false;
          if (periodFrom && d < periodFrom) return false;
          if (periodTo && d > periodTo) return false;
          return true;
        });
        if (!inPeriod) return false;
      }
      return true;
    });
  }, [allUsers, fromCity, toCity, minTrips, noFixedDiscountOnly, periodFrom, periodTo]);

  async function sendToSegment() {
    if (!pushTitle.trim() || !pushBody.trim() || filteredUsers.length === 0 || sending) return;
    if (!confirm(`Надіслати push ${filteredUsers.length} користувачам?`)) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pushTitle.trim(),
          body: pushBody.trim(),
          userIds: filteredUsers.map((u) => u.userId),
        }),
      });
      const data = await res.json();
      setSendResult(res.ok ? `Надіслано ${data.successCount}/${data.targetCount}` : data.error || "Помилка відправки");
      if (res.ok) {
        setPushTitle("");
        setPushBody("");
      }
    } catch {
      setSendResult("Не вдалося з'єднатись із сервером");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Звіт і сегментні пуші</h1>
          <p style={styles.subtitle}>
            Дані з кожного бронювання (без імен/email/телефонів) — фільтруй і надсилай push обраному сегменту.
          </p>
        </div>
        <button style={styles.refreshBtn} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Оновити дані
        </button>
      </header>

      <div style={styles.filtersCard}>
        <div style={styles.filtersGrid}>
          <label style={styles.label}>
            Місто відправлення
            <select style={styles.input} value={fromCity} onChange={(e) => setFromCity(e.target.value)}>
              <option value="">Будь-яке</option>
              {allCities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Місто прибуття
            <select style={styles.input} value={toCity} onChange={(e) => setToCity(e.target.value)}>
              <option value="">Будь-яке</option>
              {allCities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Мінімум поїздок всього
            <input style={styles.input} type="number" min={1} value={minTrips} onChange={(e) => setMinTrips(e.target.value)} placeholder="напр. 3" />
          </label>
          <label style={styles.label}>
            Період — від
            <input style={styles.input} type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </label>
          <label style={styles.label}>
            Період — до
            <input style={styles.input} type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </label>
          <label style={{ ...styles.label, justifyContent: "flex-end", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={noFixedDiscountOnly} onChange={(e) => setNoFixedDiscountOnly(e.target.checked)} />
            Тільки пасажири без фіксованих знижок
          </label>
        </div>
      </div>

      <div style={styles.resultBar}>
        <Users size={16} color="var(--text-muted)" />
        <span style={styles.resultText}>
          {loading ? "Завантаження…" : `${filteredUsers.length} користувачів у сегменті (з ${allUsers.length} усього)`}
        </span>
      </div>

      <div style={styles.pushCard}>
        <div style={styles.sectionTitle}>Push цьому сегменту</div>
        <input style={{ ...styles.input, marginBottom: 8 }} placeholder="Заголовок" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
        <textarea style={{ ...styles.input, minHeight: 70, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} placeholder="Текст повідомлення" value={pushBody} onChange={(e) => setPushBody(e.target.value)} />
        <button style={styles.sendBtn} onClick={sendToSegment} disabled={sending || filteredUsers.length === 0 || !pushTitle.trim() || !pushBody.trim()}>
          <Send size={14} /> {sending ? "Надсилання…" : `Надіслати (${filteredUsers.length})`}
        </button>
        {sendResult && <div style={styles.sendResult}>{sendResult}</div>}
      </div>

      {filteredUsers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={styles.sectionTitle}>Користувачі в сегменті</div>
          <div style={styles.userList}>
            {filteredUsers.slice(0, 50).map((u) => (
              <div key={u.userId} style={styles.userRow}>
                <span style={{ fontWeight: 600 }}>ID {u.userId}</span>
                <span style={styles.mutedSmall}>{u.totalTrips} поїздок · {Array.from(u.cities).slice(0, 3).join(", ")}</span>
              </div>
            ))}
            {filteredUsers.length > 50 && <div style={styles.mutedSmall}>і ще {filteredUsers.length - 50}…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 460 },
  refreshBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 12px", fontSize: 12.5, color: "var(--text)", whiteSpace: "nowrap" },
  filtersCard: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 16 },
  filtersGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: "var(--text-muted)" },
  input: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none" },
  resultBar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
  resultText: { fontSize: 13, color: "var(--text-muted)" },
  pushCard: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 },
  sendBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--amber)", color: "#1a1305", border: "none", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 13, fontWeight: 600 },
  sendResult: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 },
  userList: { display: "flex", flexDirection: "column", gap: 6 },
  userRow: { display: "flex", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "8px 12px", fontSize: 12.5 },
  mutedSmall: { fontSize: 12, color: "var(--text-faint)" },
};
