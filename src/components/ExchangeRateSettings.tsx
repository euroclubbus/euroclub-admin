import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { Check, Coins } from "lucide-react";
import { db } from "../lib/firebase";

export function ExchangeRateSettings() {
  const [rate, setRate] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "exchangeRate"), (snap) => {
      const v = Number(snap.data()?.eurToUah);
      if (v > 0) {
        setRate(v);
        setInput(String(v));
      } else {
        setRate(50);
        setInput("50");
      }
    });
    return unsub;
  }, []);

  async function save() {
    const v = Number(input);
    if (!(v > 0)) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "exchangeRate"), { eurToUah: v }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <Coins size={16} color="var(--amber)" />
        <span style={styles.title}>Курс EUR → UAH</span>
      </div>
      <p style={styles.subtitle}>
        Використовується в застосунку для перерахунку суми до сплати між валютами. Зміна тут діє одразу для всіх
        користувачів, без оновлення застосунку.
      </p>
      <div style={styles.row}>
        <span style={styles.prefix}>1 EUR =</span>
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={styles.input}
        />
        <span style={styles.suffix}>UAH</span>
        <button onClick={save} disabled={saving || Number(input) === rate} style={styles.saveBtn}>
          {saved ? <Check size={14} /> : saving ? "..." : "Зберегти"}
        </button>
      </div>
      {rate !== null && <div style={styles.current}>Поточне значення: {rate}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 18, marginBottom: 20 },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: 700 },
  subtitle: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14, maxWidth: 480 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  prefix: { fontSize: 13, color: "var(--text-muted)" },
  input: { width: 80, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 14, color: "var(--text)" },
  suffix: { fontSize: 13, color: "var(--text-muted)" },
  saveBtn: { marginLeft: 8, background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305" },
  current: { fontSize: 11.5, color: "var(--text-faint)", marginTop: 10 },
};
