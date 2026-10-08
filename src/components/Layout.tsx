import { ReactNode } from "react";
import { currentUser } from "../lib/session";
import { UserCircle, Headphones, Bell, ListTree, Truck, FileText, Waypoints, Inbox, BarChart3, Bus, ClipboardList, Settings, LineChart, Smartphone, Download, AlertTriangle, ShieldCheck, Target, Cake } from "lucide-react";

export type Tab = "profile" | "support" | "push" | "managers" | "menu" | "fleet" | "pages" | "routes" | "inbox" | "report" | "registry" | "marketing" | "channel" | "installs" | "issues" | "consents" | "metaDest" | "clients" | "settings" | "accounts";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  children: ReactNode;
}

const NAV: { id: Tab; label: string; icon: typeof Bell; hint: string }[] = [
  { id: "registry", label: "Реєстр замовлень", icon: ClipboardList, hint: "01" },
  { id: "marketing", label: "Маркетинг", icon: LineChart, hint: "02" },
  { id: "support", label: "Support Center", icon: Headphones, hint: "03" },
  { id: "push", label: "Розсилки", icon: Bell, hint: "04" },
  { id: "menu", label: "Бокове меню", icon: ListTree, hint: "05" },
  { id: "issues", label: "Технічні завдання", icon: AlertTriangle, hint: "06" },
  { id: "settings", label: "Налаштування", icon: Settings, hint: "07" },
  { id: "accounts", label: "Акаунти", icon: ShieldCheck, hint: "08" },
];

// Кеп (08.10): базові доступи менеджера (власник бачить усе; «Профіль» — для всіх).
const MANAGER_TABS: Tab[] = ["registry", "support", "push"];

export function Layout({ active, onChange, children }: Props) {
  // Кеп (06.10): у Support Center меню згортається до іконок, сторінка — на всю ширину.
  const compact = active === "support";
  return (
    <div style={styles.shell}>
      <aside style={compact ? { ...styles.sidebar, width: 64, padding: "24px 8px" } : styles.sidebar}>
        <div style={{ ...styles.brand, justifyContent: compact ? "center" : undefined }}>
          <Bus size={20} color="var(--amber)" strokeWidth={2} />
          {!compact && <span style={styles.brandText}>EUROCLUB</span>}
        </div>
        {compact ? <div style={{ height: 20 }} /> : <div style={styles.brandSub}>Панель керування</div>}

        <nav style={styles.nav}>
          {[...NAV.filter((item) => item.id === "accounts" ? currentUser()?.role === "owner" : currentUser()?.role !== "manager" || MANAGER_TABS.includes(item.id)), { id: "profile" as Tab, label: "Профіль", icon: UserCircle, hint: "··" }].map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                title={item.label}
                style={{
                  ...styles.navItem,
                  ...(compact ? { justifyContent: "center", padding: "12px 0" } : {}),
                  background: isActive ? "var(--surface-raised)" : "transparent",
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  borderLeftColor: isActive ? "var(--amber)" : "transparent",
                }}
              >
                {!compact && <span style={styles.navHint}>{item.hint}</span>}
                <Icon size={compact ? 18 : 16} strokeWidth={2} />
                {!compact && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ ...styles.sidebarFooter, justifyContent: compact ? "center" : undefined }}>
          <span style={styles.dot} />
          {!compact && "Firestore підключено"}
        </div>
      </aside>

      {/* Кеп (01.09): реєстр замовлень — ширші дані (user_id, статистика, кнопки), тому
          для цієї вкладки прибираємо загальне обмеження maxWidth:880, замінюємо на майже
          повну ширину. Інші вкладки лишаються без змін. */}
      <main style={compact ? { ...styles.main, maxWidth: "none", padding: "16px 20px", minWidth: 0 } : active === "registry" ? { ...styles.main, maxWidth: "calc(100vw - 232px - 48px)" } : styles.main}>{children}</main>
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
