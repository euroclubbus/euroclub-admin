import { useState } from "react";
import { PasswordGate } from "./components/PasswordGate";
import { Layout, Tab } from "./components/Layout";
import { PushForm } from "./components/PushForm";
import { PushHistory } from "./components/PushHistory";
import { SideMenuList } from "./components/SideMenuList";
import { FleetList } from "./components/FleetList";
import { PagesList } from "./components/PagesList";
import { RoutesList } from "./components/RoutesList";
import { InboxList } from "./components/InboxList";
import { ReportFilters } from "./components/ReportFilters";
import { OrderRegistry } from "./components/OrderRegistry";
import { MarketingDashboard } from "./components/MarketingDashboard";
import { ChannelReport } from "./components/ChannelReport";
import { ExchangeRateSettings } from "./components/ExchangeRateSettings";
import { PricingCoefficientSettings } from "./components/PricingCoefficientSettings";
import { InstallStats } from "./components/InstallStats";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>("push");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushSection, setPushSection] = useState<"marketing" | "service">("marketing");

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <Layout active={tab} onChange={setTab}>
      {tab === "push" ? (
        <div>
          <header style={{ marginBottom: 24 }}>
            <h1 style={headerTitle}>Push-розсилки</h1>
            <p style={headerSubtitle}>
              Сповіщення йдуть одразу всім пристроям з увімкненими push у додатку. Маркетингова —
              загальні акції/новини. Сервісна — транзакційні (по замовленню/рейсу), позначаються
              червоною міткою в "Моїх сповіщеннях" юзера.
            </p>
          </header>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button
              onClick={() => setPushSection("marketing")}
              style={{ ...tabChip, ...(pushSection === "marketing" ? tabChipActive : {}) }}
            >
              Маркетингова
            </button>
            <button
              onClick={() => setPushSection("service")}
              style={{ ...tabChip, ...(pushSection === "service" ? tabChipActive : {}) }}
            >
              Сервісна
            </button>
          </div>
          <div style={{ marginBottom: 32 }}>
            <PushForm key={pushSection} onSent={() => setRefreshKey((k) => k + 1)} notifType={pushSection} />
          </div>
          <PushHistory refreshKey={refreshKey} />
        </div>
      ) : tab === "menu" ? (
        <SideMenuList />
      ) : tab === "fleet" ? (
        <FleetList />
      ) : tab === "routes" ? (
        <RoutesList />
      ) : tab === "pages" ? (
        <PagesList />
      ) : tab === "inbox" ? (
        <InboxList />
      ) : tab === "report" ? (
        <ReportFilters />
      ) : tab === "registry" ? (
        <OrderRegistry />
      ) : tab === "marketing" ? (
        <MarketingDashboard />
      ) : tab === "channel" ? (
        <ChannelReport />
      ) : tab === "installs" ? (
        <InstallStats />
      ) : (
        <div>
          <header style={{ marginBottom: 24 }}>
            <h1 style={headerTitle}>Налаштування</h1>
          </header>
          <ExchangeRateSettings />
          <PricingCoefficientSettings />
        </div>
      )}
    </Layout>
  );
}

const headerTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: "0.03em",
  margin: 0,
};

const headerSubtitle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 13,
  marginTop: 6,
  maxWidth: 460,
};

const tabChip: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 20,
  padding: "7px 16px",
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
};

const tabChipActive: React.CSSProperties = {
  background: "var(--amber)",
  borderColor: "var(--amber)",
  color: "#1a1305",
  fontWeight: 600,
};
