import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface ReportData {
  totalUsers: number;
  usersWithNoData: number;
  totalOrders: number;
  totalTickets: number;
  appOrders: number;
  androidOrders: number;
  iphoneOrders: number;
  usersFirstFromApp: number;
  generatedAt: string;
}

export function ChannelReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/channel-report", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Невідома помилка");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка запиту");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={headerTitle}>Ефективність каналу застосунку</h1>
        <p style={headerSubtitle}>
          Для кожного відомого нам userId забирається ПОВНА історія замовлень (усі канали —
          сайт, менеджер, застосунок), не тільки те, що є в нашому реєстрі. Один запит на
          унікального юзера.
        </p>
      </header>

      <button onClick={run} disabled={loading} style={runBtn}>
        <RefreshCw size={15} strokeWidth={2.5} />
        {loading ? "Рахую… (може зайняти хвилину)" : "Сформувати звіт"}
      </button>

      {error && <div style={errorBox}>{error}</div>}

      {data && (
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Stat label="Користувачів" value={data.totalUsers} />
          <Stat label="Замовлень усього" value={data.totalOrders} />
          <Stat label="Квитків усього" value={data.totalTickets} />
          <Stat label="Замовлень з додатку" value={data.appOrders} sub={`Android: ${data.androidOrders} · iPhone: ${data.iphoneOrders}`} />
          <Stat label="Юзерів, де застосунок був ПЕРШИМ каналом" value={data.usersFirstFromApp} highlight sub={data.totalUsers > 0 ? `${Math.round((data.usersFirstFromApp / data.totalUsers) * 100)}% від усіх юзерів` : undefined} />
          {data.usersWithNoData > 0 && <Stat label="Без відповіді від бекенду" value={data.usersWithNoData} />}
        </div>
      )}
      {data && <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-faint)" }}>Сформовано: {new Date(data.generatedAt).toLocaleString("uk-UA")}</div>}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div style={{ ...statCard, ...(highlight ? statCardHighlight : {}) }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: highlight ? "var(--amber)" : "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const headerTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: "0.03em",
  margin: 0,
};

const headerSubtitle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 13,
  marginTop: 6,
  maxWidth: 520,
};

const runBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "var(--amber)",
  color: "#1a1305",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "11px 18px",
  fontSize: 14,
  fontWeight: 600,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  background: "var(--danger-dim)",
  borderRadius: "var(--radius)",
  padding: "10px 12px",
  fontSize: 13,
};

const statCard: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius)",
  padding: 18,
};

const statCardHighlight: React.CSSProperties = {
  borderColor: "var(--amber)",
  gridColumn: "1 / -1",
};
