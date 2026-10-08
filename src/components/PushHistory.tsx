import { sessionHeaders } from "../lib/session";
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { PushCampaign } from "../lib/types";

const COLLECTION = "push_campaigns";

function formatDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<PushCampaign["status"], string> = {
  sent: "ДОСТАВЛЕНО",
  partial: "ЧАСТКОВО",
  failed: "ПОМИЛКА",
};

const STATUS_COLOR: Record<PushCampaign["status"], string> = {
  sent: "var(--success)",
  partial: "var(--amber)",
  failed: "var(--danger)",
};

export function PushHistory({ refreshKey, senderId }: { refreshKey: number; senderId?: string }) {
  const [campaigns, setCampaigns] = useState<PushCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  // Кеп (08.10): реакції в застосунку (👍/👎) і прочитання — по кожній розсилці і загалом.
  type St = { sent: number; read: number; like: number; dislike: number };
  const [stats, setStats] = useState<{ by: Record<string, St>; total: St } | null>(null);
  useEffect(() => {
    fetch("/api/admin?action=push-stats", { headers: sessionHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, [refreshKey]);
  const statFor = (c: PushCampaign): St | null => stats ? stats.by[`id:${c.id}`] || stats.by[`t:${c.title}|${c.body}`] || null : null;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("sentAt", "desc"), limit(30));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCampaigns(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PushCampaign, "id">) }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // refreshKey навмисно не є залежністю логіки — onSnapshot вже живий,
    // але тримаємо проп, щоб батьківський компонент міг форсувати ререндер
    // одразу після відправки, не чекаючи затримки мережі.
  }, [refreshKey]);

  return (
    <div>
      {stats && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 14px", marginBottom: 12, border: "1px solid var(--hairline)", borderRadius: "var(--radius)", fontSize: 13 }}>
          <span>Загалом сповіщень: <b>{stats.total.sent}</b></span>
          <span>Прочитано: <b>{stats.total.read}</b> ({pct(stats.total.read, stats.total.sent)})</span>
          <span>👍 <b>{stats.total.like}</b></span>
          <span>👎 <b>{stats.total.dislike}</b></span>
          <span>Задоволених серед оцінок: <b>{pct(stats.total.like, stats.total.like + stats.total.dislike)}</b></span>
        </div>
      )}
      <div style={styles.boardHeader}>
        <span>ЗАГОЛОВОК</span>
        <span style={styles.colWhen}>КОЛИ</span>
        <span style={styles.colCount}>ОТРИМАЛИ</span>
        <span style={styles.colStatus}>СТАТУС</span>
      </div>

      {loading && <div style={styles.empty}>Завантаження…</div>}

      {!loading && campaigns.length === 0 && (
        <div style={styles.empty}>Розсилок ще не було.</div>
      )}

      <div style={styles.board}>
        {campaigns.filter((c) => !senderId || c.senderId === senderId).map((c, i) => (
          <div
            key={c.id}
            style={{
              ...styles.row,
              animation: `flicker-in 0.4s ease-out ${i * 0.03}s both`,
            }}
          >
            <div style={styles.title}>
              <div>{c.title}</div>
              <div style={styles.body}>{c.body}</div>
              <div style={{ ...styles.body, opacity: 0.7, marginTop: 2 }}>
                {c.senderName ? `${c.senderName} · ` : ""}{c.segmentLabel ? `Сегмент: ${c.segmentLabel}` : c.segment ? `Сегмент: ${c.segment} клієнтів` : "Всім"}
                {c.bypass ? " · без модерації" : ""}
                {(() => { const st = statFor(c); return st ? ` · прочитали ${st.read}/${st.sent} · 👍 ${st.like} · 👎 ${st.dislike}` : ""; })()}{c.dedupSkipped ? ` · пропущено дублів ${c.dedupSkipped}` : ""}
              </div>
            </div>
            <div style={{ ...styles.mono, ...styles.colWhen }}>{formatDate(c.sentAt)}</div>
            <div style={{ ...styles.mono, ...styles.colCount }}>
              {c.successCount}/{c.targetCount}
            </div>
            <div style={styles.colStatus}>
              <span style={{ ...styles.statusPill, color: STATUS_COLOR[c.status] }}>
                {STATUS_LABEL[c.status]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  boardHeader: {
    display: "flex",
    fontSize: 10.5,
    letterSpacing: "0.08em",
    color: "var(--text-faint)",
    padding: "0 14px 8px",
    borderBottom: "1px solid var(--hairline)",
    marginBottom: 4,
  },
  colWhen: { width: 100, flexShrink: 0 },
  colCount: { width: 90, flexShrink: 0, fontFamily: "var(--font-mono)" },
  colStatus: { width: 110, flexShrink: 0, textAlign: "right" },
  empty: {
    border: "1px dashed var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "28px 20px",
    color: "var(--text-muted)",
    fontSize: 13.5,
    textAlign: "center",
    marginTop: 8,
  },
  board: {
    display: "flex",
    flexDirection: "column",
  },
  row: {
    display: "flex",
    alignItems: "center",
    padding: "12px 14px",
    borderBottom: "1px dashed var(--hairline)",
    fontSize: 13.5,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    fontSize: 12,
    color: "var(--text-faint)",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mono: {
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    fontSize: 13,
  },
  statusPill: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    letterSpacing: "0.06em",
  },
};
