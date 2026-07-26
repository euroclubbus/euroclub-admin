import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { ChevronDown, ChevronRight, History, Search } from "lucide-react";
import { db } from "../lib/firebase";
import { OrderRegistryDoc, OrderRegistryEdit } from "../lib/types";

function fmtDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OrderRow({ order }: { order: OrderRegistryDoc }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  async function saveEdit(passengerIndex: number, field: "discountId" | "tariff", oldValue: string | number, newValue: string | number) {
    if (String(oldValue) === String(newValue)) return;
    setSavingIdx(passengerIndex);
    try {
      const ref = doc(db, "order_registry", order.orderNo);
      const snap = await getDoc(ref);
      const current = (snap.data() as OrderRegistryDoc) || order;
      const passengers = current.passengers.map((p) =>
        p.index === passengerIndex ? { ...p, [field]: field === "tariff" ? Number(newValue) : String(newValue) } : p
      );
      const edit: OrderRegistryEdit = { at: new Date().toISOString(), passengerIndex, field, oldValue, newValue };
      const editHistory = [...(current.editHistory || []), edit];
      await updateDoc(ref, { passengers, editHistory });
    } finally {
      setSavingIdx(null);
    }
  }

  const allHistory = [...(order.editHistory || [])].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div style={styles.row}>
      <button onClick={() => setOpen((o) => !o)} style={styles.rowHeader}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={styles.orderNo}>№ {order.orderNo}</div>
          <div style={styles.rowMeta}>
            {order.fromCity} → {order.toCity} · {order.tripDate}
            {order.roundTrip && order.tripDate2 ? ` · назад ${order.tripDate2}` : ""} · {order.passengers?.length ?? 0} пас.
          </div>
        </div>
        <div style={styles.createdAt}>{fmtDateTime(order.createdAt)}</div>
      </button>

      {open && (
        <div style={styles.detail}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Пасажир</th>
                <th style={styles.th}>Квиток</th>
                <th style={styles.th}>Тип</th>
                <th style={styles.th}>Знижка</th>
                <th style={styles.th}>Тариф</th>
              </tr>
            </thead>
            <tbody>
              {order.passengers?.map((p) => {
                const isFull = String(p.discountId) === "0";
                return (
                  <tr key={p.index}>
                    <td style={styles.td}>Пасажир {p.index}</td>
                    <td style={styles.td}>{p.ticketNumber || "—"}</td>
                    <td style={styles.td}>{isFull ? "Повний" : "Зі знижкою"}</td>
                    <td style={styles.td}>
                      <select
                        value={isFull ? "0" : "custom"}
                        onChange={(e) => {
                          if (e.target.value === "0") saveEdit(p.index, "discountId", p.discountId, "0");
                        }}
                        style={styles.select}
                        disabled={savingIdx === p.index}
                      >
                        <option value="0">Повний тариф (0)</option>
                        <option value="custom">Зі знижкою…</option>
                      </select>
                      {!isFull && (
                        <input
                          type="text"
                          defaultValue={p.discountId}
                          onBlur={(e) => saveEdit(p.index, "discountId", p.discountId, e.target.value)}
                          placeholder="код знижки"
                          style={{ ...styles.input, width: 70, marginTop: 4 }}
                          disabled={savingIdx === p.index}
                        />
                      )}
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        defaultValue={p.tariff}
                        onBlur={(e) => saveEdit(p.index, "tariff", p.tariff, Number(e.target.value))}
                        style={{ ...styles.input, width: 90 }}
                        disabled={savingIdx === p.index}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button onClick={() => setShowHistory((s) => !s)} style={styles.historyToggle}>
            <History size={13} /> Історія правок ({allHistory.length})
          </button>
          {showHistory && (
            <div style={styles.historyList}>
              {allHistory.length === 0 && <div style={styles.mutedSmall}>Ще нема правок</div>}
              {allHistory.map((e, i) => (
                <div key={i} style={styles.historyItem}>
                  {fmtDateTime(e.at)} — Пасажир {e.passengerIndex}, {e.field === "tariff" ? "тариф" : "знижка"}: {String(e.oldValue)} → {String(e.newValue)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OrderRegistry() {
  const [orders, setOrders] = useState<OrderRegistryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = query(collection(db, "order_registry"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ ...(d.data() as OrderRegistryDoc), orderNo: d.id })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return orders;
    return orders.filter((o) => o.orderNo.includes(s));
  }, [orders, search]);

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>Реєстр замовлень</h1>
        <p style={styles.subtitle}>
          Усі замовлення (в один і в два боки). Редагування знижки/тарифу тут поки що не передається назад на
          бекенд автоматично — веди значення однаковими вручну в обох місцях, поки не буде готовий API-метод.
        </p>
      </header>

      <div style={styles.searchBar}>
        <Search size={15} color="var(--text-faint)" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за номером замовлення…"
          style={styles.searchInput}
        />
      </div>

      {loading && <div style={styles.empty}>Завантаження…</div>}
      {!loading && filtered.length === 0 && <div style={styles.empty}>Замовлень не знайдено.</div>}

      <div style={styles.list}>
        {filtered.map((o) => (
          <OrderRow key={o.orderNo} order={o} />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 520 },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 16 },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13.5 },
  empty: { border: "1px dashed var(--hairline)", borderRadius: "var(--radius)", padding: "28px 20px", color: "var(--text-muted)", fontSize: 13.5, textAlign: "center" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden" },
  rowHeader: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)" },
  orderNo: { fontSize: 13.5, fontWeight: 700 },
  rowMeta: { fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 },
  createdAt: { fontSize: 11, color: "var(--text-faint)", flexShrink: 0 },
  detail: { padding: "0 14px 14px", borderTop: "1px solid var(--hairline)" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10 },
  th: { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-faint)", padding: "6px 8px", borderBottom: "1px solid var(--hairline)" },
  td: { padding: "8px 8px", fontSize: 12.5, borderBottom: "1px solid var(--hairline)", verticalAlign: "top" },
  select: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "4px 6px", fontSize: 12, color: "var(--text)" },
  input: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "4px 6px", fontSize: 12, color: "var(--text)" },
  historyToggle: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, marginTop: 10, cursor: "pointer", padding: 0 },
  historyList: { marginTop: 8, display: "flex", flexDirection: "column", gap: 4 },
  historyItem: { fontSize: 11.5, color: "var(--text-faint)" },
  mutedSmall: { fontSize: 11.5, color: "var(--text-faint)" },
};
