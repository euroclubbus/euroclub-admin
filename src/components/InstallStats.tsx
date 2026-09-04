import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Download, Smartphone } from "lucide-react";
import { db } from "../lib/firebase";

// Кеп (01.09): "своя статистика встановлень" — усього/зареєстрованих/по платформі,
// незалежно від логіну чи push-дозволу. Читає app_installs (пишеться з застосунку —
// installTracking.ts, при КОЖНОМУ запуску, до будь-яких екранів-гейтів).

interface InstallDoc {
  id: string;
  platform: string;
  appVersion: string;
  userId?: string;
  firstSeenAt?: any;
  lastSeenAt?: any;
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  return null;
}

export function InstallStats() {
  const [docs, setDocs] = useState<InstallDoc[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Кеп (04.09): пресети періоду — той самий підхід, що вже є в реєстрі замовлень.
  // Фільтруємо по firstSeenAt (коли ВІДБУЛОСЯ встановлення), не lastSeenAt (та вже
  // окремо покрита картками "Активні за 7/30 днів").
  type DayPreset = "today" | "yesterday" | "week" | "last7" | "lastMonth" | "all" | "custom";
  const [activePreset, setActivePreset] = useState<DayPreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const applyPreset = (preset: DayPreset) => {
    setActivePreset(preset);
    const now = new Date();
    const today = fmtDate(now);
    if (preset === "today") {
      setDateFrom(today);
      setDateTo(today);
    } else if (preset === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      setDateFrom(fmtDate(y));
      setDateTo(fmtDate(y));
    } else if (preset === "week") {
      const monday = new Date(now);
      const day = monday.getDay();
      const diff = day === 0 ? 6 : day - 1;
      monday.setDate(monday.getDate() - diff);
      setDateFrom(fmtDate(monday));
      setDateTo(today);
    } else if (preset === "last7") {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      setDateFrom(fmtDate(d));
      setDateTo(today);
    } else if (preset === "lastMonth") {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      setDateFrom(fmtDate(d));
      setDateTo(today);
    } else if (preset === "all") {
      setDateFrom("");
      setDateTo("");
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "app_installs"));
      setDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredDocs = useMemo(() => {
    if (!docs) return null;
    if (!dateFrom && !dateTo) return docs;
    return docs.filter((d) => {
      const t = tsToDate(d.firstSeenAt);
      if (!t) return false;
      const day = fmtDate(t);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [docs, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const docs = filteredDocs;
    if (!docs) return null;
    const total = docs.length;
    const registered = docs.filter((d) => d.userId).length;
    const byPlatform: Record<string, number> = {};
    for (const d of docs) byPlatform[d.platform || "unknown"] = (byPlatform[d.platform || "unknown"] || 0) + 1;
    const now = Date.now();
    const active7d = docs.filter((d) => {
      const t = tsToDate(d.lastSeenAt);
      return t && now - t.getTime() < 7 * 24 * 60 * 60 * 1000;
    }).length;
    const active30d = docs.filter((d) => {
      const t = tsToDate(d.lastSeenAt);
      return t && now - t.getTime() < 30 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, registered, byPlatform, active7d, active30d };
  }, [docs]);

  const exportCsv = () => {
    if (!filteredDocs) return;
    const rows = [
      ["deviceId", "platform", "appVersion", "userId", "firstSeenAt", "lastSeenAt"],
      ...filteredDocs.map((d) => [
        d.id,
        d.platform || "",
        d.appVersion || "",
        d.userId || "",
        tsToDate(d.firstSeenAt)?.toISOString() || "",
        tsToDate(d.lastSeenAt)?.toISOString() || "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `app_installs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Встановлення</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 560 }}>
            Власна статистика — рахується при КОЖНОМУ відкритті застосунку, незалежно від логіну чи
            дозволу на push. Не збігається з даними Google Play/App Store (ті рахують інсталяції
            інакше, без прив'язки до наших користувачів).
          </p>
        </div>
        <button onClick={load} disabled={loading} style={styles.refreshBtn}>
          {loading ? "Оновлюю…" : "Оновити"}
        </button>
      </header>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {([
          ["today", "Сьогодні"],
          ["yesterday", "Вчора"],
          ["week", "Поточний тиждень"],
          ["last7", "Останні 7 днів"],
          ["lastMonth", "Останній місяць"],
          ["all", "Весь період"],
          ["custom", "Кастомний діапазон"],
        ] as [DayPreset, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            style={{
              background: activePreset === key ? "var(--amber)" : "var(--surface-raised)",
              color: activePreset === key ? "#1a1305" : "var(--text)",
              border: "1px solid var(--hairline-strong)",
              borderRadius: 20,
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: activePreset === key ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Дата встановлення:</span>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActivePreset("custom"); }} style={styles.dateInput} />
        <span style={{ color: "var(--text-faint)" }}>—</span>
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActivePreset("custom"); }} style={styles.dateInput} />
      </div>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          <StatCard label="Усього встановлень" value={stats.total} />
          <StatCard label="Зареєстровані (є userId)" value={`${stats.registered} (${stats.total > 0 ? Math.round((stats.registered / stats.total) * 100) : 0}%)`} />
          <StatCard label="Активні за 7 днів" value={stats.active7d} />
          <StatCard label="Активні за 30 днів" value={stats.active30d} />
          {Object.entries(stats.byPlatform).map(([platform, count]) => (
            <StatCard key={platform} label={platform} value={count} icon />
          ))}
        </div>
      )}

      {filteredDocs && filteredDocs.length > 0 && (
        <button onClick={exportCsv} style={styles.exportBtn}>
          <Download size={14} /> Експорт у CSV ({filteredDocs.length} записів)
        </button>
      )}

      {loading && !docs && <div style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Завантажую…</div>}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: boolean }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16 }}>
      {icon && <Smartphone size={14} color="var(--text-faint)" style={{ marginBottom: 6 }} />}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  refreshBtn: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", cursor: "pointer" },
  exportBtn: { display: "flex", alignItems: "center", gap: 6, background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305", cursor: "pointer" },
  dateInput: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, color: "var(--text)" },
};
