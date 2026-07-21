import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Image as ImageIcon, Plus, Type, Video as VideoIcon, X } from "lucide-react";
import { db } from "../lib/firebase";
import { PageBlock, PageDoc, SocialLink } from "../lib/types";
import { PageBlockEditor } from "./PageBlockEditor";

interface Props {
  pageId: string;
  onBack: () => void;
}

export function PageEditor({ pageId, onBack }: Props) {
  const [page, setPage] = useState<PageDoc | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "pages", pageId), (snap) => {
      if (snap.exists()) setPage({ id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) });
    });
    return unsub;
  }, [pageId]);

  if (!page) {
    return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Завантаження…</div>;
  }

  async function persistBlocks(blocks: PageBlock[]) {
    setPage((p) => (p ? { ...p, blocks } : p));
    await updateDoc(doc(db, "pages", pageId), { blocks });
  }

  function addBlock(type: PageBlock["type"]) {
    const block: PageBlock = { id: crypto.randomUUID(), type, ...(type === "text" ? { html: "" } : { url: "" }) };
    persistBlocks([...(page!.blocks ?? []), block]);
  }

  function updateBlock(index: number, next: PageBlock) {
    const blocks = [...page!.blocks];
    blocks[index] = next;
    persistBlocks(blocks);
  }

  function deleteBlock(index: number) {
    const blocks = page!.blocks.filter((_, i) => i !== index);
    persistBlocks(blocks);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const blocks = [...page!.blocks];
    const [moved] = blocks.splice(dragIndex, 1);
    blocks.splice(targetIndex, 0, moved);
    setDragIndex(null);
    persistBlocks(blocks);
  }

  async function persistTitle(title: string) {
    setPage((p) => (p ? { ...p, title } : p));
  }

  async function saveTitle() {
    if (!page) return;
    setSavingTitle(true);
    try {
      await updateDoc(doc(db, "pages", pageId), { title: page.title });
    } finally {
      setSavingTitle(false);
    }
  }

  const socialLinks = page.socialLinks ?? [];

  function addSocialLink() {
    const links: SocialLink[] = [...socialLinks, { id: crypto.randomUUID(), platform: "", url: "" }];
    persistSocialLinks(links);
  }
  function updateSocialLink(id: string, patch: Partial<SocialLink>) {
    persistSocialLinks(socialLinks.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function deleteSocialLink(id: string) {
    persistSocialLinks(socialLinks.filter((l) => l.id !== id));
  }
  async function persistSocialLinks(links: SocialLink[]) {
    setPage((p) => (p ? { ...p, socialLinks: links } : p));
    await updateDoc(doc(db, "pages", pageId), { socialLinks: links });
  }

  return (
    <div>
      <button style={styles.backBtn} onClick={onBack}>
        ← Усі сторінки
      </button>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24 }}>
        <input
          style={styles.titleInput}
          value={page.title}
          onChange={(e) => persistTitle(e.target.value)}
          onBlur={saveTitle}
          placeholder="Назва сторінки"
        />
        {savingTitle && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>збереження…</span>}
      </div>

      {page.id === "social" && (
        <div style={styles.socialSection}>
          <div style={styles.sectionTitle}>Посилання на соцмережі</div>
          {socialLinks.map((link) => (
            <div key={link.id} style={styles.socialRow}>
              <input
                style={{ ...styles.input, flex: "0 0 160px" }}
                placeholder="Instagram"
                value={link.platform}
                onChange={(e) => updateSocialLink(link.id, { platform: e.target.value })}
              />
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="https://instagram.com/euroclub"
                value={link.url}
                onChange={(e) => updateSocialLink(link.id, { url: e.target.value })}
              />
              <button type="button" style={styles.iconBtn} onClick={() => deleteSocialLink(link.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" style={styles.addSmallBtn} onClick={addSocialLink}>
            <Plus size={13} /> Додати посилання
          </button>
        </div>
      )}

      <div style={styles.sectionTitle}>Блоки сторінки</div>
      <div style={styles.blockList}>
        {(page.blocks ?? []).map((block, index) => (
          <div
            key={block.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            style={{ opacity: dragIndex === index ? 0.4 : 1 }}
          >
            <PageBlockEditor
              block={block}
              pageId={pageId}
              onChange={(next) => updateBlock(index, next)}
              onDelete={() => deleteBlock(index)}
              dragHandleProps={{}}
            />
          </div>
        ))}
        {(page.blocks ?? []).length === 0 && <div style={styles.emptyBlocks}>Ще нема жодного блоку — додайте перший нижче.</div>}
      </div>

      <div style={styles.addBlockRow}>
        <button type="button" style={styles.addBlockBtn} onClick={() => addBlock("image")}>
          <ImageIcon size={14} /> Зображення
        </button>
        <button type="button" style={styles.addBlockBtn} onClick={() => addBlock("video")}>
          <VideoIcon size={14} /> Відео
        </button>
        <button type="button" style={styles.addBlockBtn} onClick={() => addBlock("text")}>
          <Type size={14} /> Текст
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 12.5,
    marginBottom: 16,
    padding: 0,
    cursor: "pointer",
  },
  titleInput: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: "0.02em",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--hairline-strong)",
    padding: "4px 0",
    color: "var(--text)",
    flex: 1,
    outline: "none",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-faint)",
    margin: "20px 0 10px",
  },
  socialSection: {
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: 16,
  },
  socialRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  input: {
    background: "var(--surface-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    fontSize: 13,
    color: "var(--text)",
    outline: "none",
  },
  iconBtn: { background: "transparent", border: "none", color: "var(--text-faint)", padding: 4 },
  addSmallBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "transparent",
    border: "1px dashed var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "6px 10px",
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 4,
  },
  blockList: { display: "flex", flexDirection: "column", gap: 10 },
  emptyBlocks: {
    border: "1px dashed var(--hairline)",
    borderRadius: "var(--radius)",
    padding: 24,
    textAlign: "center",
    color: "var(--text-faint)",
    fontSize: 13,
  },
  addBlockRow: { display: "flex", gap: 8, marginTop: 14 },
  addBlockBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "var(--amber)",
    color: "#1a1305",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 14px",
    fontSize: 12.5,
    fontWeight: 600,
  },
};
