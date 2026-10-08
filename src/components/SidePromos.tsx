import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";

// Кеп (08.10): блок «Акції та Новини» в боковому меню застосунку. Квадратне фото + текст +
// необов'язкова кнопка. Зміни видно в застосунку одразу (з версії 1.0.29 / 1.3).
interface Promo { id: string; order: number; active: boolean; image?: string; title?: string; text?: string; buttonLabel?: string; buttonUrl?: string; from?: string; to?: string }
type Draft = Omit<Promo, "id" | "order">;
const EMPTY: Draft = { active: true, image: "", title: "", text: "", buttonLabel: "", buttonUrl: "", from: "", to: "" };

// Квадрат 600×600 JPEG — щоб документ був легкий (фото зберігається прямо в Firestore).
function toSquare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 600, side = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function SidePromos() {
  const [list, setList] = useState<Promo[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState("Акції та Новини");

  useEffect(() => {
    getDoc(doc(db, "settings", "sidePromos")).then((s) => { if (s.exists()) { setEnabled(s.get("enabled") !== false); setTitle(s.get("title") || "Акції та Новини"); } });
    return onSnapshot(collection(db, "side_promos"), (snap) => setList(snap.docs.map((x) => ({ id: x.id, ...(x.data() as any) })).sort((a, b) => a.order - b.order)));
  }, []);

  const saveSettings = (patch: { enabled?: boolean; title?: string }) => setDoc(doc(db, "settings", "sidePromos"), { enabled, title, ...patch }, { merge: true });

  async function save() {
    if (edit === "new") await setDoc(doc(db, "side_promos", crypto.randomUUID()), { ...d, order: list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0 });
    else if (edit) await updateDoc(doc(db, "side_promos", edit), { ...d });
    setEdit(null);
  }
  async function move(i: number, dir: -1 | 1) {
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    await Promise.all([updateDoc(doc(db, "side_promos", a.id), { order: b.order }), updateDoc(doc(db, "side_promos", b.id), { order: a.order })]);
  }

  const form = (
    <div style={card}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <label style={{ ...imgBox, cursor: "pointer" }}>
          {d.image ? <img src={d.image} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} alt="" /> : <span style={muted}>+ Квадратне фото</span>}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) setD({ ...d, image: await toSquare(f) }); }} />
        </label>
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={inp} placeholder="Заголовок (необов'язково)" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          <textarea style={{ ...inp, minHeight: 80, fontFamily: "inherit" }} placeholder="Текст" value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Напис кнопки (порожньо — без кнопки)" value={d.buttonLabel} onChange={(e) => setD({ ...d, buttonLabel: e.target.value })} />
            <input style={{ ...inp, flex: 1 }} placeholder="Куди веде: /page/promo, /routes або https://…" value={d.buttonUrl} onChange={(e) => setD({ ...d, buttonUrl: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            Показувати з <input style={inp} type="date" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} />
            по <input style={inp} type="date" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} />
            <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> увімкнено</label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primary} onClick={save} disabled={!d.image && !d.text && !d.title}>Зберегти</button>
            <button style={ghost} onClick={() => setEdit(null)}>Скасувати</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ ...card, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); saveSettings({ enabled: e.target.checked }); }} /> Блок увімкнено в застосунку
        </label>
        <input style={{ ...inp, width: 220 }} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => saveSettings({ title })} placeholder="Назва блоку" />
        <button style={{ ...primary, marginLeft: "auto" }} onClick={() => { setD(EMPTY); setEdit("new"); }}>+ Додати картку</button>
      </div>
      {edit === "new" && form}
      {list.length === 0 && edit !== "new" && <div style={muted}>Карток ще немає</div>}
      {list.map((p, i) => edit === p.id ? <div key={p.id}>{form}</div> : (
        <div key={p.id} style={{ ...card, display: "flex", gap: 12, alignItems: "center", opacity: p.active ? 1 : 0.5 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button style={iconBtn} onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
            <button style={iconBtn} onClick={() => move(i, 1)} disabled={i === list.length - 1}><ChevronDown size={14} /></button>
          </div>
          {p.image ? <img src={p.image} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover" }} alt="" /> : <div style={{ ...imgBox, width: 64, height: 64 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{p.title || "Без заголовка"}{p.active ? "" : " (вимкнено)"}</div>
            <div style={{ ...muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.text}</div>
            <div style={muted}>{p.buttonLabel ? `Кнопка «${p.buttonLabel}» → ${p.buttonUrl}` : "Без кнопки"}{p.from || p.to ? ` · ${p.from || "…"} — ${p.to || "…"}` : ""}</div>
          </div>
          <button style={iconBtn} onClick={() => updateDoc(doc(db, "side_promos", p.id), { active: !p.active })} title={p.active ? "Вимкнути" : "Увімкнути"}>{p.active ? <Eye size={15} /> : <EyeOff size={15} />}</button>
          <button style={iconBtn} onClick={() => { const { id: _i, order: _o, ...rest } = p; setD({ ...EMPTY, ...rest }); setEdit(p.id); }}><Pencil size={15} /></button>
          <button style={{ ...iconBtn, color: "var(--danger)" }} onClick={() => confirm("Видалити картку?") && deleteDoc(doc(db, "side_promos", p.id))}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 14, marginBottom: 10 };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", fontSize: 13 };
const primary: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" };
const ghost: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer" };
const iconBtn: React.CSSProperties = { background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 4 };
const imgBox: React.CSSProperties = { width: 160, height: 160, borderRadius: 10, border: "1px dashed var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
