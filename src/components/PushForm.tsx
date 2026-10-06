import { useState } from "react";
import { Send } from "lucide-react";
import { currentUser, sessionHeaders } from "../lib/session";
import type { SegmentTarget } from "./SegmentPanel";

interface Result {
  ok: boolean;
  message: string;
}

export function PushForm({ onSent, notifType, target, onClearTarget }: { onSent: () => void; notifType: "marketing" | "service"; target?: SegmentTarget | null; onClearTarget?: () => void }) {
  const me = currentUser();
  const canBypass = !!me && (me.role === "owner" || me.canBypass);
  const [bypass, setBypass] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  // Тестова відправка: тільки на вказані user_id (через кому), не в історію розсилок.
  const [testIds, setTestIds] = useState(() => {
    try { return localStorage.getItem("push_test_ids") || ""; } catch { return ""; }
  });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  async function handleSend(testOnly = false) {
    const ids = testIds.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (testOnly && ids.length === 0) return;
    try { localStorage.setItem("push_test_ids", testIds); } catch {}
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({
          ...(!testOnly && target ? { userIds: target.userIds, segmentLabel: target.label, segmentId: target.segmentId } : {}),
          ...(!testOnly && bypass ? { bypass: true } : {}),
          title: title.trim(),
          body: body.trim(),
          deepLink: deepLink.trim() || undefined,
          type: notifType,
          ...(testOnly ? { userIds: ids, silent: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Невідома помилка");
      setResult({
        ok: data.successCount > 0,
        message: `Надіслано ${data.successCount} з ${data.targetCount} пристроїв.${data.dedupSkipped ? ` Пропущено ${data.dedupSkipped} (вже отримали розсилку нещодавно).` : ''}${data.workerError ? ` (${data.workerError})` : ''}`,
      });
      if (testOnly) return; // після тесту текст лишаємо — щоб одразу розіслати всім
      setTitle("");
      setBody("");
      setDeepLink("");
      onSent();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Помилка відправки" });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.field}>
        <label style={styles.label}>Заголовок</label>
        <input
          style={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Наприклад: Знижка 20% цього тижня"
          maxLength={80}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Текст</label>
        <textarea
          style={{ ...styles.input, resize: "vertical", minHeight: 72 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст сповіщення для користувачів"
          maxLength={240}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>
          Deep-link <span style={styles.optional}>(необов'язково)</span>
        </label>
        <input
          style={styles.input}
          value={deepLink}
          onChange={(e) => setDeepLink(e.target.value)}
          placeholder="euroclub://routes або https://eclub.com.ua/promo"
        />
      </div>

      {result && (
        <div
          style={{
            ...styles.resultBanner,
            borderColor: result.ok ? "var(--success)" : "var(--danger)",
            color: result.ok ? "var(--success)" : "var(--danger)",
            background: result.ok ? "var(--success-dim)" : "var(--danger-dim)",
          }}
        >
          {result.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
          placeholder="Тест: user_id (через кому), напр. 187728"
          value={testIds}
          onChange={(e) => setTestIds(e.target.value)}
        />
        <button
          style={{ ...styles.cancel, opacity: canSend && testIds.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
          disabled={!canSend || !testIds.trim() || sending}
          onClick={() => handleSend(true)}
        >
          {sending ? "Надсилаю…" : "Тест на ID"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px", fontSize: 13 }}>
        <span style={{ color: "var(--text-muted)" }}>Кому:</span>
        {target ? (
          <>
            <b>Сегмент — {target.userIds.length} клієнтів</b>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{target.label}</span>
            <button style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline", fontSize: 12 }} onClick={onClearTarget}>скинути</button>
          </>
        ) : (
          <b>Всім</b>
        )}
        {canBypass && notifType === "marketing" && (
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} /> Обійти модерацію
          </label>
        )}
      </div>

      {!confirming ? (
        <button
          style={{ ...styles.sendButton, opacity: canSend ? 1 : 0.5 }}
          disabled={!canSend}
          onClick={() => setConfirming(true)}
        >
          <Send size={15} strokeWidth={2.5} />
          Відправити зараз
        </button>
      ) : (
        <div style={styles.confirmBox}>
          <div style={styles.confirmText}>
            {target ? `Надіслати сегменту (${target.userIds.length} клієнтів)?` : "Надіслати це сповіщення усім користувачам додатку?"} Дію не можна скасувати.
          </div>
          <div style={styles.confirmActions}>
            <button style={styles.cancel} onClick={() => setConfirming(false)} disabled={sending}>
              Скасувати
            </button>
            <button style={styles.confirmSend} onClick={() => handleSend(false)} disabled={sending}>
              {sending ? "Надсилаю…" : "Так, надіслати"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  },
  optional: {
    color: "var(--text-faint)",
  },
  input: {
    background: "var(--bg)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    fontFamily: "var(--font-ui)",
  },
  sendButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "var(--amber)",
    color: "#1a1305",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "11px 16px",
    fontSize: 14,
    fontWeight: 600,
    marginTop: 4,
  },
  confirmBox: {
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: 14,
    background: "var(--bg)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  confirmText: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  confirmActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancel: {
    background: "transparent",
    border: "1px solid var(--hairline)",
    color: "var(--text-muted)",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontSize: 13.5,
  },
  confirmSend: {
    background: "var(--danger)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontSize: 13.5,
    fontWeight: 600,
  },
  resultBanner: {
    border: "1px solid",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 13,
  },
};
