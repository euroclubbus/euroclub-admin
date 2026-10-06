import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { Bus, Search, Send, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { FeedbackMessage, FeedbackThread } from "../lib/types";
import { cityName } from "../lib/cities";
import { sessionHeaders } from "../lib/session";

// Кеп (06.10): «Вхідні» у вигляді месенджера — зліва діалоги, справа чат на всю висоту,
// поле вводу знизу. Історія поїздок — згорнута панель у шапці чату.

// lastMessageAt буває і числом (застосунок), і Firestore Timestamp (адмінка) — звідси був "Invalid Date".
function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtTime(v: unknown) {
  const ms = toMs(v);
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function lastAt(t: FeedbackThread) {
  const last = t.messages?.[t.messages.length - 1];
  return Math.max(toMs(t.lastMessageAt), last?.at || 0);
}
function isUnread(t: FeedbackThread & { adminReadAt?: number }) {
  const last = t.messages?.[t.messages.length - 1];
  return !!last && last.from === "user" && (last.at || 0) > (t.adminReadAt || 0);
}

type Thread = FeedbackThread & { adminReadAt?: number };

interface BackendOrder { oid: string; status: number; legs: { from: string; to: string; date: string | null; open: boolean }[]; dsc: string[] }
const STATUS: Record<number, string> = { 0: "скасовано", 1: "не сплачено", 2: "оплачено", 3: "відбулась" };
function fmtD(iso: string | null) {
  return iso ? iso.split("-").reverse().join(".") : "відкрита дата";
}

function Chat({ thread }: { thread: Thread }) {
  // Кеп (06.10): поїздки — повна історія з беку (client_trips), не trip_reports застосунку.
  const [orders, setOrders] = useState<BackendOrder[] | null>(null);
  const [tripsState, setTripsState] = useState<"loading" | "ok" | "no_oid" | "error">("loading");
  const [showTrips, setShowTrips] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowTrips(false);
    setOrders(null);
    setTripsState("loading");
    let requested = false;
    return onSnapshot(doc(db, "client_trips", thread.userId), (snap) => {
      if (snap.exists()) {
        setOrders((snap.data().orders || []) as BackendOrder[]);
        setTripsState("ok");
        return;
      }
      if (requested) return;
      requested = true;
      fetch("/api/admin?action=clients-sync", { method: "POST", headers: { "Content-Type": "application/json", ...sessionHeaders() }, body: JSON.stringify({ userId: thread.userId }) })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) setTripsState(d.error === "no_oid" ? "no_oid" : "error");
        })
        .catch(() => setTripsState("error"));
    }, () => setTripsState("error")); // напр. немає правила Firestore для client_trips
  }, [thread.userId]);

  const tripCount = (orders || []).filter((o) => o.status !== 0).reduce((n, o) => n + o.legs.filter((l) => !l.open && l.date).length, 0);
  const sortedOrders = [...(orders || [])].sort((a, b) => (b.legs[0]?.date || "").localeCompare(a.legs[0]?.date || ""));

  // Позначаємо діалог прочитаним, коли він відкритий і прийшло нове.
  useEffect(() => {
    if (isUnread(thread)) setDoc(doc(db, "feedback_threads", thread.id), { adminReadAt: Date.now() }, { merge: true }).catch(() => {});
  }, [thread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread.id, thread.messages?.length]);

  async function sendReply() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const msg: FeedbackMessage = { id: crypto.randomUUID(), from: "admin", text, at: Date.now() };
      await setDoc(doc(db, "feedback_threads", thread.id), { userId: thread.userId, lastMessageAt: serverTimestamp(), adminReadAt: Date.now(), messages: arrayUnion(msg) }, { merge: true });
      await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Відповідь від EuroClub", body: text, userIds: [thread.userId], silent: true, type: "service" }),
      }).catch(() => {});
      setReply("");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    const text = editText.trim();
    if (!editId || !text) return;
    const messages = thread.messages.map((m) => (m.id === editId ? { ...m, text, editedAt: Date.now() } : m));
    await setDoc(doc(db, "feedback_threads", thread.id), { messages }, { merge: true });
    setEditId(null);
  }

  async function clearChat() {
    if (!thread.messages.length || !window.confirm("Очистити всю переписку з цим клієнтом? Відновити буде неможливо.")) return;
    await setDoc(doc(db, "feedback_threads", thread.id), { messages: [] }, { merge: true });
  }

  return (
    <div style={s.chat}>
      <div style={s.chatHead}>
        <div style={s.avatar}>{thread.userId.slice(0, 2)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>ID {thread.userId}</div>
          <div style={s.muted}>останнє: {fmtTime(lastAt(thread)) || "—"}</div>
        </div>
        <button style={{ ...s.headBtn, ...(showTrips ? s.headBtnOn : {}) }} onClick={() => setShowTrips((v) => !v)}>
          <Bus size={14} /> {tripsState === "ok" ? `${tripCount} поїздок` : tripsState === "loading" ? "…" : tripsState === "no_oid" ? "немає історії" : "помилка"}
        </button>
        <button style={{ ...s.headBtn, color: "#E5484D" }} onClick={clearChat} title="Очистити чат">
          <Trash2 size={14} />
        </button>
      </div>

      {showTrips && (
        <div style={s.trips}>
          {tripsState === "loading" && <div style={s.muted}>Завантаження з беку…</div>}
          {tripsState === "no_oid" && <div style={s.muted}>Клієнт не має замовлень у застосунку — історію з беку отримати неможливо (потрібен метод «замовлення за user_id»).</div>}
          {tripsState === "error" && <div style={s.muted}>Не вдалося отримати історію з беку.</div>}
          {tripsState === "ok" && sortedOrders.length === 0 && <div style={s.muted}>Замовлень немає</div>}
          {tripsState === "ok" && sortedOrders.map((o) => (
            <div key={o.oid} style={{ ...s.tripRow, opacity: o.status === 0 ? 0.5 : 1 }}>
              {o.legs.map((l, i) => (
                <b key={i}>{cityName(l.from) || l.from} → {cityName(l.to) || l.to} · {l.open ? "відкрита дата" : fmtD(l.date)}</b>
              ))}
              <span style={s.muted}>№{o.oid} · {o.dsc.length} пас. · {STATUS[o.status] ?? `статус ${o.status}`}</span>
            </div>
          ))}
        </div>
      )}

      <div style={s.messages}>
        {thread.messages.length === 0 && <div style={{ ...s.muted, textAlign: "center", marginTop: 40 }}>Повідомлень немає</div>}
        {thread.messages.map((m) => {
          const mine = m.from === "admin";
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div style={{ ...s.bubble, ...(mine ? s.bubbleMine : s.bubbleUser) }}>
                {editId === m.id ? (
                  <>
                    <textarea
                      autoFocus
                      style={s.editArea}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                        if (e.key === "Escape") setEditId(null);
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                      <button style={s.link} onClick={() => setEditId(null)}>Скасувати</button>
                      <button style={{ ...s.link, fontWeight: 700 }} onClick={saveEdit}>Зберегти</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                    <div style={s.meta}>
                      {mine && <button style={s.link} onClick={() => { setEditId(m.id); setEditText(m.text); }}>✎</button>}
                      <span>{fmtTime(m.at)}{(m as FeedbackMessage & { editedAt?: number }).editedAt ? " · ред." : ""}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputRow}>
        <textarea
          style={s.input}
          rows={1}
          placeholder="Повідомлення… (Enter — надіслати, Shift+Enter — новий рядок)"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
          }}
        />
        <button style={s.send} onClick={sendReply} disabled={!reply.trim() || sending}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

export function InboxList() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    return onSnapshot(
      collection(db, "feedback_threads"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Thread, "id">), messages: (d.data().messages || []) as FeedbackMessage[] }));
        list.sort((a, b) => lastAt(b) - lastAt(a));
        setThreads(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  const shown = useMemo(() => threads.filter((t) => !search.trim() || t.userId.includes(search.trim())), [threads, search]);
  const open = threads.find((t) => t.id === openId) || null;

  return (
    <div style={s.shell}>
      <div style={s.side}>
        <div style={s.searchBox}>
          <Search size={14} style={{ opacity: 0.6 }} />
          <input style={s.searchInput} placeholder="Пошук за ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={s.threadList}>
          {loading && <div style={{ ...s.muted, padding: 12 }}>Завантаження…</div>}
          {!loading && shown.length === 0 && <div style={{ ...s.muted, padding: 12 }}>Діалогів немає</div>}
          {shown.map((t) => {
            const last = t.messages[t.messages.length - 1];
            const unread = isUnread(t);
            return (
              <div key={t.id} style={{ ...s.threadRow, ...(t.id === openId ? s.threadRowOn : {}) }} onClick={() => setOpenId(t.id)}>
                <div style={s.avatarSm}>{t.userId.slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontWeight: unread ? 800 : 600 }}>ID {t.userId}</span>
                    <span style={s.muted}>{fmtTime(lastAt(t))}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ ...s.preview, fontWeight: unread ? 600 : 400 }}>{last ? (last.from === "admin" ? "Ви: " : "") + last.text : "—"}</span>
                    {unread && <span style={s.dot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {open ? <Chat thread={open} /> : <div style={{ ...s.chat, alignItems: "center", justifyContent: "center", ...s.muted }}>Оберіть діалог зліва</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { display: "flex", height: "calc(100vh - 210px)", minHeight: 480, border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)" },
  side: { width: 300, flexShrink: 0, borderRight: "1px solid var(--hairline)", display: "flex", flexDirection: "column" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--hairline)" },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 13 },
  threadList: { flex: 1, overflowY: "auto" },
  threadRow: { display: "flex", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--hairline)", fontSize: 13 },
  threadRowOn: { background: "rgba(245,166,35,0.12)" },
  avatarSm: { width: 36, height: 36, borderRadius: "50%", background: "var(--amber)", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 },
  avatar: { width: 38, height: 38, borderRadius: "50%", background: "var(--amber)", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 },
  preview: { color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, fontSize: 12.5 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", flexShrink: 0 },
  chat: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  chatHead: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--hairline)" },
  headBtn: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 },
  headBtnOn: { background: "var(--amber)", color: "#111", borderColor: "var(--amber)" },
  trips: { maxHeight: 220, overflowY: "auto", padding: "8px 14px", borderBottom: "1px solid var(--hairline)", background: "rgba(255,255,255,0.03)" },
  tripRow: { display: "flex", flexDirection: "column", padding: "5px 0", fontSize: 12.5, borderBottom: "1px solid var(--hairline)" },
  messages: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 },
  bubble: { maxWidth: "70%", padding: "8px 12px", borderRadius: 14, fontSize: 14, lineHeight: 1.4 },
  bubbleMine: { background: "var(--amber)", color: "#111", borderBottomRightRadius: 4 },
  bubbleUser: { background: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 },
  meta: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, fontSize: 10.5, opacity: 0.7, marginTop: 3 },
  link: { background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer", fontSize: 11 },
  editArea: { width: 280, minHeight: 60, borderRadius: 8, border: "none", padding: 6, color: "#111", background: "#fff", fontFamily: "inherit", fontSize: 13 },
  inputRow: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--hairline)", alignItems: "flex-end" },
  input: { flex: 1, resize: "none", maxHeight: 140, minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14 },
  send: { width: 44, height: 42, borderRadius: 10, border: "none", background: "var(--amber)", color: "#111", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  muted: { color: "var(--text-muted)", fontSize: 12 },
};
