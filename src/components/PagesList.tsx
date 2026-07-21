import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { FileText, Plus, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { PageDoc } from "../lib/types";
import { PageEditor } from "./PageEditor";

const PRESETS = [
  { id: "social", title: "Ми в соцмережах" },
];

export function PagesList() {
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "pages"),
      (snap) => {
        setPages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PageDoc, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  async function createPage(id: string, title: string) {
    if (!id.trim() || !title.trim()) return;
    await setDoc(doc(db, "pages", id.trim()), { title: title.trim(), blocks: [] }, { merge: true });
    setCreating(false);
    setNewSlug("");
    setNewTitle("");
    setOpenId(id.trim());
  }

  async function deletePage(id: string) {
    if (!confirm("Видалити цю сторінку повністю?")) return;
    await deleteDoc(doc(db, "pages", id));
  }

  if (openId) {
    return <PageEditor pageId={openId} onBack={() => setOpenId(null)} />;
  }

  const existingIds = new Set(pages.map((p) => p.id));
  const missingPresets = PRESETS.filter((p) => !existingIds.has(p.id));

  return (
    <div>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Сторінки</h1>
          <p style={styles.subtitle}>
            Конструктор статичних сторінок — блоки зображення/відео/текст у довільному порядку. Зміни з'являються в
            додатку одразу.
          </p>
        </div>
        {!creating && (
          <button style={styles.addButton} onClick={() => setCreating(true)}>
            <Plus size={15} strokeWidth={2.5} />
            Нова сторінка
          </button>
        )}
      </header>

      {creating && (
        <div style={styles.createCard}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={styles.input}
              placeholder="slug (напр. about)"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.trim().toLowerCase().replace(/\s+/g, "-"))}
            />
            <input
              style={{ ...styles.input, flex: 1 }}
              placeholder="Назва сторінки"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={styles.cancelBtn} onClick={() => setCreating(false)}>
              Скасувати
            </button>
            <button style={styles.submitBtn} onClick={() => createPage(newSlug, newTitle)}>
              Створити
            </button>
          </div>
        </div>
      )}

      {missingPresets.length > 0 && !creating && (
        <div style={styles.presetsRow}>
          {missingPresets.map((p) => (
            <button key={p.id} style={styles.presetBtn} onClick={() => createPage(p.id, p.title)}>
              <Plus size={13} /> {p.title}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={styles.empty}>Завантаження…</div>}
      {!loading && pages.length === 0 && !creating && <div style={styles.empty}>Сторінок ще нема.</div>}

      <div style={styles.list}>
        {pages.map((p) => (
          <div key={p.id} style={styles.row} onClick={() => setOpenId(p.id)}>
            <FileText size={16} color="var(--text-faint)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.rowLabel}>{p.title || p.id}</div>
              <div style={styles.rowMeta}>
                /{p.id} · {(p.blocks ?? []).length} блоків{p.id === "social" ? ` · ${(p.socialLinks ?? []).length} посилань` : ""}
              </div>
            </div>
            <button
              style={styles.iconBtn}
              onClick={(e) => {
                e.stopPropagation();
                deletePage(p.id);
              }}
              title="Видалити"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 },
  subtitle: { color: "var(--text-muted)", fontSize: 13, marginTop: 6, maxWidth: 440 },
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
  createCard: { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 16 },
  input: {
    background: "var(--surface-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "9px 10px",
    fontSize: 13.5,
    color: "var(--text)",
    outline: "none",
  },
  cancelBtn: { background: "transparent", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 12.5, color: "var(--text-muted)" },
  submitBtn: { background: "var(--amber)", border: "none", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: "#1a1305" },
  presetsRow: { display: "flex", gap: 8, marginBottom: 16 },
  presetBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "transparent",
    border: "1px dashed var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "7px 12px",
    fontSize: 12.5,
    color: "var(--text-muted)",
  },
  empty: { border: "1px dashed var(--hairline)", borderRadius: "var(--radius)", padding: "28px 20px", color: "var(--text-muted)", fontSize: 13.5, textAlign: "center" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
    cursor: "pointer",
  },
  rowLabel: { fontSize: 14, fontWeight: 500 },
  rowMeta: { fontSize: 12, color: "var(--text-faint)", marginTop: 2 },
  iconBtn: { background: "transparent", border: "none", color: "var(--text-muted)", padding: 6 },
};
