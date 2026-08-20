import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { Search, Download, FileSpreadsheet, AlertTriangle, CheckSquare, Square } from "lucide-react";
import { db } from "../lib/firebase";
import { ContractorReportEntry, MetaAdsCampaign, MetaAdsReportResponse } from "../lib/types";

const CONTRACTOR_COLLECTION = "marketing_contractor_report";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function defaultSince() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultUntil() {
  return new Date().toISOString().slice(0, 10);
}

function toCsv(campaigns: MetaAdsCampaign[], currency: string): string {
  const headers = ["Кампанія", "Ціль", "Витрати", "Покази", "Охоплення", "Кліки", "CTR %", "CPC", "Ліди"];
  const rows = campaigns.map((c) => [
    c.name,
    c.objective,
    c.spend.toFixed(2),
    String(c.impressions),
    String(c.reach),
    String(c.clicks),
    c.ctr.toFixed(2),
    c.cpc.toFixed(2),
    String(c.leads),
  ]);
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MarketingDashboard() {
  const [since, setSince] = useState(defaultSince());
  const [until, setUntil] = useState(defaultUntil());

  const [report, setReport] = useState<MetaAdsReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [contractor, setContractor] = useState<Record<string, ContractorReportEntry>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSpend, setEditSpend] = useState("");
  const [editLeads, setEditLeads] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadReport() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/meta-ads-report?since=${since}&until=${until}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Помилка запиту");
      setReport(json as MetaAdsReportResponse);
      setSelected(new Set((json.campaigns as MetaAdsCampaign[]).map((c) => c.id)));
    } catch (err) {
      setReport(null);
      setLoadError(err instanceof Error ? err.message : "Не вдалося завантажити дані");
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
    loadContractorReport();
  }, []);

  const campaigns = report?.campaigns ?? [];
  const currency = report?.account.currency ?? "EUR";

  const selectedCampaigns = useMemo(() => campaigns.filter((c) => selected.has(c.id)), [campaigns, selected]);

  const totals = useMemo(() => {
    return selectedCampaigns.reduce(
      (acc, c) => {
        acc.spend += c.spend;
        acc.impressions += c.impressions;
        acc.clicks += c.clicks;
        acc.leads += c.leads;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    );
  }, [selectedCampaigns]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === campaigns.length ? new Set() : new Set(campaigns.map((c) => c.id))));
  }

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

  function exportCsv() {
    downloadFile(toCsv(selectedCampaigns, currency), `meta-ads_${since}_${until}.csv`, "text/csv;charset=utf-8");
  }

  function exportJson() {
    downloadFile(
      JSON.stringify({ range: { since, until }, account: report?.account, campaigns: selectedCampaigns }, null, 2),
      `meta-ads_${since}_${until}.json`,
      "application/json"
    );
  }

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Маркетинг</h1>
          <p style={styles.subtitle}>Обери діапазон дат — покажу всі кампанії, що працювали за цей період.</p>
        </div>
      </header>

      <div style={styles.rangeBar}>
        <label style={styles.rangeLabel}>
          Від
          <input style={styles.dateInput} type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label style={styles.rangeLabel}>
          До
          <input style={styles.dateInput} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <button style={styles.showBtn} onClick={loadReport} disabled={loading}>
          <Search size={14} /> {loading ? "Завантаження…" : "Показати кампанії"}
        </button>
      </div>

      {loadError && (
        <div style={styles.errorCard}>
          <AlertTriangle size={16} color="var(--text-muted)" />
          <span>{loadError}</span>
        </div>
      )}

      {report && (
        <>
          <div style={styles.metaBar}>
            Кабінет: {report.account.name} ({report.account.id}) · Період: {since} — {until}
          </div>

          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>Витрачено (обрані)</div>
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

          <div style={styles.toolbar}>
            <button style={styles.toolbarBtn} onClick={toggleAll}>
              {selected.size === campaigns.length ? <CheckSquare size={14} /> : <Square size={14} />}
              {selected.size === campaigns.length ? "Зняти всі" : "Обрати всі"} ({selected.size}/{campaigns.length})
            </button>
            <div style={{ flex: 1 }} />
            <button style={styles.toolbarBtn} onClick={exportCsv} disabled={selectedCampaigns.length === 0}>
              <FileSpreadsheet size={14} /> CSV / Excel
            </button>
            <button style={styles.toolbarBtn} onClick={exportJson} disabled={selectedCampaigns.length === 0}>
              <Download size={14} /> JSON
            </button>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th} />
                  <th style={styles.th}>Кампанія</th>
                  <th style={styles.th}>Витрати</th>
                  <th style={styles.th}>Ліди</th>
                  <th style={styles.th}>CTR</th>
                  <th style={styles.th}>Звіт підрядчика</th>
                  <th style={styles.th}>Різниця</th>
                  <th style={styles.th} />
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 && (
                  <tr>
                    <td style={styles.td} colSpan={8}>
                      За обраний період не знайдено кампаній з активністю.
                    </td>
                  </tr>
                )}
                {campaigns.map((c) => {
                  const cr = contractor[c.id];
                  const spendDiff = cr?.spend != null ? cr.spend - c.spend : null;
                  const leadsDiff = cr?.leads != null ? cr.leads - c.leads : null;
                  const isEditing = editingId === c.id;
                  const isSelected = selected.has(c.id);
                  return (
                    <tr key={c.id} style={styles.tr}>
                      <td style={styles.td}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.id)} />
                      </td>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={styles.mutedSmall}>{c.objective}</div>
                      </td>
                      <td style={styles.td}>{formatMoney(c.spend, currency)}</td>
                      <td style={styles.td}>{formatNumber(c.leads)}</td>
                      <td style={styles.td}>{c.ctr.toFixed(2)}%</td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <div style={styles.editBox}>
                            <input style={styles.editInput} placeholder="Витрати" value={editSpend} onChange={(e) => setEditSpend(e.target.value)} type="number" />
                            <input style={styles.editInput} placeholder="Ліди" value={editLeads} onChange={(e) => setEditLeads(e.target.value)} type="number" />
                            <input style={styles.editInput} placeholder="Нотатка" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button style={styles.saveBtn} onClick={() => saveContractorEntry(c.id)} disabled={saving}>Зберегти</button>
                              <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>Скасувати</button>
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
                            {spendDiff > 0 ? "+" : ""}{formatMoney(spendDiff, currency)}
                          </div>
                        )}
                        {leadsDiff != null && (
                          <div style={styles.mutedSmall}>{leadsDiff > 0 ? "+" : ""}{leadsDiff} лідів</div>
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

      {!report && !loadError && !loading && (
        <div style={styles.mutedSmall}>Обери діапазон дат і натисни "Показати кампанії".</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { marginBottom: 16 },
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 460 },
  rangeBar: { display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 14 },
  rangeLabel: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: "var(--text-muted)" },
  dateInput: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none" },
  showBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--amber)", color: "#1a1305", border: "none", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  errorCard: { display: "flex", alignItems: "flex-start", gap: 8, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 14, fontSize: 13, color: "var(--text-muted)", marginBottom: 20 },
  metaBar: { fontSize: 12, color: "var(--text-faint)", marginBottom: 16 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 },
  summaryCard: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "14px 16px" },
  summaryLabel: { fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 },
  summaryValue: { fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" },
  toolbar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  toolbarBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "7px 12px", fontSize: 12.5, color: "var(--text)" },
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
};
