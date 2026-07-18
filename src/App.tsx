import { useState } from "react";
import { PasswordGate } from "./components/PasswordGate";
import { Layout, Tab } from "./components/Layout";
import { PushForm } from "./components/PushForm";
import { PushHistory } from "./components/PushHistory";
import { SideMenuList } from "./components/SideMenuList";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>("push");
  const [refreshKey, setRefreshKey] = useState(0);

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
              Сповіщення йдуть одразу всім пристроям з увімкненими push у додатку.
            </p>
          </header>
          <div style={{ marginBottom: 32 }}>
            <PushForm onSent={() => setRefreshKey((k) => k + 1)} />
          </div>
          <PushHistory refreshKey={refreshKey} />
        </div>
      ) : (
        <SideMenuList />
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
