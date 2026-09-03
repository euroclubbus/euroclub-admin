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

  const stats = useMemo(() => {
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
    if (!docs) return;
    const rows = [
      ["deviceId", "platform", "appVersion", "userId", "firstSeenAt", "lastSeenAt"],
      ...docs.map((d) => [
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

      {docs && docs.length > 0 && (
        <button onClick={exportCsv} style={styles.exportBtn}>
          <Download size={14} /> Експорт у CSV ({docs.length} записів)
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
};
