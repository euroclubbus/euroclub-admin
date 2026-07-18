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
import { IconName, SideMenuItem } from "../lib/types";
import { iconFor } from "./IconPicker";
import { SideMenuItemForm } from "./SideMenuItemForm";

const COLLECTION = "side_menu_items";

export function SideMenuList() {
  const [items, setItems] = useState<SideMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SideMenuItem, "id">) }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const editingItem = editingId && editingId !== "new" ? items.find((i) => i.id === editingId) : null;

  async function handleCreate(data: { icon: IconName; label: string; url: string }) {
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const nextOrder = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0;
      await setDoc(doc(db, COLLECTION, id), { ...data, order: nextOrder });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, data: { icon: IconName; label: string; url: string }) {
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTION, id), { ...data });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити цей пункт меню?")) return;
    await deleteDoc(doc(db, COLLECTION, id));
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      updateDoc(doc(db, COLLECTION, a.id), { order: b.order }),
      updateDoc(doc(db, COLLECTION, b.id), { order: a.order }),
    ]);
  }

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Бокове меню</h1>
          <p style={styles.subtitle}>
            Пункти показуються в додатку зверху вниз у цьому порядку.
          </p>
        </div>
        {editingId === null && (
          <button style={styles.addButton} onClick={() => setEditingId("new")}>
            <Plus size={15} strokeWidth={2.5} />
            Додати пункт
          </button>
        )}
      </header>

      {editingId === "new" && (
        <div style={{ marginBottom: 20 }}>
          <SideMenuItemForm
            onCancel={() => setEditingId(null)}
            onSubmit={handleCreate}
            saving={saving}
          />
        </div>
      )}

      {loading && <div style={styles.empty}>Завантаження…</div>}

      {!loading && items.length === 0 && editingId === null && (
        <div style={styles.empty}>
          Меню порожнє. Додайте перший пункт — він одразу з'явиться в додатку.
        </div>
      )}

      <div style={styles.list}>
        {items.map((item, index) => {
          const Icon = iconFor(item.icon);
          if (editingId === item.id) {
            return (
              <div key={item.id} style={{ marginBottom: 4 }}>
                <SideMenuItemForm
                  initial={item}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(data) => handleUpdate(item.id, data)}
                  saving={saving}
                />
              </div>
            );
          }
          return (
            <div key={item.id} style={styles.row}>
              <div style={styles.reorder}>
                <button
                  style={styles.reorderBtn}
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  title="Вище"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  style={styles.reorderBtn}
                  onClick={() => handleMove(index, 1)}
                  disabled={index === items.length - 1}
                  title="Нижче"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <div style={styles.rowIcon}>
                <Icon size={17} strokeWidth={2} color="var(--amber)" />
              </div>

              <div style={styles.rowText}>
                <div style={styles.rowLabel}>{item.label}</div>
                <div style={styles.rowUrl}>{item.url}</div>
              </div>

              <div style={styles.rowActions}>
                <button style={styles.iconBtn} onClick={() => setEditingId(item.id)} title="Редагувати">
                  <Pencil size={15} />
                </button>
                <button
                  style={{ ...styles.iconBtn, color: "var(--danger)" }}
                  onClick={() => handleDelete(item.id)}
                  title="Видалити"
                >
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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "0.03em",
    margin: 0,
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: 13,
    marginTop: 6,
    maxWidth: 420,
  },
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
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
  },
  reorder: {
    display: "flex",
    flexDirection: "column",
  },
  reorderBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-faint)",
    padding: 2,
    lineHeight: 0,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: "var(--radius)",
    background: "var(--amber-glow)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: 500,
  },
  rowUrl: {
    fontSize: 12,
    color: "var(--text-faint)",
    fontFamily: "var(--font-mono)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowActions: {
    display: "flex",
    gap: 4,
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    padding: 6,
    lineHeight: 0,
  },
};
