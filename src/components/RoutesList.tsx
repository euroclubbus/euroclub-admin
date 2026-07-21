import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { RouteDoc } from "../lib/types";
import { RouteEditor } from "./RouteEditor";

const COLLECTION = "routes";

export function RoutesList() {
  const [routes, setRoutes] = useState<RouteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRoutes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RouteDoc, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  type FormData = Omit<RouteDoc, "id" | "order">;

  async function handleCreate(data: FormData) {
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const nextOrder = routes.length ? Math.max(...routes.map((r) => r.order)) + 1 : 0;
      await setDoc(doc(db, COLLECTION, id), { ...data, order: nextOrder });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, data: FormData) {
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTION, id), { ...data });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити цей маршрут?")) return;
    await deleteDoc(doc(db, COLLECTION, id));
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= routes.length) return;
    const a = routes[index];
    const b = routes[target];
    await Promise.all([
      updateDoc(doc(db, COLLECTION, a.id), { order: b.order }),
      updateDoc(doc(db, COLLECTION, b.id), { order: a.order }),
    ]);
  }

  const editingRoute = editingId && editingId !== "new" ? routes.find((r) => r.id === editingId) : null;

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Маршрути</h1>
          <p style={styles.subtitle}>Конструктор маршрутів — міста, час, хаби пересадки. Зміни в додатку без оновлення.</p>
        </div>
        {editingId === null && (
          <button style={styles.addButton} onClick={() => setEditingId("new")}>
            <Plus size={15} strokeWidth={2.5} />
            Додати маршрут
          </button>
        )}
      </header>

      {editingId === "new" && (
        <div style={{ marginBottom: 20 }}>
          <RouteEditor onCancel={() => setEditingId(null)} onSubmit={handleCreate} saving={saving} />
        </div>
      )}

      {loading && <div style={styles.empty}>Завантаження…</div>}
      {!loading && routes.length === 0 && editingId === null && <div style={styles.empty}>Маршрутів ще нема.</div>}

      <div style={styles.list}>
        {routes.map((route, index) => {
          if (editingId === route.id) {
            return (
              <div key={route.id} style={{ marginBottom: 4 }}>
                <RouteEditor initial={route} onCancel={() => setEditingId(null)} onSubmit={(data) => handleUpdate(route.id, data)} saving={saving} />
              </div>
            );
          }
          const hubCount = route.cities.filter((c) => c.isHub).length;
          return (
            <div key={route.id} style={styles.row}>
              <div style={styles.reorder}>
                <button style={styles.reorderBtn} onClick={() => handleMove(index, -1)} disabled={index === 0}>
                  <ChevronUp size={14} />
                </button>
                <button style={styles.reorderBtn} onClick={() => handleMove(index, 1)} disabled={index === routes.length - 1}>
                  <ChevronDown size={14} />
                </button>
              </div>
              <div style={styles.rowText}>
                <div style={styles.rowLabel}>{route.name}</div>
                <div style={styles.rowMeta}>
                  {route.cities.map((c) => c.name).join(" → ")}
                  {hubCount > 0 ? ` · ${hubCount} хаб(и)` : ""}
                </div>
              </div>
              <div style={styles.rowActions}>
                <button style={styles.iconBtn} onClick={() => setEditingId(route.id)} title="Редагувати">
                  <Pencil size={15} />
                </button>
                <button style={{ ...styles.iconBtn, color: "var(--danger)" }} onClick={() => handleDelete(route.id)} title="Видалити">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 440 },
  addButton: { display: "flex", alignItems: "center", gap: 6, background: "var(--amber)", color: "#1a1305", border: "none", borderRadius: "var(--radius)", padding: "9px 14px", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" },
  empty: { border: "1px dashed var(--hairline)", borderRadius: "var(--radius)", padding: "28px 20px", color: "var(--text-muted)", fontSize: 13.5, textAlign: "center" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", gap: 14, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: "12px 14px" },
  reorder: { display: "flex", flexDirection: "column" },
  reorderBtn: { background: "transparent", border: "none", color: "var(--text-faint)", padding: 2, lineHeight: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: 500 },
  rowMeta: { fontSize: 12, color: "var(--text-faint)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowActions: { display: "flex", gap: 4 },
  iconBtn: { background: "transparent", border: "none", color: "var(--text-muted)", padding: 6, lineHeight: 0 },
};
