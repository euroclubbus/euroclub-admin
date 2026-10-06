import { ExternalLink } from "lucide-react";

// Кеп (06.10): EUROCLUB SUPPORT CENTER (ecrm) — окремий проєкт зі своєю базою і вебхуками,
// в адмінці відкривається як вкладка.
const URL = "https://ecrm-fwbs.vercel.app";

export function SupportCenter() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "0.03em", margin: 0 }}>EUROCLUB SUPPORT CENTER</h1>
        <a href={URL} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <ExternalLink size={14} /> Відкрити в новій вкладці
        </a>
      </div>
      <iframe
        src={URL}
        title="EUROCLUB SUPPORT CENTER"
        style={{ flex: 1, width: "100%", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", background: "#fff" }}
        allow="clipboard-read; clipboard-write; microphone; camera; notifications"
      />
    </div>
  );
}
