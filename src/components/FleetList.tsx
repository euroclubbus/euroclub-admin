import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { FleetBus } from "../lib/types";
import { FleetItemForm } from "./FleetItemForm";

const COLLECTION = "fleet";

export function FleetList() {
  const [buses, setBuses] = useState<FleetBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBuses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FleetBus, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  type FormData = Omit<FleetBus, "id" | "order">;

  async function handleCreate(data: FormData) {
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const nextOrder = buses.length ? Math.max(...buses.map((b) => b.order)) + 1 : 0;
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
    if (!confirm("Видалити цей автобус з автопарку?")) return;
    await deleteDoc(doc(db, COLLECTION, id));
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= buses.length) return;
    const a = buses[index];
    const b = buses[target];
    await Promise.all([
      updateDoc(doc(db, COLLECTION, a.id), { order: b.order }),
      updateDoc(doc(db, COLLECTION, b.id), { order: a.order }),
    ]);
  }

  const editingBus = editingId && editingId !== "new" ? buses.find((b) => b.id === editingId) : null;

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Автопарк</h1>
          <p style={styles.subtitle}>
            Картки автобусів для сторінки "Автопарк" у додатку. Зміни з'являються одразу, без оновлення додатку.
          </p>
        </div>
        {editingId === null && (
          <button style={styles.addButton} onClick={() => setEditingId("new")}>
            <Plus size={15} strokeWidth={2.5} />
            Додати автобус
          </button>
        )}
      </header>

      {editingId === "new" && (
        <div style={{ marginBottom: 20 }}>
          <FleetItemForm onCancel={() => setEditingId(null)} onSubmit={handleCreate} saving={saving} />
        </div>
      )}

      {loading && <div style={styles.empty}>Завантаження…</div>}

      {!loading && buses.length === 0 && editingId === null && (
        <div style={styles.empty}>Автопарк порожній. Додайте перший автобус — він одразу з'явиться в додатку.</div>
      )}

      <div style={styles.list}>
        {buses.map((bus, index) => {
          if (editingId === bus.id) {
            return (
              <div key={bus.id} style={{ marginBottom: 4 }}>
                <FleetItemForm
                  initial={bus}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(data) => handleUpdate(bus.id, data)}
                  saving={saving}
                />
              </div>
            );
          }
          const activeAmenities = Object.entries(bus.amenities || {}).filter(([, v]) => v).length;
          return (
            <div key={bus.id} style={styles.row}>
              <div style={styles.reorder}>
                <button style={styles.reorderBtn} onClick={() => handleMove(index, -1)} disabled={index === 0} title="Вище">
                  <ChevronUp size={14} />
                </button>
                <button
                  style={styles.reorderBtn}
                  onClick={() => handleMove(index, 1)}
                  disabled={index === buses.length - 1}
                  title="Нижче"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <div style={styles.thumb}>
                {bus.photos?.[0] ? (
                  <img src={bus.photos[0]} alt="" style={styles.thumbImg} />
                ) : (
                  <div style={styles.thumbPlaceholder}>без фото</div>
                )}
              </div>

              <div style={styles.rowText}>
                <div style={styles.rowLabel}>{bus.brandModel}</div>
                <div style={styles.rowMeta}>
                  {bus.plateNumber} · {bus.floors} пов. · {bus.seats} місць · {bus.euroClass} · {activeAmenities}/5 опцій ·{" "}
                  {bus.photos?.length ?? 0} фото ({bus.galleryMode === "slider" ? "слайдер" : "колаж"})
                </div>
              </div>

              <div style={styles.rowActions}>
                <button style={styles.iconBtn} onClick={() => setEditingId(bus.id)} title="Редагувати">
                  <Pencil size={15} />
                </button>
                <button style={{ ...styles.iconBtn, color: "var(--danger)" }} onClick={() => handleDelete(bus.id)} title="Видалити">
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
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 420 },
  addButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--amber)",
    color: "#1a1305",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 14px",
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  empty: {
    border: "1px dashed var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "28px 20px",
    color: "var(--text-muted)",
    fontSize: 13.5,
    textAlign: "center",
  },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
  },
  reorder: { display: "flex", flexDirection: "column" },
  reorderBtn: { background: "transparent", border: "none", color: "var(--text-faint)", padding: 2, lineHeight: 0 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: "var(--radius)",
    overflow: "hidden",
    flexShrink: 0,
    background: "var(--surface-raised)",
  },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    color: "var(--text-faint)",
    textAlign: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: 500 },
  rowMeta: { fontSize: 12, color: "var(--text-faint)", marginTop: 2 },
  rowActions: { display: "flex", gap: 4 },
  iconBtn: { background: "transparent", border: "none", color: "var(--text-muted)", padding: 6, lineHeight: 0 },
};
