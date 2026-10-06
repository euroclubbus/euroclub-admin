import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Zap } from "lucide-react";
import { apiGet, apiPost, AuthError, Chat, CHANNELS, DEAL_STATUSES, EcrmUser, Message, STATUS_LABELS } from "./api";

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год`;
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}
function hm(iso: string) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return today ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface Seg { total: number; new_count: number; unread: number; online?: number }

export function Chats({ me, onAuthLost }: { me: EcrmUser; onAuthLost: () => void }) {
  const [segment, setSegment] = useState<"site" | "social">("social");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [segs, setSegs] = useState<{ site: Seg; social: Seg } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const guard = useCallback((e: unknown) => {
    if (e instanceof AuthError) onAuthLost();
    else setError(e instanceof Error ? e.message : "Помилка");
  }, [onAuthLost]);

  const loadList = useCallback(async () => {
    try {
      const q = new URLSearchParams({ action: "list", segment, ...(status ? { status } : {}), ...(channel ? { channel } : {}) });
      const [l, s] = await Promise.all([apiGet<{ data: Chat[] }>(`/api/chats?${q}`), apiGet<{ data: { site: Seg; social: Seg } }>("/api/stats?action=segments")]);
      setChats(l.data || []);
      setSegs(s.data);
      setError("");
    } catch (e) { guard(e); }
  }, [segment, status, channel, guard]);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 5000);
    return () => clearInterval(t);
  }, [loadList]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => [c.visitor_name, c.phone, c.email, c.route, String(c.id)].some((v) => (v || "").toLowerCase().includes(q)));
  }, [chats, search]);
  const open = chats.find((c) => c.id === openId) || null;

  return (
    <div>
      <div style={s.cards}>
        {(["social", "site"] as const).map((k) => {
          const d = segs?.[k];
          return (
            <button key={k} onClick={() => { setSegment(k); setOpenId(null); }} style={{ ...s.card, ...(segment === k ? s.cardOn : {}) }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{k === "social" ? "Соцмережі та месенджери" : "Сайт"}</div>
              <div style={s.cardNums}>
                <span><b>{d?.total ?? "…"}</b> чатів</span>
                <span><b>{d?.new_count ?? "…"}</b> нових</span>
                <span><b>{d?.unread ?? "…"}</b> непрочитаних</span>
                {k === "site" && <span><b>{d?.online ?? 0}</b> онлайн</span>}
              </div>
            </button>
          );
        })}
      </div>
      {error && <div style={{ color: "#E5484D", fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={s.shell}>
        <div style={s.side}>
          <div style={s.searchBox}>
            <Search size={14} style={{ opacity: 0.6 }} />
            <input style={s.searchInput} placeholder="Ім'я, телефон, маршрут…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--hairline)" }}>
            <select style={s.sel} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Всі статуси</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select style={s.sel} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Всі канали</option>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {shown.length === 0 && <div style={{ ...s.muted, padding: 12 }}>Чатів немає</div>}
            {shown.map((c) => {
              const ch = CHANNELS[c.channel] || { label: c.channel, color: "#888" };
              return (
                <div key={c.id} onClick={() => setOpenId(c.id)} style={{ ...s.row, ...(c.id === openId ? s.rowOn : {}) }}>
                  <div style={{ ...s.avatar, background: ch.color }}>{(c.visitor_name || "?").slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontWeight: c.unread ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.visitor_name || `Гість #${c.visitor_id}`}</span>
                      <span style={s.muted}>{ago(c.last_msg_at)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                      <span style={{ ...s.badge, color: ch.color, borderColor: ch.color }}>{ch.label}</span>
                      <span style={{ ...s.badge, ...(c.status === "new" ? { color: "#22C55E", borderColor: "#22C55E" } : {}) }}>{STATUS_LABELS[c.status] || c.status}</span>
                      {c.manager_name && <span style={s.muted}>{c.manager_name}</span>}
                      {c.unread > 0 && <span style={s.unread}>{c.unread}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {open ? <ChatWindow key={open.id} chat={open} me={me} onChanged={loadList} guard={guard} /> : <div style={{ ...s.chat, alignItems: "center", justifyContent: "center", ...s.muted }}>Оберіть чат зліва</div>}
      </div>
    </div>
  );
}

function ChatWindow({ chat, me, onChanged, guard }: { chat: Chat; me: EcrmUser; onChanged: () => void; guard: (e: unknown) => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<{ id: number; category: string; body: string }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ messages: Message[] }>(`/api/chats?action=get&id=${chat.id}`);
      setMsgs(d.messages || []);
    } catch (e) { guard(e); }
  }, [chat.id, guard]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    apiGet<{ data: typeof qr }>("/api/quick-replies?action=list").then((d) => setQr(d.data || [])).catch(() => {});
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (msgs.length !== lastCount.current) bottom.current?.scrollIntoView({ block: "end" });
    lastCount.current = msgs.length;
  }, [msgs.length]);

  async function send(body = text) {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true);
    try {
      await apiPost("/api/messages?action=send", { chat_id: chat.id, body: b });
      setText("");
      await load();
      onChanged();
    } catch (e) { guard(e); } finally { setSending(false); }
  }

  const ch = CHANNELS[chat.channel] || { label: chat.channel, color: "#888" };
  const grouped = qr.reduce<Record<string, string[]>>((a, r) => ((a[r.category] = a[r.category] || []).push(r.body), a), {});

  return (
    <>
      <div style={s.chat}>
        <div style={s.head}>
          <div style={{ ...s.avatar, background: ch.color }}>{(chat.visitor_name || "?").slice(0, 1).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{chat.visitor_name || `Гість #${chat.visitor_id}`}</div>
            <div style={s.muted}>{ch.label} · {STATUS_LABELS[chat.status]}{chat.manager_name ? ` · ${chat.manager_name}` : ""}</div>
          </div>
          {!chat.manager_id && (
            <button style={s.primary} onClick={() => apiPost("/api/chats?action=assign", { id: chat.id }).then(onChanged).catch(guard)}>Взяти в роботу</button>
          )}
          <select
            style={s.sel}
            value={chat.status}
            onChange={(e) => apiPost("/api/chats?action=update", { id: chat.id, status: e.target.value }).then(onChanged).catch(guard)}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={s.msgs}>
          {msgs.length === 0 && <div style={{ ...s.muted, textAlign: "center", marginTop: 40 }}>Повідомлень немає</div>}
          {msgs.map((m) => {
            const mine = m.sender_type === "manager";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ ...s.bubble, ...(mine ? s.mine : s.theirs) }}>
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                  <div style={s.meta}>{hm(m.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
        {qrOpen && (
          <div style={s.qrPanel}>
            {Object.keys(grouped).length === 0 && <div style={s.muted}>Швидких відповідей ще немає — додай у вкладці «Швидкі відповіді».</div>}
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat} style={{ marginBottom: 6 }}>
                <div style={{ ...s.muted, fontWeight: 700, marginBottom: 3 }}>{cat}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {list.map((b, i) => <button key={i} style={s.qrBtn} onClick={() => { setText(b); setQrOpen(false); }}>{b}</button>)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={s.inputRow}>
          <button style={{ ...s.iconBtn, ...(qrOpen ? { background: "var(--amber)", color: "#111" } : {}) }} onClick={() => setQrOpen((v) => !v)} title="Швидкі відповіді"><Zap size={16} /></button>
          <textarea
            style={s.input}
            rows={1}
            placeholder={`Відповідь у ${ch.label}… (Enter — надіслати, Shift+Enter — новий рядок)`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button style={s.send} disabled={!text.trim() || sending} onClick={() => send()}><Send size={16} /></button>
        </div>
      </div>
      <CrmPanel chat={chat} onChanged={onChanged} guard={guard} me={me} />
    </>
  );
}

function CrmPanel({ chat, onChanged, guard }: { chat: Chat; onChanged: () => void; guard: (e: unknown) => void; me: EcrmUser }) {
  const [f, setF] = useState({ name: chat.visitor_name || "", phone: chat.phone || "", email: chat.email || "", route: chat.route || "", trip_date: chat.trip_date || "", order_value: chat.order_value || "", notes: chat.notes || "" });
  const [saved, setSaved] = useState("");
  const save = (field: keyof typeof f | "deal_status", value: string) =>
    apiPost("/api/chats?action=update", { id: chat.id, [field]: value })
      .then(() => { setSaved("Збережено"); setTimeout(() => setSaved(""), 1500); onChanged(); })
      .catch(guard);
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label style={s.lbl}>
      {label}
      <input style={s.field} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => f[k] !== ((chat as any)[k === "name" ? "visitor_name" : k] || "") && save(k, f[k])} />
    </label>
  );
  return (
    <div style={s.crm}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <b>Клієнт</b>
        <span style={{ ...s.muted, color: "#22C55E" }}>{saved}</span>
      </div>
      {field("name", "Ім'я")}
      {field("phone", "Телефон", "tel")}
      {field("email", "Email", "email")}
      <div style={{ height: 8 }} />
      <b style={{ marginBottom: 6 }}>Угода</b>
      <label style={s.lbl}>
        Статус угоди
        <select style={s.field} value={chat.deal_status || "new"} onChange={(e) => save("deal_status", e.target.value)}>
          {Object.entries(DEAL_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {field("route", "Маршрут")}
      {field("trip_date", "Дата поїздки")}
      {field("order_value", "Сума замовлення", "number")}
      <label style={s.lbl}>
        Нотатки
        <textarea style={{ ...s.field, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} onBlur={() => f.notes !== (chat.notes || "") && save("notes", f.notes)} />
      </label>
      <div style={{ ...s.muted, marginTop: 10, padding: 10, border: "1px dashed var(--hairline)", borderRadius: 8 }}>
        🚌 Бронювання з панелі (app=10, manager_id) — наступний етап.
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  cards: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  card: { textAlign: "left", padding: 14, borderRadius: "var(--radius)", border: "1px solid var(--hairline)", background: "var(--surface)", color: "inherit", cursor: "pointer" },
  cardOn: { borderColor: "var(--amber)", boxShadow: "0 0 0 1px var(--amber) inset" },
  cardNums: { display: "flex", gap: 14, marginTop: 6, fontSize: 12.5, color: "var(--text-muted)", flexWrap: "wrap" },
  shell: { display: "flex", height: "calc(100vh - 300px)", minHeight: 480, border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)" },
  side: { width: 300, flexShrink: 0, borderRight: "1px solid var(--hairline)", display: "flex", flexDirection: "column" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--hairline)" },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 13 },
  sel: { padding: "6px 8px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface)", color: "inherit", fontSize: 12, flex: 1 },
  row: { display: "flex", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--hairline)", fontSize: 13 },
  rowOn: { background: "rgba(245,166,35,0.12)" },
  avatar: { width: 36, height: 36, borderRadius: "50%", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 },
  badge: { fontSize: 10.5, padding: "1px 6px", borderRadius: 999, border: "1px solid var(--hairline)", color: "var(--text-muted)" },
  unread: { marginLeft: "auto", background: "var(--amber)", color: "#111", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "0 6px" },
  chat: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--hairline)" },
  msgs: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 },
  bubble: { maxWidth: "70%", padding: "8px 12px", borderRadius: 14, fontSize: 14, lineHeight: 1.4 },
  mine: { background: "var(--amber)", color: "#111", borderBottomRightRadius: 4 },
  theirs: { background: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 },
  meta: { fontSize: 10.5, opacity: 0.7, marginTop: 3, textAlign: "right" },
  qrPanel: { maxHeight: 200, overflowY: "auto", padding: "8px 12px", borderTop: "1px solid var(--hairline)" },
  qrBtn: { padding: "5px 9px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, textAlign: "left" },
  inputRow: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--hairline)", alignItems: "flex-end" },
  input: { flex: 1, resize: "none", maxHeight: 140, minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14 },
  iconBtn: { width: 42, height: 42, borderRadius: 10, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  send: { width: 44, height: 42, borderRadius: 10, border: "none", background: "var(--amber)", color: "#111", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  primary: { padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer", fontSize: 12 },
  crm: { width: 280, flexShrink: 0, borderLeft: "1px solid var(--hairline)", padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", fontSize: 13 },
  lbl: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 },
  field: { padding: "7px 9px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "var(--text, inherit)", fontSize: 13 },
  muted: { color: "var(--text-muted)", fontSize: 12 },
};
