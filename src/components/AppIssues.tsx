import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, orderBy, query, limit } from "firebase/firestore";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { db } from "../lib/firebase";

// Кеп (18.09): ЗАГАЛЬНИЙ механізм — коли застосунок натикається на ситуацію "не знаю, що
// з цим робити" (бракує даних), пише в app_issues (issueReporting.ts). Тут — список, щоб
// бачити прогалини по факту, не чекаючи скарги користувача. Використовується для БУДЬ-ЯКОЇ
// майбутньої ситуації такого типу, не тільки для знижок.

interface AppIssueDoc {
  id: string;
  type: string;
  context: string;
  data: Record<string, any>;
  createdAt?: any;
  resolved: boolean;
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  return null;
}

export function AppIssues() {
  const [docs, setDocs] = useState<AppIssueDoc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "app_issues"), orderBy("createdAt", "desc"), limit(500)));
      setDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markResolved = async (id: string, resolved: boolean) => {
    await updateDoc(doc(db, "app_issues", id), { resolved });
    setDocs((prev) => prev?.map((d) => (d.id === id ? { ...d, resolved } : d)) || null);
  };

  const filtered = (docs || []).filter((d) => showResolved || !d.resolved);
  const unresolvedCount = (docs || []).filter((d) => !d.resolved).length;

  return (
    <div>
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            Проблеми застосунку {unresolvedCount > 0 && <span style={{ color: "var(--danger, #E53935)" }}>({unresolvedCount})</span>}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 560 }}>
            Ситуації, коли застосунок не знав, як обробити дані (напр. невідома категорія знижки), і показав
            загальний варіант замість справжнього. Позначай "Вирішено" після виправлення причини.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Показати вирішені
          </label>
          <button onClick={load} disabled={loading} style={styles.refreshBtn}>
            {loading ? "Оновлюю…" : "Оновити"}
          </button>
        </div>
      </header>

      {filtered.length === 0 && !loading && (
        <div style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
          {showResolved ? "Немає записів." : "Немає невирішених проблем 🎉"}
        </div>
      )}

      {filtered.map((d) => (
        <div
          key={d.id}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius)",
            padding: 14,
            marginBottom: 10,
            opacity: d.resolved ? 0.55 : 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <AlertTriangle size={14} color={d.resolved ? "var(--text-faint)" : "#F5A623"} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>{d.type}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{tsToDate(d.createdAt)?.toLocaleString("uk-UA") || ""}</span>
              </div>
              <div style={{ fontSize: 13.5, marginBottom: 6 }}>{d.context}</div>
              {d.data && Object.keys(d.data).length > 0 && (
                <pre style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface-raised)", padding: 8, borderRadius: 6, margin: 0, overflowX: "auto" }}>
                  {JSON.stringify(d.data, null, 2)}
                </pre>
              )}
            </div>
            <button
              onClick={() => markResolved(d.id, !d.resolved)}
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                background: d.resolved ? "var(--surface-raised)" : "#E8F5E9",
                border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "6px 12px",
                fontSize: 12, color: d.resolved ? "var(--text-muted)" : "#43A047", cursor: "pointer",
              }}
            >
              <CheckCircle2 size={14} />
              {d.resolved ? "Повернути" : "Вирішено"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  refreshBtn: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", cursor: "pointer" },
};
