import { FileText, Gift, Map, Bus, Star, Share2, Info } from "lucide-react";
import { ICON_NAMES, IconName } from "../lib/types";

const ICON_MAP: Record<IconName, typeof FileText> = {
  FileText,
  Gift,
  Map,
  Bus,
  Star,
  Share2,
  Info,
};

export function iconFor(name: IconName) {
  return ICON_MAP[name] ?? Info;
}

interface Props {
  value: IconName;
  onChange: (name: IconName) => void;
}

export function IconPicker({ value, onChange }: Props) {
  return (
    <div style={styles.grid}>
      {ICON_NAMES.map((name) => {
        const Icon = ICON_MAP[name];
        const isActive = name === value;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={name}
            style={{
              ...styles.item,
              background: isActive ? "var(--amber-glow)" : "var(--bg)",
              borderColor: isActive ? "var(--amber)" : "var(--hairline)",
              color: isActive ? "var(--amber)" : "var(--text-muted)",
            }}
          >
            <Icon size={17} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  item: {
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
  },
};
