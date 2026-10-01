import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Download } from "lucide-react";
import { db } from "../lib/firebase";

// Кеп (29.09): лічильник згоди на відстеження (Meta). Пише застосунок:
// tracking_consents/{deviceId} — екран при першому запуску + перемикач у Профілі.

interface ConsentDoc {
  id: string;
  platform: string;
  consent: "granted" | "denied";
  firstConsent?: "granted" | "denied";
  att?: string | null;
  source?: string;
  appVersion?: string;
  firstAnsweredAt?: any;
  updatedAt?: any;
}
const toDate = (ts: any): Date | null => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
type Preset = "today" | "last7" | "last30" | "all" | "custom";

export function TrackingConsents() {
  const [docs, setDocs] = useState<ConsentDoc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "today") { setFrom(fmt(now)); setTo(fmt(now)); }
    else if (p === "last7" || p === "last30") { const d = new Date(now); d.setDate(d.getDate() - (p === "last7" ? 6 : 29)); setFrom(fmt(d)); setTo(fmt(now)); }
    else if (p === "all") { setFrom(""); setTo(""); }
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const snap = await getDocs(collection(db, "tracking_consents"));
      setDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!docs) return null;
    if (!from && !to) return docs;
    return docs.filter((d) => {
      const t = toDate(d.firstAnsweredAt) || toDate(d.updatedAt);
      if (!t) return false;
      const day = fmt(t);
      return (!from || day >= from) && (!to || day <= to);
    });
  }, [docs, from, to]);

  const stats = useMemo(() => {
    if (!filtered) return null;
    const total = filtered.length;
    const granted = filtered.filter((d) => d.consent === "granted").length;
    const denied = total - granted;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const byPlatform: Record<string, { total: number; granted: number }> = {};
    for (const d of filtered) {
      const p = d.platform || "unknown";
      byPlatform[p] = byPlatform[p] || { total: 0, granted: 0 };
      byPlatform[p].total++;
      if (d.consent === "granted") byPlatform[p].granted++;
    }
    const ios = filtered.filter((d) => d.platform === "ios" && d.consent === "granted");
    const attAuthorized = ios.filter((d) => d.att === "authorized").length;
    const attDenied = ios.filter((d) => d.att && d.att !== "authorized").length;
    const changedInProfile = filtered.filter((d) => d.source === "profile").length;
    return { total, granted, denied, pct, byPlatform, attAuthorized, attDenied, iosGranted: ios.length, changedInProfile };
  }, [filtered]);

  const exportCsv = () => {
    if (!filtered) return;
    const rows = [["deviceId", "platform", "consent", "firstConsent", "att", "source", "appVersion", "firstAnsweredAt", "updatedAt"],
      ...filtered.map((d) => [d.id, d.platform, d.consent, d.firstConsent || "", d.att || "", d.source || "", d.appVersion || "", toDate(d.firstAnsweredAt)?.toISOString() || "", toDate(d.updatedAt)?.toISOString() || ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `tracking_consents_${fmt(new Date())}.csv`;
    a.click();
  };

  return (
    <div>
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Згода на відстеження</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 560 }}>
            Скільки людей погодились / відмовились на екрані згоди (перший запуск) або змінили рішення в Профілі.
            Події в Meta йдуть лише від тих, хто погодився.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={styles.btn}>{loading ? "Оновлюю…" : "Оновити"}</button>
          <button onClick={exportCsv} disabled={!filtered?.length} style={styles.primary}><Download size={14} /> CSV</button>
        </div>
      </header>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {([["today", "Сьогодні"], ["last7", "Останні 7 днів"], ["last30", "Останні 30 днів"], ["all", "Весь період"], ["custom", "Свій період"]] as [Preset, string][]).map(([k, l]) => (
          <button key={k} onClick={() => applyPreset(k)} style={{ ...styles.chip, ...(preset === k ? styles.chipOn : {}) }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} style={styles.date} />
        <span style={{ color: "var(--text-faint)" }}>—</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} style={styles.date} />
      </div>

      {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Помилка: {error}. Перевір правило Firestore для tracking_consents.</div>}

      {stats && (
        <>
          <div style={styles.grid}>
            <Card label="Відповіли всього" value={stats.total} />
            <Card label="Погодились" value={`${stats.granted} (${stats.pct(stats.granted)}%)`} accent />
            <Card label="Відмовились" value={`${stats.denied} (${stats.pct(stats.denied)}%)`} />
            <Card label="Змінили рішення в Профілі" value={stats.changedInProfile} />
          </div>
          <h3 style={styles.h3}>По платформах</h3>
          <div style={styles.grid}>
            {Object.entries(stats.byPlatform).map(([p, v]) => (
              <Card key={p} label={`${p} — погодились`} value={`${v.granted} з ${v.total} (${v.total ? Math.round((v.granted / v.total) * 100) : 0}%)`} />
            ))}
          </div>
          {stats.iosGranted > 0 && (
            <>
              <h3 style={styles.h3}>iOS: системний запит Apple (серед тих, хто погодився в нас)</h3>
              <div style={styles.grid}>
                <Card label="Дозволили Apple" value={stats.attAuthorized} />
                <Card label="Відмовили Apple" value={stats.attDenied} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${accent ? "var(--amber)" : "var(--hairline)"}`, borderRadius: "var(--radius)", padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", cursor: "pointer" },
  primary: { display: "flex", alignItems: "center", gap: 6, background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305", cursor: "pointer" },
  chip: { background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--hairline-strong)", borderRadius: 20, padding: "6px 14px", fontSize: 12.5, cursor: "pointer" },
  chipOn: { background: "var(--amber)", color: "#1a1305", fontWeight: 700 },
  date: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, color: "var(--text)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 },
  h3: { fontSize: 14, fontWeight: 600, margin: "4px 0 12px", color: "var(--text-muted)" },
};
