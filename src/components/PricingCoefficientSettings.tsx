import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { Check, Percent, Plus, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";

// ЗАДАЧА 5 (27.08, Кеп): коефіцієнт round-trip (0.95 фіксовані дати / 0.9 відкрита дата)
// — редаговний тут, глобально й по обраних містах відправлення (маркетингове зниження
// ціни на напрямку, чи підняття при високому завантаженні). Застосунок читає це наживо
// (onSnapshot), без потреби деплою.

interface CityRule {
  cityId: string;
  cityName: string;
  fixedDates: number;
  openDate: number;
}

interface CoefficientsDoc {
  fixedDates: number;
  openDate: number;
  cityRules: CityRule[];
}

const DEFAULTS: CoefficientsDoc = { fixedDates: 0.95, openDate: 0.9, cityRules: [] };

export function PricingCoefficientSettings() {
  const [data, setData] = useState<CoefficientsDoc>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCityId, setNewCityId] = useState("");
  const [newCityName, setNewCityName] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "pricingCoefficients"), (snap) => {
      const d = snap.data();
      if (d) {
        setData({
          fixedDates: Number(d.fixedDates) > 0 ? Number(d.fixedDates) : DEFAULTS.fixedDates,
          openDate: Number(d.openDate) > 0 ? Number(d.openDate) : DEFAULTS.openDate,
          cityRules: Array.isArray(d.cityRules) ? d.cityRules : [],
        });
      } else {
        setData(DEFAULTS);
      }
    });
    return unsub;
  }, []);

  async function save(next: CoefficientsDoc) {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "pricingCoefficients"), next, { merge: false });
      setData(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function addCityRule() {
    if (!newCityId.trim() || !newCityName.trim()) return;
    const next: CoefficientsDoc = {
      ...data,
      cityRules: [...data.cityRules, { cityId: newCityId.trim(), cityName: newCityName.trim(), fixedDates: data.fixedDates, openDate: data.openDate }],
    };
    save(next);
    setNewCityId("");
    setNewCityName("");
  }

  function updateCityRule(idx: number, field: "fixedDates" | "openDate", value: number) {
    const next = { ...data, cityRules: data.cityRules.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) };
    save(next);
  }

  function removeCityRule(idx: number) {
    const next = { ...data, cityRules: data.cityRules.filter((_, i) => i !== idx) };
    save(next);
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <Percent size={16} color="var(--amber)" />
        <span style={styles.title}>Коефіцієнт ціноутворення (round-trip)</span>
        {saved && <Check size={14} color="var(--amber)" />}
      </div>
      <p style={styles.subtitle}>
        Множник для суми двох ніг поїздки в два боки. Діє одразу для всіх користувачів, без
        оновлення застосунку. Правило по місту (якщо задане) має пріоритет над глобальним
        значенням.
      </p>

      <div style={styles.globalRow}>
        <div style={styles.globalItem}>
          <span style={styles.label}>Фіксовані дати</span>
          <input
            type="number"
            step="0.01"
            value={data.fixedDates}
            onChange={(e) => setData({ ...data, fixedDates: Number(e.target.value) })}
            onBlur={() => save(data)}
            style={styles.input}
          />
        </div>
        <div style={styles.globalItem}>
          <span style={styles.label}>Відкрита дата</span>
          <input
            type="number"
            step="0.01"
            value={data.openDate}
            onChange={(e) => setData({ ...data, openDate: Number(e.target.value) })}
            onBlur={() => save(data)}
            style={styles.input}
          />
        </div>
        <button onClick={() => save(data)} disabled={saving} style={styles.saveBtn}>
          {saving ? "..." : "Зберегти"}
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.title2}>Правила по містах відправлення</div>
      {data.cityRules.length === 0 && <div style={styles.empty}>Немає окремих правил — діє глобальне значення для всіх міст.</div>}
      {data.cityRules.map((r, idx) => (
        <div key={idx} style={styles.cityRow}>
          <span style={styles.cityName}>{r.cityName} <span style={styles.cityId}>(id {r.cityId})</span></span>
          <input
            type="number"
            step="0.01"
            value={r.fixedDates}
            onChange={(e) => updateCityRule(idx, "fixedDates", Number(e.target.value))}
            style={styles.inputSmall}
            title="Фіксовані дати"
          />
          <input
            type="number"
            step="0.01"
            value={r.openDate}
            onChange={(e) => updateCityRule(idx, "openDate", Number(e.target.value))}
            style={styles.inputSmall}
            title="Відкрита дата"
          />
          <button onClick={() => removeCityRule(idx)} style={styles.removeBtn} title="Прибрати правило">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div style={styles.addRow}>
        <input placeholder="id міста (напр. 1)" value={newCityId} onChange={(e) => setNewCityId(e.target.value)} style={styles.inputSmall} />
        <input placeholder="Назва (напр. Київ)" value={newCityName} onChange={(e) => setNewCityName(e.target.value)} style={{ ...styles.inputSmall, width: 140 }} />
        <button onClick={addCityRule} style={styles.addBtn}>
          <Plus size={14} /> Додати місто
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 18, marginBottom: 20 },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: 700 },
  title2: { fontSize: 13, fontWeight: 700, marginBottom: 10 },
  subtitle: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14, maxWidth: 520 },
  globalRow: { display: "flex", alignItems: "flex-end", gap: 14 },
  globalItem: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11.5, color: "var(--text-muted)" },
  input: { width: 80, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 14, color: "var(--text)" },
  inputSmall: { width: 64, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "6px 8px", fontSize: 13, color: "var(--text)" },
  saveBtn: { background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305" },
  divider: { height: 1, background: "var(--hairline)", margin: "16px 0" },
  empty: { fontSize: 12.5, color: "var(--text-faint)", marginBottom: 10 },
  cityRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  cityName: { fontSize: 13, flex: 1 },
  cityId: { color: "var(--text-faint)", fontSize: 11.5 },
  removeBtn: { background: "none", border: "none", color: "var(--danger, #E53935)", cursor: "pointer", padding: 4 },
  addRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 },
  addBtn: { display: "flex", alignItems: "center", gap: 5, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "7px 12px", fontSize: 12.5, color: "var(--text)", cursor: "pointer" },
};
