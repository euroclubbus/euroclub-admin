import { useState } from "react";
import { PasswordGate } from "./components/PasswordGate";
import { Layout, Tab } from "./components/Layout";
import { Broadcasts } from "./components/Broadcasts";
import { TabGroup } from "./components/TabGroup";
import { SideMenuList } from "./components/SideMenuList";
import { FleetList } from "./components/FleetList";
import { PagesList } from "./components/PagesList";
import { RoutesList } from "./components/RoutesList";
import { OrderRegistry } from "./components/OrderRegistry";
import { MarketingDashboard } from "./components/MarketingDashboard";
import { ChannelReport } from "./components/ChannelReport";
import { ExchangeRateSettings } from "./components/ExchangeRateSettings";
import { PricingCoefficientSettings } from "./components/PricingCoefficientSettings";
import { InstallStats } from "./components/InstallStats";
import { AppIssues } from "./components/AppIssues";
import { TrackingConsents } from "./components/TrackingConsents";
import { MetaDestinations } from "./components/MetaDestinations";
import { ClientProfiles } from "./components/ClientProfiles";

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
        <Broadcasts />
      ) : tab === "menu" ? (
        <TabGroup tabs={[
          { id: "menu", label: "Бокове меню", render: () => <SideMenuList /> },
          { id: "fleet", label: "Автопарк", render: () => <FleetList /> },
          { id: "routes", label: "Маршрути", render: () => <RoutesList /> },
          { id: "pages", label: "Сторінки", render: () => <PagesList /> },
        ]} />
      ) : tab === "registry" ? (
        <OrderRegistry />
      ) : tab === "marketing" ? (
        <TabGroup tabs={[
          { id: "marketing", label: "Маркетинг", render: () => <MarketingDashboard /> },
          { id: "channel", label: "Ефективність каналу", render: () => <ChannelReport /> },
          { id: "installs", label: "Встановлення", render: () => <InstallStats /> },
          { id: "consents", label: "Згода на відстеження", render: () => <TrackingConsents /> },
          { id: "metaDest", label: "Meta-кабінети", render: () => <MetaDestinations /> },
          { id: "clients", label: "Клієнти: ДН і міста", render: () => <ClientProfiles /> },
        ]} />
      ) : tab === "issues" ? (
        <TabGroup tabs={[{ id: "issues", label: "Проблеми застосунку", render: () => <AppIssues /> }]} />
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
