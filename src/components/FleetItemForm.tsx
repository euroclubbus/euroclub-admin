import { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { ChevronDown, ChevronUp, Image as ImageIcon, Loader2, X } from "lucide-react";
import { storage } from "../lib/firebase";
import { DEFAULT_AMENITIES, EuroClass, FleetAmenities, FleetBus } from "../lib/types";

type FormData = Omit<FleetBus, "id" | "order">;

interface Props {
  initial?: FleetBus;
  onCancel: () => void;
  onSubmit: (data: FormData) => void;
  saving: boolean;
}

const AMENITY_LABELS: { key: keyof FleetAmenities; label: string }[] = [
  { key: "climate", label: "Клімат-контроль" },
  { key: "vip", label: "Віп-салон" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "toilet", label: "Туалет" },
  { key: "kitchen", label: "Кухня (чай, кава, окріп)" },
];

export function FleetItemForm({ initial, onCancel, onSubmit, saving }: Props) {
  const [brandModel, setBrandModel] = useState(initial?.brandModel ?? "");
  const [plateNumber, setPlateNumber] = useState(initial?.plateNumber ?? "");
  const [floors, setFloors] = useState<1 | 2>(initial?.floors ?? 1);
  const [seats, setSeats] = useState(initial?.seats?.toString() ?? "");
  const [euroClass, setEuroClass] = useState<EuroClass>(initial?.euroClass ?? "Euro 5");
  const [amenities, setAmenities] = useState<FleetAmenities>(initial?.amenities ?? DEFAULT_AMENITIES);
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [galleryMode, setGalleryMode] = useState<"slider" | "collage">(initial?.galleryMode ?? "slider");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const path = `fleet/${crypto.randomUUID()}-${file.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file);
        uploaded.push(await getDownloadURL(fileRef));
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function removePhoto(index: number) {
    const url = photos[index];
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    // Найкраще зусилля — якщо видалення зі Storage впаде (наприклад, файл
    // уже видалений вручну), все одно прибираємо посилання зі списку.
    try {
      await deleteObject(ref(storage, url));
    } catch {
      /* ignore */
    }
  }

  function toggleAmenity(key: keyof FleetAmenities) {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandModel.trim() || !plateNumber.trim() || !seats.trim()) return;
    onSubmit({
      brandModel: brandModel.trim(),
      plateNumber: plateNumber.trim(),
      floors,
      seats: Number(seats) || 0,
      euroClass,
      amenities,
      photos,
      galleryMode,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <div style={styles.row}>
        <label style={styles.label}>
          Марка та модель
          <input
            style={styles.input}
            value={brandModel}
            onChange={(e) => setBrandModel(e.target.value)}
            placeholder="Mercedes-Benz Tourismo"
            autoFocus
          />
        </label>
      </div>

      <div style={styles.rowSplit}>
        <label style={styles.label}>
          Номерний знак
          <input
            style={styles.input}
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
            placeholder="AA 1234 BB"
          />
        </label>
        <label style={styles.label}>
          Поверхів
          <select style={styles.input} value={floors} onChange={(e) => setFloors(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      </div>

      <div style={styles.rowSplit}>
        <label style={styles.label}>
          Кількість місць
          <input
            style={styles.input}
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            placeholder="49"
          />
        </label>
        <label style={styles.label}>
          Екологічна класифікація
          <select style={styles.input} value={euroClass} onChange={(e) => setEuroClass(e.target.value as EuroClass)}>
            <option value="Euro 5">Euro 5</option>
            <option value="Euro 6">Euro 6</option>
          </select>
        </label>
      </div>

      <div style={styles.amenities}>
        {AMENITY_LABELS.map(({ key, label }) => (
          <label key={key} style={styles.checkboxRow}>
            <input type="checkbox" checked={amenities[key]} onChange={() => toggleAmenity(key)} />
            {label}
          </label>
        ))}
      </div>

      <div style={styles.photosSection}>
        <div style={styles.photosHeader}>
          <span style={styles.label as React.CSSProperties}>Фото</span>
          <div style={styles.galleryToggle}>
            {(["slider", "collage"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setGalleryMode(mode)}
                style={{
                  ...styles.toggleBtn,
                  background: galleryMode === mode ? "var(--amber)" : "transparent",
                  color: galleryMode === mode ? "#1a1305" : "var(--text-muted)",
                }}
              >
                {mode === "slider" ? "Слайдер" : "Колаж"}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.photoGrid}>
          {photos.map((url, i) => (
            <div key={url} style={styles.photoThumb}>
              <img src={url} alt="" style={styles.photoImg} />
              <div style={styles.photoActions}>
                <button type="button" style={styles.photoActionBtn} onClick={() => movePhoto(i, -1)} disabled={i === 0} title="Ліворуч">
                  <ChevronUp size={12} style={{ transform: "rotate(-90deg)" }} />
                </button>
                <button type="button" style={styles.photoActionBtn} onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1} title="Праворуч">
                  <ChevronDown size={12} style={{ transform: "rotate(-90deg)" }} />
                </button>
                <button type="button" style={{ ...styles.photoActionBtn, color: "var(--danger)" }} onClick={() => removePhoto(i)} title="Видалити">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
          <button type="button" style={styles.addPhotoBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={18} className="spin" /> : <ImageIcon size={18} />}
            <span style={{ fontSize: 11 }}>{uploading ? "Завантаження…" : "Додати фото"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      <div style={styles.actions}>
        <button type="button" style={styles.cancelBtn} onClick={onCancel}>
          Скасувати
        </button>
        <button type="submit" style={styles.submitBtn} disabled={saving || uploading}>
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </div>
    </form>
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
    gap: 14,
  },
  row: { display: "flex", flexDirection: "column" },
  rowSplit: { display: "flex", gap: 14 },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
  },
  input: {
    background: "var(--surface-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "9px 10px",
    fontSize: 13.5,
    color: "var(--text)",
    outline: "none",
  },
  amenities: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: "12px 0",
    borderTop: "1px solid var(--hairline)",
    borderBottom: "1px solid var(--hairline)",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text)",
  },
  photosSection: { display: "flex", flexDirection: "column", gap: 10 },
  photosHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  galleryToggle: {
    display: "inline-flex",
    background: "var(--surface-raised)",
    borderRadius: "var(--radius)",
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    border: "none",
    borderRadius: "var(--radius)",
    padding: "5px 10px",
    fontSize: 11.5,
    fontWeight: 600,
  },
  photoGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  photoThumb: {
    position: "relative",
    width: 84,
    height: 84,
    borderRadius: "var(--radius)",
    overflow: "hidden",
    border: "1px solid var(--hairline-strong)",
  },
  photoImg: { width: "100%", height: "100%", objectFit: "cover" },
  photoActions: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  photoActionBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "none",
    borderRadius: 2,
    color: "#fff",
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoBtn: {
    width: 84,
    height: 84,
    borderRadius: "var(--radius)",
    border: "1px dashed var(--hairline-strong)",
    background: "transparent",
    color: "var(--text-faint)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  cancelBtn: {
    background: "transparent",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  },
  submitBtn: {
    background: "var(--amber)",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    color: "#1a1305",
  },
};
