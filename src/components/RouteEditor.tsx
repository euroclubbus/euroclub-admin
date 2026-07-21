import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { CITIES } from "../lib/cities";
import { HubBranch, RouteCity, RouteDoc } from "../lib/types";

interface Props {
  initial?: RouteDoc;
  onCancel: () => void;
  onSubmit: (data: Omit<RouteDoc, "id" | "order">) => void;
  saving: boolean;
}

export function RouteEditor({ initial, onCancel, onSubmit, saving }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cities, setCities] = useState<RouteCity[]>(initial?.cities ?? []);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pickerCityId, setPickerCityId] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [expandedHub, setExpandedHub] = useState<string | null>(null);

  function addCity() {
    if (!pickerCityId) return;
    const cityInfo = CITIES.find((c) => c.id === pickerCityId);
    if (!cityInfo) return;
    const entry: RouteCity = {
      id: crypto.randomUUID(),
      cityId: cityInfo.id,
      name: cityInfo.name,
      arrivalTime: "",
      departureTime: "",
      isHub: false,
      hubBranches: [],
    };
    setCities((prev) => [...prev, entry]);
    setPickerCityId("");
  }

  function updateCity(id: string, patch: Partial<RouteCity>) {
    setCities((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCity(id: string) {
    setCities((prev) => prev.filter((c) => c.id !== id));
    if (expandedHub === id) setExpandedHub(null);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setCities((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  function addHubBranch(cityRowId: string, branchCityId: string) {
    const info = CITIES.find((c) => c.id === branchCityId);
    if (!info) return;
    setCities((prev) =>
      prev.map((c) =>
        c.id === cityRowId
          ? { ...c, hubBranches: [...c.hubBranches, { cityId: info.id, name: info.name }] }
          : c
      )
    );
  }

  function removeHubBranch(cityRowId: string, branchCityId: string) {
    setCities((prev) =>
      prev.map((c) =>
        c.id === cityRowId ? { ...c, hubBranches: c.hubBranches.filter((b) => b.cityId !== branchCityId) } : c
      )
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || cities.length === 0) return;
    onSubmit({ name: name.trim(), cities, description: description.trim() });
  }

  const usedCityIds = new Set(cities.map((c) => c.cityId));
  const availableCities = CITIES.filter((c) => !usedCityIds.has(c.id));

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <label style={styles.label}>
        Назва маршруту
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Київ — Берлін" autoFocus />
      </label>

      <div>
        <div style={styles.sectionTitle}>Міста слідування</div>
        <div style={styles.cityList}>
          {cities.map((city, index) => (
            <div key={city.id}>
              <div
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                style={{ ...styles.cityRow, opacity: dragIndex === index ? 0.4 : 1 }}
              >
                <span style={styles.cityIndex}>{index + 1}</span>
                <span style={styles.cityName}>{city.name}</span>

                <label style={styles.timeField}>
                  <span style={styles.timeLabel}>Прибуття</span>
                  <input
                    type="time"
                    style={styles.timeInput}
                    value={city.arrivalTime}
                    onChange={(e) => updateCity(city.id, { arrivalTime: e.target.value })}
                    disabled={index === 0}
                  />
                </label>
                <label style={styles.timeField}>
                  <span style={styles.timeLabel}>Відправлення</span>
                  <input
                    type="time"
                    style={styles.timeInput}
                    value={city.departureTime}
                    onChange={(e) => updateCity(city.id, { departureTime: e.target.value })}
                    disabled={index === cities.length - 1}
                  />
                </label>

                <label style={styles.hubCheckbox}>
                  <input
                    type="checkbox"
                    checked={city.isHub}
                    onChange={(e) => {
                      updateCity(city.id, { isHub: e.target.checked });
                      if (e.target.checked) setExpandedHub(city.id);
                    }}
                  />
                  Хаб
                </label>

                {city.isHub && (
                  <button
                    type="button"
                    style={styles.iconBtn}
                    onClick={() => setExpandedHub(expandedHub === city.id ? null : city.id)}
                  >
                    {expandedHub === city.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}

                <button type="button" style={styles.iconBtn} onClick={() => removeCity(city.id)}>
                  <X size={14} />
                </button>
              </div>

              {city.isHub && expandedHub === city.id && (
                <div style={styles.hubPanel}>
                  <div style={styles.hubPanelTitle}>Гілка пересадки з {city.name}</div>
                  <div style={styles.hubBranchList}>
                    {city.hubBranches.map((b) => (
                      <span key={b.cityId} style={styles.hubChip}>
                        {b.name}
                        <button type="button" onClick={() => removeHubBranch(city.id, b.cityId)} style={styles.hubChipRemove}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    {city.hubBranches.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Ще нема міст у гілці</span>}
                  </div>
                  <select
                    style={styles.input}
                    value=""
                    onChange={(e) => e.target.value && addHubBranch(city.id, e.target.value)}
                  >
                    <option value="">+ Додати місто до гілки…</option>
                    {CITIES.filter((c) => c.id !== city.cityId && !city.hubBranches.some((b) => b.cityId === c.id)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
          {cities.length === 0 && <div style={styles.emptyCities}>Додайте перше місто нижче</div>}
        </div>

        <div style={styles.addCityRow}>
          <select style={{ ...styles.input, flex: 1 }} value={pickerCityId} onChange={(e) => setPickerCityId(e.target.value)}>
            <option value="">Обрати місто зі списку (за алфавітом)…</option>
            {availableCities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" style={styles.addCityBtn} onClick={addCity} disabled={!pickerCityId}>
            <Plus size={14} /> Додати
          </button>
        </div>
      </div>

      <label style={styles.label}>
        Опис
        <textarea
          style={{ ...styles.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Стандартний опис маршруту…"
        />
      </label>

      <div style={styles.actions}>
        <button type="button" style={styles.cancelBtn} onClick={onCancel}>
          Скасувати
        </button>
        <button type="submit" style={styles.submitBtn} disabled={saving}>
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </div>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)" },
  input: {
    background: "var(--surface-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "9px 10px",
    fontSize: 13.5,
    color: "var(--text)",
    outline: "none",
  },
  sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 },
  cityList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  cityRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--surface-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    cursor: "grab",
  },
  cityIndex: { fontSize: 11, color: "var(--text-faint)", width: 16, flexShrink: 0 },
  cityName: { fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 90 },
  timeField: { display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 },
  timeLabel: { fontSize: 9.5, color: "var(--text-faint)", textTransform: "uppercase" },
  timeInput: { background: "var(--surface)", border: "1px solid var(--hairline-strong)", borderRadius: 6, padding: "4px 6px", fontSize: 12.5, color: "var(--text)" },
  hubCheckbox: { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap" },
  iconBtn: { background: "transparent", border: "none", color: "var(--text-faint)", padding: 3, flexShrink: 0 },
  emptyCities: { border: "1px dashed var(--hairline)", borderRadius: "var(--radius)", padding: 16, textAlign: "center", color: "var(--text-faint)", fontSize: 12.5 },
  addCityRow: { display: "flex", gap: 8 },
  addCityBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "var(--surface-raised)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 12.5, color: "var(--text)", whiteSpace: "nowrap" },
  hubPanel: { marginLeft: 26, marginTop: 4, marginBottom: 4, padding: 10, background: "var(--surface-raised)", borderRadius: "var(--radius)", border: "1px dashed var(--hairline-strong)" },
  hubPanelTitle: { fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 },
  hubBranchList: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  hubChip: { display: "inline-flex", alignItems: "center", gap: 4, background: "var(--amber)", color: "#1a1305", borderRadius: 20, padding: "3px 8px 3px 10px", fontSize: 11.5, fontWeight: 600 },
  hubChipRemove: { background: "none", border: "none", color: "#1a1305", padding: 0, display: "flex" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8 },
  cancelBtn: { background: "transparent", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 13, color: "var(--text-muted)" },
  submitBtn: { background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#1a1305" },
};
