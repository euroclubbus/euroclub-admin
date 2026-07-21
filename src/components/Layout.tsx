import { ReactNode } from "react";
import { Bell, ListTree, Truck, FileText, Waypoints, Inbox, BarChart3, Bus } from "lucide-react";

export type Tab = "push" | "menu" | "fleet" | "pages" | "routes" | "inbox" | "report";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  children: ReactNode;
}

const NAV: { id: Tab; label: string; icon: typeof Bell; hint: string }[] = [
  { id: "push", label: "Push-розсилки", icon: Bell, hint: "01" },
  { id: "menu", label: "Бокове меню", icon: ListTree, hint: "02" },
  { id: "fleet", label: "Автопарк", icon: Truck, hint: "03" },
  { id: "routes", label: "Маршрути", icon: Waypoints, hint: "04" },
  { id: "pages", label: "Сторінки", icon: FileText, hint: "05" },
  { id: "inbox", label: "Вхідні", icon: Inbox, hint: "06" },
  { id: "report", label: "Звіт і сегменти", icon: BarChart3, hint: "07" },
];

export function Layout({ active, onChange, children }: Props) {
  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <Bus size={20} color="var(--amber)" strokeWidth={2} />
          <span style={styles.brandText}>EUROCLUB</span>
        </div>
        <div style={styles.brandSub}>Панель керування</div>

        <nav style={styles.nav}>
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                style={{
                  ...styles.navItem,
                  background: isActive ? "var(--surface-raised)" : "transparent",
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  borderLeftColor: isActive ? "var(--amber)" : "transparent",
                }}
              >
                <span style={styles.navHint}>{item.hint}</span>
                <Icon size={16} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <span style={styles.dot} />
          Firestore підключено
        </div>
      </aside>

      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    minHeight: "100%",
  },
  sidebar: {
    width: 232,
    flexShrink: 0,
    background: "var(--surface)",
    borderRight: "1px solid var(--hairline)",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    height: "100vh",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 8px",
  },
  brandText: {
    fontFamily: "var(--font-display)",
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "0.12em",
  },
  brandSub: {
    color: "var(--text-faint)",
    fontSize: 11,
    padding: "4px 8px 20px",
    letterSpacing: "0.04em",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "none",
    borderLeft: "2px solid transparent",
    borderRadius: 0,
    padding: "10px 10px",
    fontSize: 13.5,
    fontWeight: 500,
    textAlign: "left",
    transition: "background 0.15s, color 0.15s",
  },
  navHint: {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    color: "var(--text-faint)",
    width: 14,
  },
  sidebarFooter: {
    marginTop: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--text-faint)",
    padding: "0 8px",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--success)",
    boxShadow: "0 0 0 3px var(--success-dim)",
  },
  main: {
    flex: 1,
    padding: "36px 44px",
    maxWidth: 880,
  },
};
