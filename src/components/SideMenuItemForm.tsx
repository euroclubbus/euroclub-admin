import { useEffect, useState } from "react";
import { IconPicker } from "./IconPicker";
import { IconName, SideMenuItem } from "../lib/types";

interface Props {
  initial?: SideMenuItem | null;
  onSubmit: (data: { icon: IconName; label: string; url: string }) => void;
  onCancel: () => void;
  saving: boolean;
}

export function SideMenuItemForm({ initial, onSubmit, onCancel, saving }: Props) {
  const [icon, setIcon] = useState<IconName>(initial?.icon ?? "Info");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");

  useEffect(() => {
    setIcon(initial?.icon ?? "Info");
    setLabel(initial?.label ?? "");
    setUrl(initial?.url ?? "");
  }, [initial]);

  const canSave = label.trim().length > 0 && url.trim().length > 0;

  return (
    <div style={styles.card}>
      <div style={styles.field}>
        <label style={styles.label}>Іконка</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Лейбл</label>
        <input
          style={styles.input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Наприклад: Маршрути"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>URL</label>
        <input
          style={styles.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://eclub.com.ua/routes"
        />
      </div>

      <div style={styles.actions}>
        <button style={styles.cancel} onClick={onCancel} type="button">
          Скасувати
        </button>
        <button
          style={{ ...styles.save, opacity: canSave && !saving ? 1 : 0.5 }}
          disabled={!canSave || saving}
          onClick={() => onSubmit({ icon, label: label.trim(), url: url.trim() })}
          type="button"
        >
          {saving ? "Зберігаю…" : initial ? "Зберегти зміни" : "Додати пункт"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: 20,
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
  input: {
    background: "var(--bg)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "9px 11px",
    fontSize: 14,
    outline: "none",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancel: {
    background: "transparent",
    border: "1px solid var(--hairline)",
    color: "var(--text-muted)",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontSize: 13.5,
  },
  save: {
    background: "var(--amber)",
    color: "#1a1305",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 18px",
    fontSize: 13.5,
    fontWeight: 600,
  },
};
