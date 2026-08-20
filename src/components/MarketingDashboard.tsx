import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { RefreshCw, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { db } from "../lib/firebase";
import { ContractorReportEntry, MetaAdsCampaign, MetaAdsData } from "../lib/types";

const CONTRACTOR_COLLECTION = "marketing_contractor_report";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "менше години тому";
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  return `${days} дн тому`;
}

export function MarketingDashboard() {
  const [data, setData] = useState<MetaAdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("active");

  const [contractor, setContractor] = useState<Record<string, ContractorReportEntry>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSpend, setEditSpend] = useState("");
  const [editLeads, setEditLeads] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadMetaData() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/data/meta-ads.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("no-file");
      const json = (await res.json()) as MetaAdsData;
      setData(json);
    } catch {
      setLoadError(
        "Ще немає даних із Meta Ads. Дані з'являться після першого запуску GitHub Action (sync-meta-ads), або запусти його вручну в GitHub → Actions."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadContractorReport() {
    const snap = await getDocs(collection(db, CONTRACTOR_COLLECTION));
    const map: Record<string, ContractorReportEntry> = {};
    snap.docs.forEach((d) => {
      map[d.id] = { id: d.id, ...(d.data() as Omit<ContractorReportEntry, "id">) };
    });
    setContractor(map);
  }

  useEffect(() => {
    loadMetaData();
    loadContractorReport();
  }, []);

  const campaigns = data?.campaigns ?? [];
  const currency = data?.account.currency ?? "EUR";

  const filtered = useMemo(() => {
    return campaigns
      .filter((c) => {
        if (statusFilter === "active") return c.status === "ACTIVE";
        if (statusFilter === "paused") return c.status !== "ACTIVE";
        return true;
      })
      .sort((a, b) => b.spend - a.spend);
  }, [campaigns, statusFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => {
        acc.spend += c.spend;
        acc.impressions += c.impressions;
        acc.clicks += c.clicks;
        acc.leads += c.leads;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    );
  }, [filtered]);

  function startEdit(c: MetaAdsCampaign) {
    setEditingId(c.id);
    const existing = contractor[c.id];
    setEditSpend(existing?.spend != null ? String(existing.spend) : "");
    setEditLeads(existing?.leads != null ? String(existing.leads) : "");
    setEditNote(existing?.note ?? "");
  }

  async function saveContractorEntry(campaignId: string) {
    setSaving(true);
    try {
      const entry: Omit<ContractorReportEntry, "id"> = {
        spend: editSpend.trim() ? Number(editSpend) : undefined,
        leads: editLeads.trim() ? Number(editLeads) : undefined,
        note: editNote.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, CONTRACTOR_COLLECTION, campaignId), entry);
      setContractor((prev) => ({ ...prev, [campaignId]: { id: campaignId, ...entry } }));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Маркетинг</h1>
          <p style={styles.subtitle}>
            Реальні дані з Meta Ads Manager (останні 30 днів) — з можливістю звірити зі звітом підрядчика.
          </p>
        </div>
        <button style={styles.refreshBtn} onClick={loadMetaData} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Оновити
        </button>
      </header>

      {data && (
        <div style={styles.metaBar}>
          <Clock size={13} color="var(--text-faint)" />
          <span style={styles.metaText}>
            Дані оновлено {timeAgo(data.generatedAt)} · Кабінет: {data.account.name} ({data.account.id})
          </span>
        </div>
      )}

      {loadError && (
        <div style={styles.errorCard}>
          <AlertTriangle size={16} color="var(--text-muted)" />
          <span>{loadError}</span>
        </div>
      )}

      {data && (
        <>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>Витрачено</div>
              <div style={styles.summaryValue}>{formatMoney(totals.spend, currency)}</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>Покази</div>
              <div style={styles.summaryValue}>{formatNumber(totals.impressions)}</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>Кліки</div>
              <div style={styles.summaryValue}>{formatNumber(totals.clicks)}</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>Ліди</div>
              <div style={styles.summaryValue}>{formatNumber(totals.leads)}</div>
            </div>
          </div>

          <div style={styles.filterRow}>
            {(["active", "all", "paused"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  ...styles.filterBtn,
                  background: statusFilter === f ? "var(--amber)" : "var(--surface-raised)",
                  color: statusFilter === f ? "#1a1305" : "var(--text-muted)",
                }}
              >
                {f === "active" ? "Активні" : f === "paused" ? "Призупинені" : "Всі"}
              </button>
            ))}
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Кампанія</th>
                  <th style={styles.th}>Витрати (Meta)</th>
                  <th style={styles.th}>Ліди (Meta)</th>
                  <th style={styles.th}>CTR</th>
                  <th style={styles.th}>Звіт підрядчика</th>
                  <th style={styles.th}>Різниця</th>
                  <th style={styles.th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const cr = contractor[c.id];
                  const spendDiff = cr?.spend != null ? cr.spend - c.spend : null;
                  const leadsDiff = cr?.leads != null ? cr.leads - c.leads : null;
                  const isEditing = editingId === c.id;
                  return (
                    <tr key={c.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={styles.mutedSmall}>
                          {c.status === "ACTIVE" ? "🟢 Активна" : "⏸ Призупинена"} · {c.objective}
                        </div>
                      </td>
                      <td style={styles.td}>{formatMoney(c.spend, currency)}</td>
                      <td style={styles.td}>{formatNumber(c.leads)}</td>
                      <td style={styles.td}>{c.ctr.toFixed(2)}%</td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <div style={styles.editBox}>
                            <input
                              style={styles.editInput}
                              placeholder="Витрати"
                              value={editSpend}
                              onChange={(e) => setEditSpend(e.target.value)}
                              type="number"
                            />
                            <input
                              style={styles.editInput}
                              placeholder="Ліди"
                              value={editLeads}
                              onChange={(e) => setEditLeads(e.target.value)}
                              type="number"
                            />
                            <input
                              style={styles.editInput}
                              placeholder="Нотатка"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button style={styles.saveBtn} onClick={() => saveContractorEntry(c.id)} disabled={saving}>
                                Зберегти
                              </button>
                              <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>
                                Скасувати
                              </button>
                            </div>
                          </div>
                        ) : cr ? (
                          <div>
                            {cr.spend != null && <div>{formatMoney(cr.spend, currency)}</div>}
                            {cr.leads != null && <div style={styles.mutedSmall}>{formatNumber(cr.leads)} лідів</div>}
                            {cr.note && <div style={styles.mutedSmall}>{cr.note}</div>}
                          </div>
                        ) : (
                          <span style={styles.mutedSmall}>не внесено</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {spendDiff != null && (
                          <div style={{ color: Math.abs(spendDiff) > c.spend * 0.1 ? "var(--danger, #d24)" : "var(--text-muted)" }}>
                            {spendDiff > 0 ? "+" : ""}
                            {formatMoney(spendDiff, currency)}
                          </div>
                        )}
                        {leadsDiff != null && (
                          <div style={styles.mutedSmall}>
                            {leadsDiff > 0 ? "+" : ""}
                            {leadsDiff} лідів
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>
                        {!isEditing && (
                          <button style={styles.editLink} onClick={() => startEdit(c)}>
                            {cr ? "Редагувати" : "Внести"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!data && !loadError && loading && <div style={styles.mutedSmall}>Завантаження…</div>}

      <div style={styles.footNote}>
        <TrendingUp size={13} color="var(--text-faint)" />
        <span style={styles.mutedSmall}>
          Дані Meta синхронізуються автоматично раз на добу через GitHub Action. Звіт підрядчика вноситься вручну і
          зберігається окремо для звірки.
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 460 },
  refreshBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 12px", fontSize: 12.5, color: "var(--text)", whiteSpace: "nowrap" },
  metaBar: { display: "flex", alignItems: "center", gap: 6, marginBottom: 20 },
  metaText: { fontSize: 12, color: "var(--text-faint)" },
  errorCard: { display: "flex", alignItems: "flex-start", gap: 8, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 14, fontSize: 13, color: "var(--text-muted)", marginBottom: 20 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 },
  summaryCard: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "14px 16px" },
  summaryLabel: { fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 },
  summaryValue: { fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" },
  filterRow: { display: "flex", gap: 6, marginBottom: 12 },
  filterBtn: { border: "none", borderRadius: "var(--radius)", padding: "7px 14px", fontSize: 12.5, fontWeight: 600 },
  tableWrap: { overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--hairline)", background: "var(--surface)" },
  tr: { borderBottom: "1px solid var(--hairline)" },
  td: { padding: "10px 12px", verticalAlign: "top" },
  mutedSmall: { fontSize: 12, color: "var(--text-faint)" },
  editBox: { display: "flex", flexDirection: "column", gap: 6, minWidth: 160 },
  editInput: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "6px 8px", fontSize: 12.5, color: "var(--text)", outline: "none" },
  saveBtn: { background: "var(--amber)", color: "#1a1305", border: "none", borderRadius: "var(--radius)", padding: "6px 10px", fontSize: 12, fontWeight: 600 },
  cancelBtn: { background: "transparent", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "6px 10px", fontSize: 12, color: "var(--text-muted)" },
  editLink: { background: "transparent", border: "none", color: "var(--amber)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  footNote: { display: "flex", alignItems: "flex-start", gap: 6, marginTop: 16 },
};
