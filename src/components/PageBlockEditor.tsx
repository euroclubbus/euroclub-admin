import { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { GripVertical, Image as ImageIcon, Loader2, Trash2, Video as VideoIcon } from "lucide-react";
import { storage } from "../lib/firebase";
import { PageBlock } from "../lib/types";

const QUILL_MODULES = {
  toolbar: [
    [{ header: [false, 1, 2, 3] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link"],
    ["clean"],
  ],
};

interface Props {
  block: PageBlock;
  pageId: string;
  onChange: (block: PageBlock) => void;
  onDelete: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}

export function PageBlockEditor({ block, pageId, onChange, onDelete, dragHandleProps }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const oldUrl = block.url;
      const path = `pages/${pageId}/${crypto.randomUUID()}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange({ ...block, url });
      if (oldUrl) {
        try {
          await deleteObject(ref(storage, oldUrl));
        } catch {
          /* стара версія файлу може вже не існувати — не критично */
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div style={styles.wrap}>
      <div {...dragHandleProps} style={styles.dragHandle} title="Перетягнути">
        <GripVertical size={16} />
      </div>

      <div style={styles.body}>
        <div style={styles.typeLabel}>
          {block.type === "image" ? <ImageIcon size={13} /> : block.type === "video" ? <VideoIcon size={13} /> : "T"}
          {block.type === "image" ? "Зображення" : block.type === "video" ? "Відео" : "Текст"}
        </div>

        {block.type === "text" && (
          <ReactQuill theme="snow" value={block.html ?? ""} onChange={(html) => onChange({ ...block, html })} modules={QUILL_MODULES} />
        )}

        {(block.type === "image" || block.type === "video") && (
          <div>
            {block.url ? (
              block.type === "image" ? (
                <img src={block.url} alt="" style={styles.mediaPreview} />
              ) : (
                <video src={block.url} controls autoPlay muted playsInline style={styles.mediaPreview} />
              )
            ) : (
              <div style={styles.mediaEmpty}>Ще не завантажено</div>
            )}
            <button type="button" style={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 size={14} className="spin" /> : null}
              {uploading ? "Завантаження…" : block.url ? "Замінити файл" : "Завантажити файл"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={block.type === "image" ? "image/*" : "video/*"}
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}
      </div>

      <button type="button" style={styles.deleteBtn} onClick={onDelete} title="Видалити блок">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    gap: 10,
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: "12px 12px 12px 6px",
  },
  dragHandle: {
    display: "flex",
    alignItems: "flex-start",
    paddingTop: 4,
    color: "var(--text-faint)",
    cursor: "grab",
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  typeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-faint)",
  },
  mediaPreview: {
    maxWidth: "100%",
    maxHeight: 220,
    borderRadius: "var(--radius)",
    display: "block",
    marginBottom: 8,
  },
  mediaEmpty: {
    border: "1px dashed var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: 20,
    textAlign: "center",
    color: "var(--text-faint)",
    fontSize: 12.5,
    marginBottom: 8,
  },
  uploadBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "var(--surface-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "7px 12px",
    fontSize: 12.5,
    color: "var(--text)",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-faint)",
    padding: 4,
    height: "fit-content",
    flexShrink: 0,
  },
};
