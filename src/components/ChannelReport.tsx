import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface ReportData {
  totalUsers: number;
  usersWithNoData: number;
  totalTickets: number;
  appOrders: number;
  androidOrders: number;
  iphoneOrders: number;
  usersFirstFromApp: number;
  generatedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  statusFilter: "all" | "paid" | "unpaid" | "cancelled";
}

export function ChannelReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid" | "cancelled">("all");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/channel-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, statusFilter }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Невідома помилка");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка запиту");
    } finally {
      setLoading(false);
    }
  }

  const rows = data
    ? [
        { label: "Кількість користувачів", value: data.totalUsers },
        { label: "Кількість замовлень з додатку", value: `${data.appOrders} (Android: ${data.androidOrders} · iPhone: ${data.iphoneOrders})` },
        { label: "Кількість квитків з додатку", value: data.totalTickets },
        { label: "Юзерів, де застосунок був ПЕРШИМ каналом за все життя (серед активних у цьому періоді)", value: `${data.usersFirstFromApp} (${data.totalUsers > 0 ? Math.round((data.usersFirstFromApp / data.totalUsers) * 100) : 0}%)` },
        { label: "Без відповіді від бекенду", value: data.usersWithNoData },
      ]
    : [];

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={headerTitle}>Ефективність каналу застосунку</h1>
        <p style={headerSubtitle}>
          Для кожного відомого нам userId забирається ПОВНА історія замовлень (усі канали —
          сайт, менеджер, застосунок), не тільки те, що є в нашому реєстрі. Один запит на
          унікального юзера. Діапазон дат/статус фільтрують, ЯКІ юзери потрапляють у звіт
          (мають бодай одне замовлення, що відповідає фільтрам) і які їхні замовлення
          рахуються в метриках — але "перший канал" завжди рахується як АБСОЛЮТНО перше
          замовлення юзера за все життя (навіть якщо воно поза обраним діапазоном).
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([
          { key: "all", label: "Усі" },
          { key: "paid", label: "Оплачені" },
          { key: "unpaid", label: "Очікують оплати" },
          { key: "cancelled", label: "Скасовані" },
        ] as const).map((o) => (
          <button
            key={o.key}
            onClick={() => setStatusFilter(o.key)}
            style={{ ...statusChip, ...(statusFilter === o.key ? statusChipActive : {}) }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Період:</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInput} />
        <span style={{ color: "var(--text-faint)" }}>—</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInput} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={clearBtn}>
            Скинути
          </button>
        )}
      </div>

      <button onClick={run} disabled={loading} style={runBtn}>
        <RefreshCw size={15} strokeWidth={2.5} />
        {loading ? "Рахую… (може зайняти хвилину)" : "Сформувати звіт"}
      </button>

      {error && <div style={errorBox}>{error}</div>}

      {data && (
        <>
          <table style={table}>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} style={tr}>
                  <td style={tdLabel}>{r.label}</td>
                  <td style={tdValue}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)" }}>
            {(data.dateFrom || data.dateTo) && <>Період: {data.dateFrom || "…"} — {data.dateTo || "…"} · </>}
            {data.statusFilter !== "all" && <>Статус: {{ paid: "оплачені", unpaid: "очікують оплати", cancelled: "скасовані" }[data.statusFilter]} · </>}
            Сформовано: {new Date(data.generatedAt).toLocaleString("uk-UA")}
          </div>
        </>
      )}
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
  maxWidth: 560,
};

const dateInput: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--text)",
};

const statusChip: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 20,
  padding: "7px 16px",
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
};

const statusChipActive: React.CSSProperties = {
  background: "var(--amber)",
  borderColor: "var(--amber)",
  color: "#1a1305",
  fontWeight: 600,
};

const clearBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--hairline)",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 12,
  color: "var(--text-muted)",
  cursor: "pointer",
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

const table: React.CSSProperties = {
  marginTop: 24,
  width: "100%",
  borderCollapse: "collapse",
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius)",
  overflow: "hidden",
};

const tr: React.CSSProperties = {
  borderBottom: "1px solid var(--hairline)",
};

const tdLabel: React.CSSProperties = {
  padding: "14px 18px",
  fontSize: 14,
  color: "var(--text-muted)",
};

const tdValue: React.CSSProperties = {
  padding: "14px 18px",
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
  textAlign: "right",
};
