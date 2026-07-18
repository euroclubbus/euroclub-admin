import { useState } from "react";
import { Send } from "lucide-react";

interface Result {
  ok: boolean;
  message: string;
}

export function PushForm({ onSent }: { onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          deepLink: deepLink.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Невідома помилка");
      setResult({
        ok: true,
        message: `Надіслано ${data.successCount} з ${data.targetCount} пристроїв.`,
      });
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
            Надіслати це сповіщення усім користувачам додатку? Дію не можна скасувати.
          </div>
          <div style={styles.confirmActions}>
            <button style={styles.cancel} onClick={() => setConfirming(false)} disabled={sending}>
              Скасувати
            </button>
            <button style={styles.confirmSend} onClick={handleSend} disabled={sending}>
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
