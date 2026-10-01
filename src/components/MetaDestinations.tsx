import { useEffect, useState } from "react";
import { Plus, Trash2, Send, Pencil } from "lucide-react";

// Кеп (29.09): "Meta-кабінети" — куди слати події з застосунку/вебу через Pixel і
// Conversions API. Можна додати свої й партнерські кабінети. Токени зберігаються на
// сервері (api/meta-destinations), у браузер повертається тільки маска.
const EVENTS: [string, string][] = [
  ["CompleteRegistration", "Реєстрація"],
  ["Search", "Пошук"],
  ["ViewContent", "Перегляд рейсу"],
  ["InitiateCheckout", "Оформлення"],
  ["AddPaymentInfo", "Перехід до оплати"],
  ["Purchase", "Покупка"],
];
interface Dest { id: string; name: string; pixelId: string; enabled: boolean; events: string[]; tokenMask?: string }
const empty = { id: "", name: "", pixelId: "", accessToken: "", enabled: true, events: [] as string[] };

const api = async (method: string, body?: unknown) => {
  const r = await fetch("/api/meta-destinations", {
    method,
    headers: { "Content-Type": "application/json", "x-admin-password": import.meta.env.VITE_ADMIN_PASSWORD || "" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

export function MetaDestinations() {
  const [list, setList] = useState<Dest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<typeof empty | null>(null);
  const [testCode, setTestCode] = useState("");

  const load = async () => {
    setLoading(true); setMsg("");
    try { setList((await api("GET")).destinations || []); } catch (e: any) { setMsg(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form) return;
    try { await api("POST", form); setForm(null); setMsg("Збережено"); load(); } catch (e: any) { setMsg(e.message); }
  };
  const remove = async (d: Dest) => {
    if (!confirm(`Видалити кабінет «${d.name}»?`)) return;
    try { await api("DELETE", { id: d.id }); load(); } catch (e: any) { setMsg(e.message); }
  };
  const toggle = async (d: Dest) => {
    try { await api("POST", { ...d, enabled: !d.enabled }); load(); } catch (e: any) { setMsg(e.message); }
  };
  const test = async (d: Dest) => {
    setMsg("Надсилаю тестову подію…");
    try {
      const r = await api("POST", { action: "test", id: d.id, testEventCode: testCode.trim() });
      setMsg(r.ok ? `«${d.name}»: Meta прийняла тестову подію ✅${testCode ? " (див. Events Manager → Тестові події)" : ""}` : `«${d.name}»: помилка ${r.status} — ${JSON.stringify(r.response?.error?.message || r.response)}`);
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div>
      <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Meta-кабінети</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 620 }}>
            Пікселі, у які йдуть події з вебверсії застосунку (Pixel) і з сервера (Conversions API — покупки з усіх
            платформ). Мобільний застосунок додатково шле події в Meta-застосунок «Euroclub App» напряму — для
            партнерів його відкривають у Business Settings. Події йдуть лише від користувачів, які дали згоду.
          </p>
        </div>
        <button onClick={() => setForm({ ...empty })} style={styles.primary}><Plus size={14} /> Додати кабінет</button>
      </header>

      {msg && <div style={{ fontSize: 13, marginBottom: 16, color: "var(--text-muted)" }}>{msg}</div>}

      {form && (
        <div style={styles.card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={styles.label}>Назва
              <input style={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="EuroClub основний / Партнер X" />
            </label>
            <label style={styles.label}>Pixel ID (набір даних)
              <input style={styles.input} value={form.pixelId} onChange={(e) => setForm({ ...form, pixelId: e.target.value })} placeholder="1234567890" />
            </label>
            <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Access Token (Conversions API){form.id ? " — залиш порожнім, щоб не міняти" : ""}
              <input style={styles.input} value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} placeholder="EAAG…" />
            </label>
          </div>
          <div style={{ margin: "14px 0 6px", fontSize: 12.5, color: "var(--text-muted)" }}>Які події слати (нічого не відмічено = усі):</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
            {EVENTS.map(([k, l]) => (
              <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={form.events.includes(k)} onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, k] : form.events.filter((x) => x !== k) })} />
                {l}
              </label>
            ))}
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Увімкнено
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={styles.primary}>Зберегти</button>
            <button onClick={() => setForm(null)} style={styles.btn}>Скасувати</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Код тестових подій (необов'язково):</span>
        <input style={{ ...styles.input, width: 160, marginTop: 0 }} value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" />
      </div>

      {loading ? <div style={{ color: "var(--text-muted)" }}>Завантаження…</div> : list.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Кабінетів ще немає — натисни «Додати кабінет».</div>
      ) : list.map((d) => (
        <div key={d.id} style={{ ...styles.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, opacity: d.enabled ? 1 : 0.55 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name} {!d.enabled && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>(вимкнено)</span>}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
              Pixel {d.pixelId} · токен {d.tokenMask || "—"} · {d.events?.length ? d.events.map((e) => EVENTS.find(([k]) => k === e)?.[1] || e).join(", ") : "усі події"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => toggle(d)} style={styles.btn}>{d.enabled ? "Вимкнути" : "Увімкнути"}</button>
            <button onClick={() => test(d)} style={styles.btn} title="Тестова подія"><Send size={14} /></button>
            <button onClick={() => setForm({ id: d.id, name: d.name, pixelId: d.pixelId, accessToken: "", enabled: d.enabled, events: d.events || [] })} style={styles.btn} title="Редагувати"><Pencil size={14} /></button>
            <button onClick={() => remove(d)} style={styles.btn} title="Видалити"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 12 },
  btn: { display: "flex", alignItems: "center", gap: 6, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 12px", fontSize: 12.5, color: "var(--text)", cursor: "pointer" },
  primary: { display: "flex", alignItems: "center", gap: 6, background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305", cursor: "pointer" },
  label: { display: "flex", flexDirection: "column", fontSize: 12.5, color: "var(--text-muted)" },
  input: { marginTop: 6, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--text)" },
};
