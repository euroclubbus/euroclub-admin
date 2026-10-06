import { ReactNode, useState } from "react";

// Кеп (06.10): групування розділів адмінки — один пункт меню, всередині вкладки.
export function TabGroup({ tabs }: { tabs: { id: string; label: string; render: () => ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const cur = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "1px solid var(--hairline)",
              background: t.id === cur?.id ? "var(--amber)" : "transparent",
              color: t.id === cur?.id ? "#111" : "inherit",
              fontWeight: t.id === cur?.id ? 600 : 400,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={cur?.id}>{cur?.render()}</div>
    </div>
  );
}
