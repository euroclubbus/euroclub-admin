import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Кеп (08.10): обов'язкове оновлення — версія нижче мінімальної не відкривається,
// показує екран «Оновіть застосунок» (працює з Android 1.0.16+).
export function AppVersionSettings() {
  const [a, setA] = useState("");
  const [i, setI] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    getDoc(doc(db, "settings", "appVersion")).then((s) => { setA(s.get("minAndroidVersion") || ""); setI(s.get("minIosVersion") || ""); });
  }, []);
  async function save() {
    await setDoc(doc(db, "settings", "appVersion"), { minAndroidVersion: a.trim(), minIosVersion: i.trim() }, { merge: true });
    setMsg("Збережено"); setTimeout(() => setMsg(""), 2000);
  }
  const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hairline)", background: "transparent", color: "inherit", width: 120 };
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Мінімальна версія застосунку</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Хто має версію нижчу — не зможе відкрити застосунок, поки не оновиться. Ставте нову версію лише після того, як вона з'явилась у сторі. Порожньо — без обмеження.
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>Android <input style={inp} placeholder="напр. 1.0.29" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>iOS <input style={inp} placeholder="напр. 1.3" value={i} onChange={(e) => setI(e.target.value)} /></label>
        <button onClick={save} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#111", fontWeight: 700, cursor: "pointer" }}>Зберегти</button>
        <span style={{ fontSize: 12, color: "var(--success)" }}>{msg}</span>
      </div>
    </div>
  );
}
