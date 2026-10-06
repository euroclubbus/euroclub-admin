import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Check, Search, Send, Star, Zap } from "lucide-react";
import { db } from "../../lib/firebase";
import { AppThreadChat, isUnread as appUnread, lastAt as appLastAt, Thread } from "../InboxList";
import { apiGet, apiPost, AuthError, Chat, CHANNELS, DEAL_STATUSES, EcrmUser, Label, Message, ORDER_STATUSES, QuickReply, SOURCES, STATUS_LABELS } from "./api";
import { Booked, Booking } from "./Booking";

// Кеп (06.10): Support Center у стилі Meta Business Suite — усі чати (месенджери, сайт,
// коментарі, застосунок) в одній папці, вкладки джерел, фільтри, чат по центру,
// справа — пошук рейсів/бронювання і картка клієнта.

const UNANSWERED_MIN = 15;

function ago(ms: number) {
  if (!ms) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год`;
  return new Date(ms).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}
function hm(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface Item {
  key: string;
  kind: "ecrm" | "app";
  channel: string;
  name: string;
  avatar?: string | null;
  lastMs: number;
  lastBody: string;
  lastMine: boolean;
  unread: number;
  priority: boolean;
  fromAd: boolean;
  chat?: Chat;
  thread?: Thread;
}

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }

export function Chats({ me, onAuthLost }: { me: EcrmUser; onAuthLost: () => void }) {
  const [source, setSource] = useState<string>(() => load("sc_source", "all"));
  const [filters, setFilters] = useState<{ unread: boolean; priority: boolean; ads: boolean }>(() => load("sc_filters", { unread: false, priority: false, ads: false }));
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => save("sc_source", source), [source]);
  useEffect(() => save("sc_filters", filters), [filters]);

  const guard = useCallback((e: unknown) => {
    if (e instanceof AuthError) onAuthLost();
    else setError(e instanceof Error ? e.message : "Помилка");
  }, [onAuthLost]);

  const loadList = useCallback(async () => {
    try {
      const l = await apiGet<{ data: Chat[] }>("/api/chats?action=list");
      setChats(l.data || []);
      setError("");
    } catch (e) { guard(e); }
  }, [guard]);
  const loadLabels = useCallback(() => apiGet<{ data: Label[] }>("/api/chats?action=labels").then((d) => setLabels(d.data || [])).catch(() => {}), []);

  useEffect(() => {
    loadList(); loadLabels();
    const t = setInterval(loadList, 5000);
    return () => clearInterval(t);
  }, [loadList, loadLabels]);

  // Чати із застосунку (Firestore feedback_threads)
  useEffect(() => onSnapshot(collection(db, "feedback_threads"), (snap) => {
    setThreads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), messages: d.get("messages") || [] })));
  }, () => {}), []);

  const items: Item[] = useMemo(() => {
    const now = Date.now();
    const a: Item[] = chats.map((c) => {
      const lastMs = new Date(c.last_at || c.last_msg_at).getTime();
      const waiting = c.last_sender === "user" && c.status !== "resolved" && c.status !== "archived" && now - lastMs > UNANSWERED_MIN * 60000;
      return {
        key: `e${c.id}`, kind: "ecrm", channel: c.channel, name: c.visitor_name || `Гість #${c.visitor_id}`, avatar: c.avatar_url,
        lastMs, lastBody: c.last_body || "", lastMine: c.last_sender === "manager", unread: c.unread || 0,
        priority: !!c.priority || waiting, fromAd: !!c.ad_id, chat: c,
      };
    });
    const b: Item[] = threads.filter((t) => t.messages.length).map((t) => {
      const last = t.messages[t.messages.length - 1];
      const lastMs = appLastAt(t);
      return {
        key: `a${t.id}`, kind: "app", channel: "app", name: `ID ${t.userId}`, lastMs, lastBody: last?.text || "", lastMine: last?.from === "admin",
        unread: appUnread(t) ? 1 : 0, priority: last?.from === "user" && now - lastMs > UNANSWERED_MIN * 60000 && appUnread(t), fromAd: false, thread: t,
      };
    });
    return [...a, ...b].sort((x, y) => y.lastMs - x.lastMs);
  }, [chats, threads]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of SOURCES) m[s.id] = items.filter((i) => (!s.channels || s.channels.includes(i.channel)) && i.unread > 0).length;
    return m;
  }, [items]);

  const shown = useMemo(() => {
    const src = SOURCES.find((s) => s.id === source) || SOURCES[0];
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (src.channels && !src.channels.includes(i.channel)) return false;
      if (filters.unread && !i.unread) return false;
      if (filters.priority && !i.priority) return false;
      if (filters.ads && !i.fromAd) return false;
      if (q && ![i.name, i.lastBody, i.chat?.phone, i.chat?.email, i.chat?.route].some((v) => (v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, source, filters, search]);

  const open = items.find((i) => i.key === openKey) || null;

  return (
    <div>
      <div style={s.sources}>
        {SOURCES.map((src) => (
          <button key={src.id} onClick={() => setSource(src.id)} style={{ ...s.srcTab, ...(source === src.id ? s.srcTabOn : {}) }}>
            {src.label}
            {counts[src.id] > 0 && <span style={s.srcCount}>{counts[src.id] > 9 ? "9+" : counts[src.id]}</span>}
          </button>
        ))}
      </div>
      {error && <div style={{ color: "#E5484D", fontSize: 12, margin: "6px 0" }}>{error}</div>}

      <div style={s.shell}>
        <div style={s.side}>
          <div style={s.searchBox}>
            <Search size={14} style={{ opacity: 0.6 }} />
            <input style={s.searchInput} placeholder="Пошук" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={s.chips}>
            {([["unread", "Непрочитані"], ["priority", "Пріоритет"], ["ads", "Відповіді на оголошення"]] as const).map(([k, l]) => (
              <button key={k} style={{ ...s.chip, ...(filters[k] ? s.chipOn : {}) }} onClick={() => setFilters({ ...filters, [k]: !filters[k] })}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {shown.length === 0 && <div style={{ ...s.muted, padding: 14 }}>Чатів немає</div>}
            {shown.map((i) => {
              const ch = CHANNELS[i.channel] || { label: i.channel, color: "#888" };
              return (
                <div key={i.key} onClick={() => setOpenKey(i.key)} style={{ ...s.row, ...(i.key === openKey ? s.rowOn : {}) }}>
                  <div style={{ position: "relative" }}>
                    {i.avatar ? <img src={i.avatar} style={s.avatarImg} alt="" /> : <div style={{ ...s.avatar, background: ch.color }}>{i.name.slice(0, 1).toUpperCase()}</div>}
                    <span style={{ ...s.chDot, background: ch.color }} title={ch.label} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontWeight: i.unread ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {i.chat?.priority && <Star size={11} fill="#F5A623" color="#F5A623" style={{ marginRight: 4 }} />}{i.name}
                      </span>
                      <span style={s.muted}>{ago(i.lastMs)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ ...s.preview, fontWeight: i.unread ? 600 : 400 }}>{i.lastMine ? "Ви: " : ""}{i.lastBody}</span>
                      {i.unread > 0 && <span style={s.unreadDot} />}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                      <span style={{ ...s.badge, color: ch.color, borderColor: ch.color }}>{ch.label}</span>
                      {i.fromAd && <span style={{ ...s.badge, color: "#22C55E", borderColor: "#22C55E" }}>з реклами</span>}
                      {(i.chat?.labels || []).map((l) => {
                        const lb = labels.find((x) => x.name === l);
                        return <span key={l} style={{ ...s.badge, color: lb?.color || "#aaa", borderColor: lb?.color || "#aaa" }}>{l}</span>;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!open ? (
          <div style={{ ...s.chat, alignItems: "center", justifyContent: "center", ...s.muted }}>Оберіть чат зліва</div>
        ) : open.kind === "app" && open.thread ? (
          <>
            <AppThreadChat key={open.key} thread={open.thread} />
            <div style={s.right}>
              <Booking chat={{ visitor_name: "", phone: "", email: "" } as Chat} me={me} onBooked={() => {}} />
              <div style={s.muted}>Клієнт із застосунку · ID {open.thread.userId}. Відповідь іде йому push-сповіщенням.</div>
            </div>
          </>
        ) : open.chat ? (
          <EcrmChat key={open.key} chat={open.chat} me={me} labels={labels} onLabels={loadLabels} onChanged={loadList} guard={guard} />
        ) : null}
      </div>
    </div>
  );
}

function EcrmChat({ chat, me, labels, onLabels, onChanged, guard }: { chat: Chat; me: EcrmUser; labels: Label[]; onLabels: () => void; onChanged: () => void; guard: (e: unknown) => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<QuickReply[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const ch = CHANNELS[chat.channel] || { label: chat.channel, color: "#888" };

  const loadMsgs = useCallback(async () => {
    try {
      const d = await apiGet<{ messages: Message[] }>(`/api/chats?action=get&id=${chat.id}`);
      setMsgs(d.messages || []);
    } catch (e) { guard(e); }
  }, [chat.id, guard]);
  const loadQr = useCallback(() => apiGet<{ data: QuickReply[] }>("/api/quick-replies?action=list").then((d) => setQr(d.data || [])).catch(() => {}), []);

  useEffect(() => {
    loadMsgs(); loadQr();
    const t = setInterval(loadMsgs, 3000);
    return () => clearInterval(t);
  }, [loadMsgs, loadQr]);
  useEffect(() => {
    if (msgs.length !== lastCount.current) bottom.current?.scrollIntoView({ block: "end" });
    lastCount.current = msgs.length;
  }, [msgs.length]);

  const update = (patch: Record<string, unknown>) => apiPost("/api/chats?action=update", { id: chat.id, ...patch }).then(onChanged).catch(guard);

  async function send(body = text) {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true);
    try {
      await apiPost("/api/messages?action=send", { chat_id: chat.id, body: b });
      setText("");
      await loadMsgs();
      onChanged();
    } catch (e) { guard(e); } finally { setSending(false); }
  }

  async function onBooked(b: Booked) {
    await send(b.summary);
    const note = `[${new Date().toLocaleString("uk-UA")}] Замовлення №${b.oid}: ${b.route}, ${b.date}, ${b.total} (${me.name || me.login})`;
    await update({ route: b.route, trip_date: b.date, order_value: b.total, deal_status: "won", lead_stage: "booked", notes: chat.notes ? `${chat.notes}\n${note}` : note });
  }

  const mine = qr.filter((r) => r.owner_id === me.id);
  const common = qr.filter((r) => r.owner_id === null);
  const group = (list: QuickReply[]) => list.reduce<Record<string, QuickReply[]>>((a, r) => ((a[r.category] = a[r.category] || []).push(r), a), {});
  const placeholder = chat.channel === "fb_comment" || chat.channel === "ig_comment" ? "Відповісти на коментар…" : `Відповісти в ${ch.label}…`;

  return (
    <>
      <div style={s.chat}>
        <div style={s.head}>
          {chat.avatar_url ? <img src={chat.avatar_url} style={s.avatarImg} alt="" /> : <div style={{ ...s.avatar, background: ch.color }}>{(chat.visitor_name || "?").slice(0, 1).toUpperCase()}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{chat.visitor_name || `Гість #${chat.visitor_id}`}</div>
            <div style={s.muted}>{ch.label}{chat.ad_id ? ` · з реклами${chat.ad_title ? `: ${chat.ad_title}` : ""}` : ""}{chat.manager_name ? ` · ${chat.manager_name}` : ""}</div>
          </div>
          <button title="Пріоритет" style={{ ...s.iconBtn, ...(chat.priority ? { color: "#F5A623", borderColor: "#F5A623" } : {}) }} onClick={() => update({ priority: !chat.priority })}>
            <Star size={16} fill={chat.priority ? "#F5A623" : "none"} />
          </button>
          {!chat.manager_id && <button style={s.primary} onClick={() => apiPost("/api/chats?action=assign", { id: chat.id }).then(onChanged).catch(guard)}>Взяти в роботу</button>}
          <select style={s.sel} value={chat.status} onChange={(e) => update({ status: e.target.value })}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button title="Позначити вирішеним" style={s.iconBtn} onClick={() => update({ status: "resolved" })}><Check size={16} /></button>
        </div>

        <div style={s.msgs}>
          {msgs.length === 0 && <div style={{ ...s.muted, textAlign: "center", marginTop: 40 }}>Повідомлень немає</div>}
          {msgs.map((m) => {
            const my = m.sender_type === "manager";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: my ? "flex-end" : "flex-start" }}>
                <div style={{ ...s.bubble, ...(my ? s.mine : s.theirs) }}>
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
            {[["Загальні шаблони", common], ["Мої шаблони", mine]].map(([title, list]) => (
              <div key={title as string} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{title as string}</div>
                {(list as QuickReply[]).length === 0 && <div style={s.muted}>Немає — додайте у вкладці «Швидкі відповіді»</div>}
                {Object.entries(group(list as QuickReply[])).map(([cat, arr]) => (
                  <div key={cat} style={{ marginBottom: 4 }}>
                    <div style={{ ...s.muted, marginBottom: 3 }}>{cat}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {arr.map((r) => <button key={r.id} style={s.qrBtn} onClick={() => { setText(r.body); setQrOpen(false); }}>{r.body}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={s.composer}>
          <textarea
            style={s.input}
            rows={2}
            placeholder={`${placeholder} (Enter — надіслати, Shift+Enter — новий рядок)`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button style={{ ...s.iconBtn, ...(qrOpen ? { background: "var(--amber)", color: "#111" } : {}) }} onClick={() => setQrOpen((v) => !v)} title="Збережені відповіді"><Zap size={16} /></button>
            <button style={s.send} disabled={!text.trim() || sending} onClick={() => send()}><Send size={16} /></button>
          </div>
        </div>
      </div>

      <div style={s.right}>
        <Booking chat={chat} me={me} onBooked={onBooked} />
        <ClientCard chat={chat} labels={labels} onLabels={onLabels} update={update} />
      </div>
    </>
  );
}

const PALETTE = ["#F5A623", "#22C55E", "#3B82F6", "#EC4899", "#8B5CF6", "#E5484D", "#14B8A6"];

function ClientCard({ chat, labels, onLabels, update }: { chat: Chat; labels: Label[]; onLabels: () => void; update: (p: Record<string, unknown>) => Promise<unknown> }) {
  const [f, setF] = useState({ name: chat.visitor_name || "", phone: chat.phone || "", email: chat.email || "", notes: chat.notes || "" });
  const [newLabel, setNewLabel] = useState("");
  const orig: Record<string, string> = { name: chat.visitor_name || "", phone: chat.phone || "", email: chat.email || "", notes: chat.notes || "" };
  const blur = (k: keyof typeof f) => f[k] !== orig[k] && update({ [k]: f[k] });
  const cur = chat.labels || [];
  const toggle = (n: string) => update({ labels: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] });
  async function addLabel() {
    const n = newLabel.trim();
    if (!n) return;
    await apiPost("/api/chats?action=label-create", { name: n, color: PALETTE[labels.length % PALETTE.length] });
    setNewLabel("");
    onLabels();
    update({ labels: [...cur, n] });
  }
  return (
    <div style={{ fontSize: 13 }}>
      <b style={{ display: "block", marginBottom: 6 }}>Інформація</b>
      {(["name", "phone", "email"] as const).map((k) => (
        <label key={k} style={s.lbl}>
          {k === "name" ? "Ім'я" : k === "phone" ? "Телефон" : "Email"}
          <input style={s.field} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => blur(k)} />
        </label>
      ))}
      <label style={s.lbl}>
        Етап ліда
        <select style={s.field} value={chat.deal_status || "new"} onChange={(e) => update({ deal_status: e.target.value })}>
          {Object.entries(DEAL_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label style={s.lbl}>
        Статус замовлення
        <select style={s.field} value={chat.lead_stage || ""} onChange={(e) => update({ lead_stage: e.target.value })}>
          {Object.entries(ORDER_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {(chat.route || chat.trip_date || chat.order_value) && (
        <div style={{ ...s.muted, marginBottom: 8 }}>Останнє: {chat.route} {chat.trip_date} {chat.order_value ? `· ${chat.order_value}` : ""}</div>
      )}
      <div style={s.lbl}>Ярлики</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
        {labels.map((l) => (
          <button key={l.id} onClick={() => toggle(l.name)} style={{ ...s.badge, cursor: "pointer", background: cur.includes(l.name) ? l.color : "transparent", color: cur.includes(l.name) ? "#111" : l.color, borderColor: l.color, padding: "3px 8px" }}>{l.name}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
        <input style={{ ...s.field, flex: 1 }} placeholder="Новий ярлик" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLabel()} />
        <button style={s.primary} onClick={addLabel} disabled={!newLabel.trim()}>+</button>
      </div>
      <label style={s.lbl}>
        Нотатки
        <textarea style={{ ...s.field, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} onBlur={() => blur("notes")} />
      </label>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  sources: { display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--hairline)", marginBottom: 10 },
  srcTab: { padding: "9px 12px", border: "none", borderBottom: "2px solid transparent", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 },
  srcTabOn: { color: "var(--text, #fff)", borderBottomColor: "var(--amber)", fontWeight: 700 },
  srcCount: { background: "#E5484D", color: "#fff", borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: "0 6px" },
  shell: { display: "flex", height: "calc(100vh - 215px)", minHeight: 520, border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)" },
  side: { width: 320, flexShrink: 0, borderRight: "1px solid var(--hairline)", display: "flex", flexDirection: "column" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--hairline)" },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 13 },
  chips: { display: "flex", gap: 5, padding: "8px 10px", borderBottom: "1px solid var(--hairline)", flexWrap: "wrap" },
  chip: { padding: "5px 10px", borderRadius: 999, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 },
  chipOn: { background: "var(--amber)", color: "#111", borderColor: "var(--amber)", fontWeight: 600 },
  row: { display: "flex", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--hairline)", fontSize: 13 },
  rowOn: { background: "rgba(245,166,35,0.12)" },
  avatar: { width: 40, height: 40, borderRadius: "50%", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 },
  avatarImg: { width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  chDot: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--surface)" },
  preview: { color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, fontSize: 12.5 },
  unreadDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", flexShrink: 0 },
  badge: { fontSize: 10.5, padding: "1px 6px", borderRadius: 999, border: "1px solid var(--hairline)", color: "var(--text-muted)", background: "transparent" },
  chat: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--hairline)" },
  msgs: { flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", flexDirection: "column", gap: 8 },
  bubble: { maxWidth: "65%", padding: "9px 13px", borderRadius: 16, fontSize: 14, lineHeight: 1.45 },
  mine: { background: "var(--amber)", color: "#111", borderBottomRightRadius: 4 },
  theirs: { background: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 },
  meta: { fontSize: 10.5, opacity: 0.7, marginTop: 3, textAlign: "right" },
  qrPanel: { maxHeight: 220, overflowY: "auto", padding: "10px 16px", borderTop: "1px solid var(--hairline)" },
  qrBtn: { padding: "5px 9px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, textAlign: "left", maxWidth: 360 },
  composer: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--hairline)", alignItems: "stretch" },
  input: { flex: 1, resize: "none", minHeight: 64, maxHeight: 180, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14 },
  iconBtn: { width: 38, height: 34, borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  send: { width: 38, height: 34, borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  primary: { padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer", fontSize: 12 },
  sel: { padding: "6px 8px", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface)", color: "inherit", fontSize: 12 },
  right: { width: 340, flexShrink: 0, borderLeft: "1px solid var(--hairline)", padding: 14, overflowY: "auto" },
  lbl: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 },
  field: { padding: "7px 9px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "var(--text, inherit)", fontSize: 13 },
  muted: { color: "var(--text-muted)", fontSize: 12 },
};
