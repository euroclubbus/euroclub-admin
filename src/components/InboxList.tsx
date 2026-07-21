import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, setDoc, where, arrayUnion, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { db } from "../lib/firebase";
import { FeedbackMessage, FeedbackThread, TripReport } from "../lib/types";

function fmtTime(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ThreadDetail({ thread, onBack }: { thread: FeedbackThread; onBack: () => void }) {
  const [trips, setTrips] = useState<TripReport[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "trip_reports"), where("userId", "==", thread.userId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TripReport, "id">) }));
        list.sort((a, b) => (b.bookingDate || "").localeCompare(a.bookingDate || ""));
        setTrips(list);
        setLoadingTrips(false);
      },
      () => setLoadingTrips(false)
    );
    return unsub;
  }, [thread.userId]);

  async function sendReply() {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const msg: FeedbackMessage = { id: crypto.randomUUID(), from: "admin", text: reply.trim(), at: Date.now() };
      await setDoc(
        doc(db, "feedback_threads", thread.id),
        { userId: thread.userId, lastMessageAt: serverTimestamp(), messages: arrayUnion(msg) },
        { merge: true }
      );
      await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Відповідь від EuroClub",
          body: reply.trim(),
          userIds: [thread.userId],
          silent: true,
        }),
      }).catch(() => {
        // якщо push не долетів — повідомлення все одно збережене в треді, юзер побачить при вході
      });
      setReply("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <button style={styles.backBtn} onClick={onBack}>
        ← Усі звернення
      </button>

      <div style={styles.threadHeader}>
        <div style={styles.avatar}>{thread.userId.slice(0, 2).toUpperCase()}</div>
        <div>
          <div style={styles.threadTitle}>ID {thread.userId}</div>
          <div style={styles.threadMeta}>Останнє повідомлення: {fmtTime(thread.lastMessageAt)}</div>
        </div>
      </div>

      <div style={styles.tripHistory}>
        <div style={styles.sectionTitle}>Історія поїздок</div>
        {loadingTrips && <div style={styles.mutedSmall}>Завантаження…</div>}
        {!loadingTrips && trips.length === 0 && <div style={styles.mutedSmall}>Поїздок не знайдено</div>}
        {trips.slice(0, 8).map((t) => (
          <div key={t.id} style={styles.tripRow}>
            <span style={{ fontWeight: 600 }}>{t.direction}</span>
            <span style={styles.mutedSmall}>
              {t.tripDate} · {t.passengerCount ?? "?"} пас. · {t.roundTrip ? "туди-назад" : "в один бік"}
              {t.discountIds && t.discountIds.every((d) => d === "0") ? " · без фіксованих знижок" : ""}
            </span>
          </div>
        ))}
      </div>

      <div style={styles.sectionTitle}>Переписка</div>
      <div style={styles.messages}>
        {thread.messages.map((m) => (
          <div key={m.id} style={{ ...styles.messageBubble, ...(m.from === "admin" ? styles.messageAdmin : styles.messageUser) }}>
            <div>{m.text}</div>
            <div style={styles.messageTime}>{fmtTime(m.at)}</div>
          </div>
        ))}
        {thread.messages.length === 0 && <div style={styles.mutedSmall}>Повідомлень ще нема</div>}
      </div>

      <div style={styles.replyRow}>
        <input
          style={styles.replyInput}
          placeholder="Відповісти push-повідомленням…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendReply()}
        />
        <button style={styles.sendBtn} onClick={sendReply} disabled={!reply.trim() || sending}>
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

export function InboxList() {
  const [threads, setThreads] = useState<FeedbackThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "feedback_threads"), orderBy("lastMessageAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setThreads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackThread, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const openThread = openId ? threads.find((t) => t.id === openId) : null;
  if (openThread) return <ThreadDetail thread={openThread} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>Вхідні</h1>
        <p style={styles.subtitle}>
          Звернення користувачів — тільки ID (без email/телефону, ми лише транзитна ланка). Відповідь іде push-ом.
        </p>
      </header>

      {loading && <div style={styles.empty}>Завантаження…</div>}
      {!loading && threads.length === 0 && <div style={styles.empty}>Звернень ще нема.</div>}

      <div style={styles.list}>
        {threads.map((t) => {
          const last = t.messages?.[t.messages.length - 1];
          return (
            <div key={t.id} style={styles.row} onClick={() => setOpenId(t.id)}>
              <div style={styles.avatarSm}>
                <MessageCircle size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowLabel}>ID {t.userId}</div>
                <div style={styles.rowMeta}>{last ? (last.from === "admin" ? "Ви: " : "") + last.text : "—"}</div>
              </div>
              <div style={styles.rowTime}>{fmtTime(t.lastMessageAt)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 460 },
  empty: { border: "1px dashed var(--hairline)", borderRadius: "var(--radius)", padding: "28px 20px", color: "var(--text-muted)", fontSize: 13.5, textAlign: "center" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "12px 14px", cursor: "pointer" },
  avatarSm: { width: 32, height: 32, borderRadius: "50%", background: "var(--surface-raised)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 },
  rowLabel: { fontSize: 13.5, fontWeight: 600 },
  rowMeta: { fontSize: 12, color: "var(--text-faint)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowTime: { fontSize: 11, color: "var(--text-faint)", flexShrink: 0 },
  backBtn: { background: "none", border: "none", color: "var(--text-muted)", fontSize: 12.5, marginBottom: 16, padding: 0, cursor: "pointer" },
  threadHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "var(--amber)", color: "#1a1305", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  threadTitle: { fontSize: 16, fontWeight: 700 },
  threadMeta: { fontSize: 12, color: "var(--text-faint)" },
  tripHistory: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 14, marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 },
  mutedSmall: { fontSize: 12, color: "var(--text-faint)" },
  tripRow: { display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: "1px solid var(--hairline)", fontSize: 12.5 },
  messages: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: 320, overflowY: "auto" },
  messageBubble: { maxWidth: "75%", borderRadius: "var(--radius)", padding: "8px 12px", fontSize: 13 },
  messageUser: { alignSelf: "flex-start", background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)" },
  messageAdmin: { alignSelf: "flex-end", background: "var(--amber)", color: "#1a1305" },
  messageTime: { fontSize: 10, opacity: 0.6, marginTop: 3 },
  replyRow: { display: "flex", gap: 8 },
  replyInput: { flex: 1, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 13.5, color: "var(--text)", outline: "none" },
  sendBtn: { background: "var(--amber)", border: "none", borderRadius: "var(--radius)", width: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1305" },
};
