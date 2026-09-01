import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { Check, ChevronDown, ChevronRight, History, Plus, Search, X } from "lucide-react";
import { db } from "../lib/firebase";
import { DISCOUNT_CATALOG, OrderRegistryDoc, OrderRegistryEdit, OrderRegistryPassenger, OrderSurcharge } from "../lib/types";

const SURCHARGE_REASONS = ["Зміна дати", "Зміна місця відправлення", "Зміна пасажира", "Інше"];

function backendStatusLabel(status: any): { text: string; color: string } {
  const n = Number(status);
  if (status == null || status === "") return { text: "ще невідомо", color: "var(--text-faint)" };
  if (n === 0) return { text: "скасовано", color: "var(--danger)" };
  if (n === 1) return { text: "не сплачено", color: "#E0A100" };
  if (n === 2) return { text: "оплачено (попереду)", color: "#4CAF50" };
  if (n === 3) return { text: "оплачено (завершено)", color: "#4CAF50" };
  return { text: String(status), color: "var(--text-faint)" };
}

function fmtDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function normalizePassengers(list: OrderRegistryPassenger[]): OrderRegistryPassenger[] {
  // Старі записи (до появи знижки/ціни окремими полями) можуть не мати discountName/
  // discountPercent/price взагалі — Firestore відмовляється писати undefined в документ,
  // тому без цієї нормалізації "Зберегти зміни" мовчки падало з помилкою.
  return (list || []).map((p) => {
    const tariff = Number(p.tariff) || 0;
    const discountPercent = Number(p.discountPercent) || 0;
    const discountName = p.discountName || (discountPercent === 0 ? "Повний тариф" : "");
    const price = p.price != null ? Number(p.price) : Math.round(tariff * (1 - discountPercent / 100));
    return { ...p, tariff, discountPercent, discountName, price };
  });
}

function OrderRow({ order, userStats, selected, onToggleSelect }: { order: OrderRegistryDoc; userStats: { total: number; app1: number; app2: number } | null; selected: boolean; onToggleSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Пріоритет — живий userId з бекенду (backendUserId, синхронізується автоматично, тому
  // ретроактивно заповнюється навіть для старих замовлень), інакше — те, що записав сам
  // застосунок у момент бронювання (17.08).
  const effectiveUserId = order.backendUserId ?? order.userId;
  // Кеп (01.09): "справжня кількість" по кнопці — живий запит на бекенд, а не лише
  // документи order_registry (той рахує тільки замовлення через застосунок).
  const [realTotal, setRealTotal] = useState<{ total: number; app1: number; app2: number; other: number } | null>(null);
  const [realTotalLoading, setRealTotalLoading] = useState(false);
  const [realTotalError, setRealTotalError] = useState("");
  const fetchRealTotal = async () => {
    setRealTotalLoading(true);
    setRealTotalError("");
    try {
      const res = await fetch("/api/real-user-total", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oid: order.orderNo }),
      });
      const data = await res.json();
      if (!res.ok) { setRealTotalError(data?.error || "Помилка запиту"); return; }
      setRealTotal({ total: data.total, app1: data.app1, app2: data.app2, other: data.other });
    } catch (e: any) {
      setRealTotalError(e?.message || "Помилка мережі");
    } finally {
      setRealTotalLoading(false);
    }
  };
  // Патчі, а не повна копія масиву — так редагування одного пасажира ніколи не "заморожує"
  // застарілий стан інших. Незачеплені пасажири завжди читаються напряму з order.passengers
  // (живі, onSnapshot), тільки реально відредаговані поля лежать тут до збереження.
  const [patches, setPatches] = useState<Record<number, Partial<OrderRegistryPassenger>>>({});
  const [paidPatch, setPaidPatch] = useState<boolean | null>(null);
  const [surchargesPatch, setSurchargesPatch] = useState<OrderSurcharge[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [scAmount, setScAmount] = useState("");
  const [scReason, setScReason] = useState(SURCHARGE_REASONS[0]);
  const [scCustom, setScCustom] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifSending, setNotifSending] = useState(false);
  const [notifResult, setNotifResult] = useState<"sent" | "failed" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const refreshFromBackend = async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      const res = await fetch("/api/refresh-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo: order.orderNo }),
      });
      const data = await res.json();
      if (!res.ok) setRefreshError(data.error || "Не вдалося оновити");
    } catch {
      setRefreshError("Мережева помилка");
    } finally {
      setRefreshing(false);
    }
  };

  const sendNotification = async () => {
    if (!effectiveUserId || !notifTitle.trim() || !notifBody.trim()) return;
    setNotifSending(true);
    setNotifResult(null);
    try {
      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: notifTitle.trim(), body: notifBody.trim(), userIds: [effectiveUserId], type: "service" }),
      });
      const data = await res.json();
      setNotifResult(data.successCount > 0 ? "sent" : "failed");
      if (data.successCount > 0) {
        setNotifTitle("");
        setNotifBody("");
      }
    } catch {
      setNotifResult("failed");
    } finally {
      setNotifSending(false);
    }
  };

  const paid = paidPatch !== null ? paidPatch : !!order.paid;
  const surcharges = surchargesPatch !== null ? surchargesPatch : order.surcharges || [];

  // Доплату можна додавати/редагувати/видаляти тільки в оплаченому замовленні — і все це
  // так само чернетка, комітиться разом з рештою по кнопці "Зберегти зміни", не окремо.
  function addSurchargeLocal() {
    const amount = Number(scAmount);
    if (!(amount > 0)) return;
    const reason = scReason === "Інше" ? (scCustom.trim() || "Інше") : scReason;
    const entry: OrderSurcharge = { amount, reason, at: new Date().toISOString() };
    setSurchargesPatch([...surcharges, entry]);
    setScAmount("");
    setScCustom("");
  }
  function removeSurchargeLocal(idx: number) {
    setSurchargesPatch(surcharges.filter((_, i) => i !== idx));
  }
  function editSurchargeLocal(idx: number, patch: Partial<OrderSurcharge>) {
    setSurchargesPatch(surcharges.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  const baseline = normalizePassengers(order.passengers);
  const draft = baseline.map((p) => ({ ...p, ...(patches[p.index] || {}) }));
  const dirty = Object.keys(patches).length > 0 || paidPatch !== null || surchargesPatch !== null;

  // Скидаємо патчі, коли картку закривають — наступного відкриття завжди з чистого аркуша
  // і актуальних даних, а не з того, що могло лишитись від минулого разу.
  useEffect(() => {
    if (!open) { setPatches({}); setPaidPatch(null); setSurchargesPatch(null); }
  }, [open]);

  function patchPassenger(idx: number, patch: Partial<OrderRegistryPassenger>) {
    setPatches((prev) => ({ ...prev, [idx]: { ...(prev[idx] || {}), ...patch } }));
  }

  function onDiscountChange(idx: number, name: string) {
    const item = DISCOUNT_CATALOG.find((c) => c.name === name);
    if (!item) return;
    const current = draft.find((p) => p.index === idx);
    if (!current) return;
    patchPassenger(idx, { discountName: item.name, discountPercent: item.percent, price: Math.round(current.tariff * (1 - item.percent / 100)) });
  }

  function onTariffChange(idx: number, tariff: number) {
    const current = draft.find((p) => p.index === idx);
    if (!current) return;
    // Тариф міняється — знижку не чіпаємо, лише перераховуємо ціну від нового тарифу.
    patchPassenger(idx, { tariff, price: Math.round(tariff * (1 - current.discountPercent / 100)) });
  }

  function onPriceChange(idx: number, price: number) {
    patchPassenger(idx, { price });
  }

  async function saveChanges() {
    setSaving(true);
    setError("");
    try {
      const edits: OrderRegistryEdit[] = [];
      const now = new Date().toISOString();
      draft.forEach((p) => {
        const before = baseline.find((x) => x.index === p.index);
        if (!before) return;
        if (before.tariff !== p.tariff) edits.push({ at: now, passengerIndex: p.index, field: "tariff", oldValue: before.tariff, newValue: p.tariff });
        if (before.discountName !== p.discountName) edits.push({ at: now, passengerIndex: p.index, field: "discount", oldValue: before.discountName, newValue: p.discountName });
        if (before.price !== p.price) edits.push({ at: now, passengerIndex: p.index, field: "price", oldValue: before.price, newValue: p.price });
      });
      if (paidPatch !== null && paidPatch !== !!order.paid) {
        edits.push({ at: now, passengerIndex: 0, field: "status", oldValue: order.paid ? "оплачено" : "не оплачено", newValue: paid ? "оплачено" : "не оплачено" });
      }
      const ref = doc(db, "order_registry", order.orderNo);
      await updateDoc(ref, { passengers: draft, paid, surcharges, editHistory: [...(order.editHistory || []), ...edits] });
      setPatches({});
      setPaidPatch(null);
      setSurchargesPatch(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      console.error("[OrderRegistry] save failed", e);
      setError(e?.message || "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  const allHistory = [...(order.editHistory || [])].sort((a, b) => b.at.localeCompare(a.at));
  const total = draft.reduce((s, p) => s + (Number(p.price) || 0), 0);

  return (
    <div style={styles.row}>
      <div style={styles.rowHeaderWrap}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={!effectiveUserId}
          title={effectiveUserId ? "Обрати для масової розсилки" : "Немає userId — недоступно для розсилки"}
          style={styles.rowCheckbox}
          onClick={(e) => e.stopPropagation()}
        />
        <button onClick={() => setOpen((o) => !o)} style={styles.rowHeader}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={styles.orderNo}>№ {order.orderNo}</span>
            {effectiveUserId && (
              <span style={{ fontSize: 10.5, color: "var(--text-faint)" }} title="user_id (пріоритет — живий з бекенду)">
                uid {effectiveUserId}
              </span>
            )}
            {(() => {
              const bs = backendStatusLabel(order.backendStatus);
              return <span style={{ fontSize: 10.5, fontWeight: 700, color: bs.color, border: `1px solid ${bs.color}`, borderRadius: 20, padding: "1px 8px" }}>{bs.text}</span>;
            })()}
          </div>
          <div style={styles.rowMeta}>
            {order.fromCity} → {order.toCity} · {order.tripDate}
            {order.roundTrip && order.tripDate2 ? ` · назад ${order.tripDate2}` : ""} · {order.passengers?.length ?? 0} пас.
          </div>
        </div>
        <div style={styles.rowStats}>
          <div style={styles.rowStat} title="Джерело (app з бекенду): 0/1/2 — точне значення кожного не з'ясовано, показуємо як є. Пріоритет — живе поле з бекенду (синхронізується автоматично, коли юзер відкриває застосунок; працює навіть для старих замовлень), інакше — те, що записав сам застосунок у момент бронювання.">
            <span style={styles.rowStatValue}>{(order.backendAppPlatform ?? order.appPlatform) !== undefined && (order.backendAppPlatform ?? order.appPlatform) !== null ? `APP${order.backendAppPlatform ?? order.appPlatform}` : "—"}</span>
            <span style={styles.rowStatLabel}>джерело</span>
          </div>
          <div style={styles.rowStat} title="Усі замовлення цього userId в НАШОМУ реєстрі — тільки ті, що пройшли через застосунок. Для справжньої кількості з усіх джерел (сайт+застосунок+менеджер) — натисни 'Перевірити' нижче.">
            <span style={styles.rowStatValue}>{userStats?.total ?? "—"}</span>
            <span style={styles.rowStatLabel}>всі замовлення (реєстр)</span>
          </div>
          <div style={styles.rowStat}>
            {realTotal ? (
              <>
                <span style={styles.rowStatValue} title={`APP1: ${realTotal.app1}, APP2: ${realTotal.app2}, інше (сайт/менеджер): ${realTotal.other}`}>{realTotal.total}</span>
                <span style={styles.rowStatLabel}>всі джерела (живе)</span>
              </>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); fetchRealTotal(); }}
                disabled={realTotalLoading || !effectiveUserId}
                title={effectiveUserId ? "Живий запит на бекенд — справжня кількість замовлень з усіх джерел (сайт+застосунок+менеджер)" : "Немає userId — недоступно"}
                style={{ background: "none", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "4px 8px", fontSize: 10.5, color: "var(--text-muted)", cursor: effectiveUserId ? "pointer" : "not-allowed" }}
              >
                {realTotalLoading ? "..." : "Перевірити"}
              </button>
            )}
            {realTotalError && <span style={{ fontSize: 10, color: "var(--danger, #E53935)" }}>{realTotalError}</span>}
          </div>
          <div style={styles.rowStat} title="Сума APP1 (Android) + APP2 (iPhone) для цього userId">
            <span style={styles.rowStatValue}>{userStats ? userStats.app1 + userStats.app2 : "—"}</span>
            <span style={styles.rowStatLabel}>з додатку</span>
          </div>
          <div style={styles.rowStat} title="APP1 = Android">
            <span style={styles.rowStatValue}>{userStats?.app1 ?? "—"}</span>
            <span style={styles.rowStatLabel}>Android</span>
          </div>
          <div style={styles.rowStat} title="APP2 = iPhone">
            <span style={styles.rowStatValue}>{userStats?.app2 ?? "—"}</span>
            <span style={styles.rowStatLabel}>iPhone</span>
          </div>
        </div>
        <div style={styles.createdAt}>{fmtDateTime(order.createdAt)}</div>
      </button>
      </div>

      {open && (
        <div style={styles.detail}>
          <div style={styles.notifyBox}>
            {effectiveUserId ? (
              <>
                <div style={styles.notifyLabel}>Надіслати сповіщення цьому пасажиру</div>
                <input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="Тема" style={styles.notifyInput} />
                <textarea value={notifBody} onChange={(e) => setNotifBody(e.target.value)} placeholder="Текст повідомлення" rows={2} style={styles.notifyTextarea} />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={sendNotification}
                    disabled={notifSending || !notifTitle.trim() || !notifBody.trim()}
                    style={{ ...styles.notifySendBtn, opacity: notifSending || !notifTitle.trim() || !notifBody.trim() ? 0.5 : 1 }}
                  >
                    {notifSending ? "Надсилаю…" : "Надіслати"}
                  </button>
                  {notifResult === "sent" && <span style={{ color: "var(--success, #4CAF50)", fontSize: 12 }}>Надіслано ✓</span>}
                  {notifResult === "failed" && <span style={{ color: "var(--danger)", fontSize: 12 }}>Не вдалось надіслати (нема активного токена пристрою?)</span>}
                </div>
              </>
            ) : (
              <div style={styles.notifyLabel}>
                Сповіщення недоступне — userId ще не синхронізовано для цього замовлення (це станеться автоматично, щойно цей юзер відкриє застосунок).
              </div>
            )}
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Пасажир</th>
                <th style={styles.th}>Квиток</th>
                <th style={styles.th}>Знижка</th>
                <th style={styles.th}>Тариф</th>
                <th style={styles.th}>Ціна</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((p) => (
                <tr key={p.index}>
                  <td style={styles.td}>Пасажир {p.index}</td>
                  <td style={styles.td}>{p.ticketNumber || "—"}</td>
                  <td style={styles.td}>
                    <select value={p.discountName || "Повний тариф"} onChange={(e) => onDiscountChange(p.index, e.target.value)} style={styles.select}>
                      {DISCOUNT_CATALOG.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.percent}%)
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <input type="number" value={p.tariff} onChange={(e) => onTariffChange(p.index, Number(e.target.value))} style={{ ...styles.input, width: 90 }} />
                  </td>
                  <td style={styles.td}>
                    <input type="number" value={p.price} onChange={(e) => onPriceChange(p.index, Number(e.target.value))} style={{ ...styles.input, width: 90, fontWeight: 700 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.footer}>
            <div style={styles.totalLine}>
              Усього: <strong>{total} ₴</strong>
            </div>
            <button onClick={saveChanges} disabled={!dirty || saving} style={{ ...styles.saveBtn, opacity: !dirty || saving ? 0.5 : 1 }}>
              {saved ? <Check size={14} /> : saving ? "Збереження…" : "Зберегти зміни"}
            </button>
          </div>
          <div style={styles.hint}>Після збереження застосунок покаже нову суму одразу при оновленні сторінки замовлення.</div>
          {error && <div style={styles.error}>Помилка збереження: {error}</div>}

          <button onClick={() => setPaidPatch(!paid)} style={styles.paidToggle}>
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${paid ? "var(--amber)" : "var(--hairline-strong)"}`,
              background: paid ? "var(--amber)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {paid && <Check size={13} color="#1a1305" />}
            </div>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{paid ? "Оплачено" : "Не оплачено"}</span>
          </button>
          <div style={styles.backendStatusLine}>
            {(() => {
              const bs = backendStatusLabel(order.backendStatus);
              return (
                <>
                  Реальний статус з бекенду: <strong style={{ color: bs.color }}>{bs.text}</strong>
                  {(order.backendPaidUah || order.backendPaidEur) ? (
                    <> · сплачено {order.backendPaidUah ? `${order.backendPaidUah} ₴` : ""}{order.backendPaidUah && order.backendPaidEur ? " / " : ""}{order.backendPaidEur ? `${order.backendPaidEur} €` : ""}</>
                  ) : null}
                  {order.backendSyncedAt && <span style={styles.mutedSmall}> (оновлено {fmtDateTime(order.backendSyncedAt)})</span>}
                </>
              );
            })()}
            {/* Кеп (25.08): oid2user-orders працює для БУДЬ-ЯКОГО oid — умову sessionKey
                прибрано, кнопка тепер доступна завжди. */}
            <button onClick={refreshFromBackend} disabled={refreshing} style={styles.refreshBtn}>
              {refreshing ? "Оновлюю…" : "Оновити з бекенду"}
            </button>
            {refreshError && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{refreshError}</div>}
          </div>

          {paid && (
            <div style={styles.surchargeBlock}>
              <div style={styles.surchargeTitle}>Доплата (причина завжди вказується тут)</div>
              <div style={styles.surchargeHint}>
                Суму доплати застосунок бере: для замовлень в один бік — живою з бекенду (needpay), для замовлень в
                два боки — з різниці нашої ціни й оплаченого. Тут вказуєш тільки ПРИЧИНУ — вона показується
                користувачу поруч із сумою доплати. Доплату можна додати, відредагувати або видалити — усе
                застосовується разом із рештою правок по кнопці "Зберегти зміни" вище.
              </div>
              {surcharges.length > 0 && (
                <div style={styles.surchargeList}>
                  {surcharges.map((s, i) => (
                    <div key={i} style={styles.surchargeEditRow}>
                      <select value={s.reason} onChange={(e) => editSurchargeLocal(i, { reason: e.target.value })} style={styles.select}>
                        {SURCHARGE_REASONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                        {!SURCHARGE_REASONS.includes(s.reason) && <option value={s.reason}>{s.reason}</option>}
                      </select>
                      <input type="number" value={s.amount} onChange={(e) => editSurchargeLocal(i, { amount: Number(e.target.value) })} style={{ ...styles.input, width: 80 }} />
                      <span style={styles.mutedSmall}>{fmtDateTime(s.at)}</span>
                      <button onClick={() => removeSurchargeLocal(i)} style={styles.iconBtn}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.surchargeForm}>
                <select value={scReason} onChange={(e) => setScReason(e.target.value)} style={styles.select}>
                  {SURCHARGE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {scReason === "Інше" && (
                  <input value={scCustom} onChange={(e) => setScCustom(e.target.value)} placeholder="Опис причини" style={{ ...styles.input, width: 140 }} />
                )}
                <input type="number" value={scAmount} onChange={(e) => setScAmount(e.target.value)} placeholder="Сума" style={{ ...styles.input, width: 80 }} />
              <button onClick={addSurchargeLocal} disabled={!(Number(scAmount) > 0)} style={styles.addSurchargeBtn}>
                <Plus size={13} /> Додати
              </button>
              </div>
            </div>
          )}

          <button onClick={() => setShowHistory((s) => !s)} style={styles.historyToggle}>
            <History size={13} /> Історія правок ({allHistory.length})
          </button>
          {showHistory && (
            <div style={styles.historyList}>
              {allHistory.length === 0 && <div style={styles.mutedSmall}>Ще нема правок</div>}
              {allHistory.map((e, i) => (
                <div key={i} style={styles.historyItem}>
                  {fmtDateTime(e.at)} — {e.field === "status" ? "Статус оплати" : `Пасажир ${e.passengerIndex}`}, {e.field === "tariff" ? "тариф" : e.field === "price" ? "ціна" : e.field === "status" ? "" : "знижка"}:{" "}
                  {String(e.oldValue)} → {String(e.newValue)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type SortKey = "createdDesc" | "createdAsc" | "tripDate" | "status" | "orderNo";
type StatusFilter = "all" | "paid" | "unpaid" | "cancelled";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "createdDesc", label: "Дата створення (нові спершу)" },
  { key: "createdAsc", label: "Дата створення (старі спершу)" },
  { key: "tripDate", label: "Дата поїздки (найближчі спершу)" },
  { key: "status", label: "Статус оплати" },
  { key: "orderNo", label: "Номер замовлення" },
];

const STATUS_FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "paid", label: "Оплачені" },
  { key: "unpaid", label: "Очікують оплати" },
  { key: "cancelled", label: "Скасовані" },
];

// Порядок для сортування за статусом — від "потребує уваги" до "завершено".
const STATUS_ORDER: Record<string, number> = { "не сплачено": 0, "ще невідомо": 1, "оплачено (попереду)": 2, "оплачено (завершено)": 3, "скасовано": 4 };

function statusSortValue(o: OrderRegistryDoc): number {
  const label = backendStatusLabel(o.backendStatus).text;
  return STATUS_ORDER[label] ?? 5;
}

// "Оплачені"/"Очікують оплати"/"Скасовані" — за тим самим backendStatus, що вже показуємо
// в картці (0=скасовано, 1=не сплачено, 2/3=оплачено). Замовлення без backendStatus взагалі
// (ще не синхронізовані) потрапляють в "Очікують оплати" — найбезпечніший дефолт.
function matchesStatusFilter(o: OrderRegistryDoc, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const n = Number(o.backendStatus);
  if (filter === "cancelled") return n === 0;
  if (filter === "paid") return n === 2 || n === 3;
  return !(n === 0 || n === 2 || n === 3); // unpaid — включно з "ще невідомо"
}

function sortOrders(list: OrderRegistryDoc[], key: SortKey): OrderRegistryDoc[] {
  const arr = [...list];
  switch (key) {
    case "createdAsc":
      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "tripDate":
      return arr.sort((a, b) => (a.tripDate || "").localeCompare(b.tripDate || ""));
    case "status":
      return arr.sort((a, b) => statusSortValue(a) - statusSortValue(b));
    case "orderNo":
      return arr.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    case "createdDesc":
    default:
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function OrderRegistry() {
  const [orders, setOrders] = useState<OrderRegistryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdDesc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Фільтр за датою ПОЇЗДКИ (tripDate) — від/до, обидва опційні.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Фільтр за датою БРОНЮВАННЯ (createdAt, ISO) — від/до, окремо від дати поїздки.
  const [bookingDateFrom, setBookingDateFrom] = useState("");
  const [bookingDateTo, setBookingDateTo] = useState("");
  // Один блок замість двох поруч (Кеп, 17.08) — перемикач, який з двох фільтрів дат
  // активний зараз. Значення обох лишаються в стейті незалежно, просто показуємо на екрані
  // тільки один пара полів за раз.
  const [dateFilterMode, setDateFilterMode] = useState<"trip" | "booking">("trip");
  // Фільтр за маршрутом (route1 = id рейсу) — дозволяє знайти всі замовлення одного рейсу
  // і вибрати їх масово для розсилки.
  const [routeFilter, setRouteFilter] = useState("");
  // Кеп (01.09): фільтр по user_id — щоб бачити всі замовлення однієї людини одразу.
  const [userIdFilter, setUserIdFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massTitle, setMassTitle] = useState("");
  const [massBody, setMassBody] = useState("");
  const [massSending, setMassSending] = useState(false);
  const [massResult, setMassResult] = useState<{ sent: number; total: number } | null>(null);

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
    let base = s ? orders.filter((o) => o.orderNo.includes(s)) : orders;
    base = base.filter((o) => matchesStatusFilter(o, statusFilter));
    if (dateFrom) base = base.filter((o) => (o.tripDate || "") >= dateFrom);
    if (dateTo) base = base.filter((o) => (o.tripDate || "") <= dateTo);
    if (bookingDateFrom) base = base.filter((o) => (o.createdAt || "").slice(0, 10) >= bookingDateFrom);
    if (bookingDateTo) base = base.filter((o) => (o.createdAt || "").slice(0, 10) <= bookingDateTo);
    const r = routeFilter.trim();
    if (r) base = base.filter((o) => o.route1 === r);
    const uid = userIdFilter.trim();
    if (uid) base = base.filter((o) => String(o.backendUserId ?? o.userId ?? "") === uid);
    return sortOrders(base, sortKey);
  }, [orders, search, sortKey, statusFilter, dateFrom, dateTo, bookingDateFrom, bookingDateTo, routeFilter, userIdFilter]);

  // Статистика по userId (Кеп, 19.08, точна специфікація):
  // "всі замовлення" = всі документи реєстру з тим самим userId
  // "з додатку" = app1 + app2 (сума)
  // окремо: app1 (Android), app2 (iPhone)
  const userStatsMap = useMemo(() => {
    const map: Record<string, { total: number; app1: number; app2: number }> = {};
    for (const o of orders) {
      const uid = o.backendUserId ?? o.userId;
      if (!uid) continue;
      if (!map[uid]) map[uid] = { total: 0, app1: 0, app2: 0 };
      map[uid].total++;
      const app = String(o.backendAppPlatform ?? o.appPlatform ?? "");
      if (app === "1") map[uid].app1++;
      else if (app === "2") map[uid].app2++;
    }
    return map;
  }, [orders]);

  // ДЕБАГ (Кеп, 19.08): показати сирий JSON усіх документів реєстру з заданим userId —
  // те саме, що бачить userStatsMap, але без обробки, для перевірки напряму.
  const [debugUserId, setDebugUserId] = useState("");
  const [debugData, setDebugData] = useState<any[] | null>(null);
  const runDebug = () => {
    const uid = debugUserId.trim();
    if (!uid) return;
    setDebugData(orders.filter((o) => (o.backendUserId ?? o.userId) === uid));
  };
  const downloadDebug = () => {
    if (!debugData) return;
    const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order_registry_userId_${debugUserId.trim()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (orderNo: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  };

  // Тільки замовлення з userId реально можна вибрати (без нього нема кому слати) —
  // фільтруємо це вже на рівні чекбокса (disabled), тут просто збираємо унікальні userId
  // обраних замовлень (кілька замовлень можуть належати одному юзеру — дублікати прибираємо).
  const selectedUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders) {
      if (selectedIds.has(o.orderNo) && o.userId) ids.add(o.userId);
    }
    return Array.from(ids);
  }, [orders, selectedIds]);

  const sendMassNotification = async () => {
    if (!massTitle.trim() || !massBody.trim() || selectedUserIds.length === 0) return;
    setMassSending(true);
    setMassResult(null);
    try {
      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: massTitle.trim(), body: massBody.trim(), userIds: selectedUserIds, type: "service" }),
      });
      const data = await res.json();
      setMassResult({ sent: data.successCount ?? 0, total: selectedUserIds.length });
      if (data.successCount > 0) {
        setMassTitle("");
        setMassBody("");
        setSelectedIds(new Set());
      }
    } catch {
      setMassResult({ sent: 0, total: selectedUserIds.length });
    } finally {
      setMassSending(false);
    }
  };

  // Підсумковий рядок (Кеп, 17.08) — по відфільтрованому списку (не по всіх замовленнях
  // взагалі), щоб цифри відповідали тому, що зараз реально видно на екрані.
  const summary = useMemo(() => {
    let paid = 0, unpaid = 0, cancelled = 0, passengers = 0;
    for (const o of filtered) {
      const n = Number(o.backendStatus);
      if (n === 0) cancelled++;
      else if (n === 2 || n === 3) paid++;
      else unpaid++;
      passengers += o.passengers?.length ?? 0;
    }
    return { total: filtered.length, paid, unpaid, cancelled, passengers };
  }, [filtered]);

  // Масове "Оновити" (Кеп, 17.08) — ТІЛЬКИ для поточного відфільтрованого списку (звузь
  // фільтрами дату/маршрут/статус спершу), не для всього реєстру одразу — щоб контролювати
  // навантаження на бекенд самому, а не автоматично.
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ backendCallsMade: number; updated: number; notFoundInBackend: number } | null>(null);
  const bulkRefresh = async (orderNosOverride?: string[]) => {
    setBulkRefreshing(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/bulk-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNos: orderNosOverride ?? filtered.map((o) => o.orderNo) }),
      });
      const data = await res.json();
      if (res.ok) setBulkResult({ backendCallsMade: data.backendCallsMade, updated: data.updated, notFoundInBackend: data.notFoundInBackend ?? 0 });
    } catch {
      /* мовчки — кнопка просто лишиться доступною для повтору */
    } finally {
      setBulkRefreshing(false);
    }
  };

  // Кеп (25.08): раніше "Оновити" було лише за ручним кліком (щоб контролювати
  // навантаження, поки метод залежав від sessionKey живих сесій). Тепер, коли є прямий
  // адмінський метод (oid2user-orders, без залежності від сесій юзерів), дані підтягуються
  // АВТОМАТИЧНО одразу при відкритті сторінки — ручна кнопка лишається для повторного
  // оновлення пізніше. Спрацьовує рівно один раз за сесію вкладки, як тільки список
  // замовлень уперше завантажився з Firestore.
  const autoRefreshedRef = useRef(false);
  useEffect(() => {
    if (!loading && orders.length > 0 && !autoRefreshedRef.current) {
      autoRefreshedRef.current = true;
      bulkRefresh(orders.map((o) => o.orderNo).slice(0, 500));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, orders.length]);

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>Реєстр замовлень</h1>
        <p style={styles.subtitle}>
          Усі замовлення (в один і в два боки). Зміни зберігаються сюди й одразу видно в застосунку — але назад на
          бекенд бронювання поки що НЕ передаються автоматично, поки не буде готовий API-метод.
        </p>
      </header>

      <div style={styles.toolbar}>
        <div style={styles.searchBar}>
          <Search size={15} color="var(--text-faint)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук за номером замовлення…" style={styles.searchInput} />
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={styles.sortSelect}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ДЕБАГ (Кеп, 19.08) — сирі дані реєстру по userId, без обробки */}
      <div style={{ background: "rgba(245,166,35,0.1)", border: "1px solid var(--amber)", borderRadius: "var(--radius)", padding: 12, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Дебаг: сирі дані реєстру по userId</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={debugUserId} onChange={(e) => setDebugUserId(e.target.value)} placeholder="userId (напр. 187728)" style={styles.dateInput} />
          <button onClick={runDebug} style={styles.bulkRefreshBtn}>Показати</button>
          {debugData && <button onClick={downloadDebug} style={styles.bulkRefreshBtn}>Зберегти JSON</button>}
        </div>
        {debugData && (
          <>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Знайдено документів: {debugData.length}</div>
            <pre style={{ fontSize: 11, background: "var(--surface)", padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 500, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(debugData, null, 2)}
            </pre>
          </>
        )}
      </div>

      <div style={styles.filterBar}>
        <div style={styles.statusChips}>
          {STATUS_FILTER_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setStatusFilter(o.key)}
              style={{ ...styles.statusChip, ...(statusFilter === o.key ? styles.statusChipActive : {}) }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div style={styles.dateFilter}>
          <select value={dateFilterMode} onChange={(e) => setDateFilterMode(e.target.value as "trip" | "booking")} style={styles.dateModeSelect}>
            <option value="trip">Дата поїздки</option>
            <option value="booking">Дата бронювання</option>
          </select>
          {dateFilterMode === "trip" ? (
            <>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} />
              <span style={styles.mutedSmall}>—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={styles.iconBtn}>
                  <X size={14} />
                </button>
              )}
            </>
          ) : (
            <>
              <input type="date" value={bookingDateFrom} onChange={(e) => setBookingDateFrom(e.target.value)} style={styles.dateInput} />
              <span style={styles.mutedSmall}>—</span>
              <input type="date" value={bookingDateTo} onChange={(e) => setBookingDateTo(e.target.value)} style={styles.dateInput} />
              {(bookingDateFrom || bookingDateTo) && (
                <button onClick={() => { setBookingDateFrom(""); setBookingDateTo(""); }} style={styles.iconBtn}>
                  <X size={14} />
                </button>
              )}
            </>
          )}
        </div>
        <div style={styles.dateFilter}>
          <span style={styles.dateFilterLabel}>Маршрут (route1):</span>
          <input
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            placeholder="напр. 98038"
            style={{ ...styles.dateInput, width: 110 }}
          />
          {routeFilter && (
            <button onClick={() => setRouteFilter("")} style={styles.iconBtn}>
              <X size={14} />
            </button>
          )}
        </div>
        <div style={styles.dateFilter}>
          <span style={styles.dateFilterLabel}>user_id:</span>
          <input
            value={userIdFilter}
            onChange={(e) => setUserIdFilter(e.target.value)}
            placeholder="напр. 187728"
            style={{ ...styles.dateInput, width: 110 }}
          />
          {userIdFilter && (
            <button onClick={() => setUserIdFilter("")} style={styles.iconBtn}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div style={styles.massBox}>
          <div style={styles.notifyLabel}>Масова розсилка обраним ({selectedIds.size} замовлень, {selectedUserIds.length} унікальних отримувачів)</div>
          <input value={massTitle} onChange={(e) => setMassTitle(e.target.value)} placeholder="Тема" style={styles.notifyInput} />
          <textarea value={massBody} onChange={(e) => setMassBody(e.target.value)} placeholder="Текст повідомлення" rows={2} style={styles.notifyTextarea} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={sendMassNotification}
              disabled={massSending || !massTitle.trim() || !massBody.trim()}
              style={{ ...styles.notifySendBtn, opacity: massSending || !massTitle.trim() || !massBody.trim() ? 0.5 : 1 }}
            >
              {massSending ? "Надсилаю…" : `Надіслати обраним (${selectedUserIds.length})`}
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={styles.iconBtn}>Скасувати вибір</button>
            {massResult && (
              <span style={{ fontSize: 12, color: massResult.sent > 0 ? "var(--success, #4CAF50)" : "var(--danger)" }}>
                Доставлено {massResult.sent} з {massResult.total}
              </span>
            )}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ ...styles.summaryBar, marginTop: 0, marginBottom: 16 }}>
          <span><strong>{summary.total}</strong> замовлень у списку</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => bulkRefresh()} disabled={bulkRefreshing} style={styles.bulkRefreshBtn} title="Оновлює тільки поточний відфільтрований список (звузьте фільтром дату/маршрут), дедублікує запити по userId">
            {bulkRefreshing ? "Оновлюю…" : `Оновити ці ${summary.total}`}
          </button>
          {bulkResult && (
            <span style={styles.summaryDot}>
              {bulkResult.updated} оновлено · {bulkResult.backendCallsMade} запитів до бекенду{bulkResult.notFoundInBackend > 0 ? ` · ${bulkResult.notFoundInBackend} не знайдено на бекенді` : ''}
            </span>
          )}
        </div>
      )}

      {loading && <div style={styles.empty}>Завантаження…</div>}
      {!loading && filtered.length === 0 && <div style={styles.empty}>Замовлень не знайдено.</div>}

      <div style={styles.list}>
        {filtered.map((o) => (
          <OrderRow
            key={o.orderNo}
            order={o}
            userStats={(o.backendUserId ?? o.userId) ? userStatsMap[(o.backendUserId ?? o.userId) as string] ?? null : null}
            selected={selectedIds.has(o.orderNo)}
            onToggleSelect={() => toggleSelect(o.orderNo)}
          />
        ))}
      </div>

      {!loading && filtered.length > 0 && (
        <div style={styles.summaryBar}>
          <span><strong>{summary.total}</strong> замовлень</span>
          <span style={styles.summaryDot}>·</span>
          <span style={{ color: "var(--success, #4CAF50)" }}>{summary.paid} оплачено</span>
          <span style={styles.summaryDot}>·</span>
          <span style={{ color: "var(--amber)" }}>{summary.unpaid} очікує</span>
          <span style={styles.summaryDot}>·</span>
          <span style={{ color: "var(--danger, #E53935)" }}>{summary.cancelled} скасовано</span>
          <span style={styles.summaryDot}>·</span>
          <span>{summary.passengers} пасажирів</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => bulkRefresh()} disabled={bulkRefreshing} style={styles.bulkRefreshBtn} title="Оновлює тільки поточний відфільтрований список (звузьте фільтром дату/маршрут), дедублікує запити по userId">
            {bulkRefreshing ? "Оновлюю…" : `Оновити ці ${summary.total}`}
          </button>
          {bulkResult && (
            <span style={styles.summaryDot}>
              {bulkResult.updated} оновлено · {bulkResult.backendCallsMade} запитів до бекенду{bulkResult.notFoundInBackend > 0 ? ` · ${bulkResult.notFoundInBackend} не знайдено на бекенді` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 560 },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "10px 14px", flex: 1 },
  toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  sortSelect: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 12.5, color: "var(--text)", flexShrink: 0 },
  filterBar: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statusChips: { display: "flex", gap: 6, flexWrap: "wrap" },
  statusChip: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "6px 14px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer" },
  statusChipActive: { background: "var(--amber)", borderColor: "var(--amber)", color: "#1a1305", fontWeight: 600 },
  dateFilter: { display: "flex", alignItems: "center", gap: 6 },
  dateFilterLabel: { fontSize: 12, color: "var(--text-faint)" },
  dateInput: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "var(--text)" },
  dateModeSelect: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "var(--text)", fontWeight: 600 },
  summaryBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 16, padding: "12px 14px", background: "var(--surface-2, var(--surface))", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", fontSize: 12.5, color: "var(--text-muted)" },
  summaryDot: { color: "var(--text-faint)" },
  bulkRefreshBtn: { background: "var(--amber)", color: "#1a1305", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  rowStats: { display: "flex", gap: 14, flexShrink: 0 },
  rowStat: { display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46 },
  rowStatValue: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  rowStatLabel: { fontSize: 9.5, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.02em" },
  notifyBox: { background: "var(--surface-2, var(--surface))", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 12, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 },
  notifyLabel: { fontSize: 12, color: "var(--text-faint)", fontWeight: 600 },
  notifyInput: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--text)" },
  notifyTextarea: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--text)", resize: "vertical", fontFamily: "inherit" },
  notifySendBtn: { background: "var(--amber)", color: "#1a1305", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  massBox: { background: "var(--surface-2, var(--surface))", border: "1px solid var(--amber)", borderRadius: "var(--radius)", padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 },
  rowHeaderWrap: { display: "flex", alignItems: "center", gap: 4 },
  rowCheckbox: { width: 16, height: 16, flexShrink: 0, marginLeft: 4, cursor: "pointer" },
  refreshBtn: { marginLeft: 8, background: "none", border: "1px solid var(--hairline)", borderRadius: 6, padding: "3px 10px", fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer" },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13.5 },
  empty: { border: "1px dashed var(--hairline)", borderRadius: "var(--radius)", padding: "28px 20px", color: "var(--text-muted)", fontSize: 13.5, textAlign: "center" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden" },
  rowHeader: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)" },
  orderNo: { fontSize: 13.5, fontWeight: 700 },
  rowMeta: { fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 },
  createdAt: { fontSize: 11, color: "var(--text-faint)", flexShrink: 0 },
  detail: { padding: "0 14px 14px", borderTop: "1px solid var(--hairline)" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10 },
  th: { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-faint)", padding: "6px 8px", borderBottom: "1px solid var(--hairline)" },
  td: { padding: "8px 8px", fontSize: 12.5, borderBottom: "1px solid var(--hairline)", verticalAlign: "middle" },
  select: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)" },
  input: { background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)" },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  totalLine: { fontSize: 13, color: "var(--text-muted)" },
  saveBtn: { background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "9px 18px", fontSize: 12.5, fontWeight: 600, color: "#1a1305" },
  hint: { fontSize: 11, color: "var(--text-faint)", marginTop: 6 },
  error: { fontSize: 12, color: "var(--danger)", marginTop: 6 },
  surchargeBlock: { marginTop: 12, padding: 12, background: "var(--surface-raised)", borderRadius: "var(--radius)", border: "1px dashed var(--hairline-strong)" },
  paidToggle: { display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", marginTop: 14, padding: 0 },
  backendStatusLine: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 },
  surchargeEditRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  iconBtn: { background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 2, display: "flex" },
  surchargeTitle: { fontSize: 12.5, fontWeight: 700, marginBottom: 4 },
  surchargeHint: { fontSize: 11, color: "var(--text-faint)", marginBottom: 10, lineHeight: 1.4 },
  surchargeList: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 },
  surchargeItem: { fontSize: 12, color: "var(--text)" },
  surchargeForm: { display: "flex", gap: 8, flexWrap: "wrap" },
  addSurchargeBtn: { display: "inline-flex", alignItems: "center", gap: 4, background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#1a1305" },
  historyToggle: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, marginTop: 14, cursor: "pointer", padding: 0 },
  historyList: { marginTop: 8, display: "flex", flexDirection: "column", gap: 4 },
  historyItem: { fontSize: 11.5, color: "var(--text-faint)" },
  mutedSmall: { fontSize: 11.5, color: "var(--text-faint)" },
};
