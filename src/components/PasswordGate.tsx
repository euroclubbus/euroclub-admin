import { FormEvent, useState } from "react";
import { Bus } from "lucide-react";

interface Props {
  onUnlock: () => void;
}

// Пароль звіряється з VITE_ADMIN_PASSWORD (env-змінна білду).
// Це НЕ справжня автентифікація — код фронтенду видно в браузері,
// це лише бар'єр від випадкового відкриття панелі. Стан розблокування
// живе тільки в пам'яті React і губиться при перезавантаженні сторінки —
// свідомо, щоб нічого пов'язаного з доступом не лежало в browser storage.
export function PasswordGate({ onUnlock }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const expected = import.meta.env.VITE_ADMIN_PASSWORD;
    if (expected && value === expected) {
      onUnlock();
    } else {
      setError(true);
      setValue("");
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.badge}>
          <Bus size={22} strokeWidth={2} color="var(--amber)" />
        </div>
        <h1 style={styles.title}>EUROCLUB</h1>
        <p style={styles.subtitle}>Панель керування</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            placeholder="Пароль"
            style={{
              ...styles.input,
              borderColor: error ? "var(--danger)" : "var(--hairline)",
            }}
          />
          {error && <div style={styles.error}>Невірний пароль</div>}
          <button type="submit" style={styles.button}>
            Увійти
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: 340,
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "36px 32px 32px",
    textAlign: "center",
    animation: "board-sweep 0.3s ease-out",
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: "var(--radius)",
    background: "var(--amber-glow)",
    border: "1px solid var(--hairline-strong)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 18px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: "0.14em",
    margin: 0,
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: 13,
    marginTop: 6,
    marginBottom: 28,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  input: {
    background: "var(--bg)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 14,
    color: "var(--text)",
    outline: "none",
    textAlign: "center",
    letterSpacing: "0.05em",
  },
  error: {
    color: "var(--danger)",
    fontSize: 12,
  },
  button: {
    marginTop: 6,
    background: "var(--amber)",
    color: "#1a1305",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.03em",
  },
};
