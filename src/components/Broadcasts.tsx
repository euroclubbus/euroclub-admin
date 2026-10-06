import { useState } from "react";
import { Menu } from "lucide-react";
import { PushForm } from "./PushForm";
import { PushHistory } from "./PushHistory";
import { InboxList } from "./InboxList";
import { SegmentPanel, SegmentTarget } from "./SegmentPanel";
import { currentUser } from "../lib/session";

// Кеп (06.10): одна вкладка «Розсилки» з двома підвкладками — PUSH і Вхідні.
// Сегментація відкривається гамбургером зверху в PUSH.
export function Broadcasts() {
  const me = currentUser();
  const [sub, setSub] = useState<"push" | "inbox">("push");
  const [section, setSection] = useState<"marketing" | "service">("marketing");
  const [segOpen, setSegOpen] = useState(false);
  const [target, setTarget] = useState<SegmentTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={title}>Розсилки</h1>
      </header>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={{ ...chip, ...(sub === "push" ? chipOn : {}) }} onClick={() => setSub("push")}>PUSH</button>
        <button style={{ ...chip, ...(sub === "inbox" ? chipOn : {}) }} onClick={() => setSub("inbox")}>Вхідні</button>
      </div>

      {sub === "inbox" ? (
        <InboxList />
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <button style={{ ...chip, display: "flex", alignItems: "center", gap: 6, ...(segOpen ? chipOn : {}) }} onClick={() => setSegOpen((v) => !v)}>
              <Menu size={15} /> Сегментація
            </button>
            <span style={{ width: 12 }} />
            <button style={{ ...chip, ...(section === "marketing" ? chipOn : {}) }} onClick={() => setSection("marketing")}>Маркетингова</button>
            <button style={{ ...chip, ...(section === "service" ? chipOn : {}) }} onClick={() => setSection("service")}>Сервісна</button>
          </div>

          {segOpen && (
            <SegmentPanel
              onClose={() => setSegOpen(false)}
              onApply={(t) => {
                setTarget(t);
                setSegOpen(false);
              }}
            />
          )}

          <div style={{ marginBottom: 32 }}>
            <PushForm key={section} notifType={section} target={target} onClearTarget={() => setTarget(null)} onSent={() => setRefreshKey((k) => k + 1)} />
          </div>
          <PushHistory refreshKey={refreshKey} senderId={me?.role === "owner" ? undefined : me?.id} />
        </div>
      )}
    </div>
  );
}

const title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 };
const chip: React.CSSProperties = { padding: "8px 18px", borderRadius: 999, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 14 };
const chipOn: React.CSSProperties = { background: "var(--amber)", color: "#111", borderColor: "var(--amber)", fontWeight: 600 };
