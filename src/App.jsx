import { useCallback, useEffect, useRef, useState } from "react";
import { usePeer } from "./hooks/usePeer.js";
import { clearHistory, loadItems, saveItem } from "./lib/history.js";
import Logo from "./components/Logo.jsx";
import RoomBar from "./components/RoomBar.jsx";
import Composer from "./components/Composer.jsx";
import Feed from "./components/Feed.jsx";
import HistoryPanel from "./components/HistoryPanel.jsx";

export default function App() {
  const [items, setItems] = useState([]); // live feed (this session)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const historyLoaded = useRef(false);

  // Every sent or received item lands here: show it at the top of the feed and
  // quietly save a copy to this device's local history.
  const handleItem = useCallback((item) => {
    setItems((prev) => [item, ...prev]);
    saveItem(item);
  }, []);

  const { status, code, role, isConnected, transfers, sendText, sendFile } = usePeer({
    onItem: handleItem,
  });

  // Load saved history the first time the panel is opened.
  useEffect(() => {
    if (historyOpen && !historyLoaded.current) {
      historyLoaded.current = true;
      loadItems().then(setHistoryItems);
    }
  }, [historyOpen]);

  const onClearHistory = async () => {
    await clearHistory();
    setHistoryItems([]);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__logo">
          <Logo size={40} />
          <span className="app__logo-text">
            Zenith<span className="app__logo-accent">Transfer</span>
          </span>
        </h1>
        <p className="app__tag">Drop it here, grab it there. Direct, private, no size limits.</p>
      </header>

      <main className="app__main">
        <RoomBar code={code} role={role} status={status} />
        <Composer disabled={!isConnected} onSendText={sendText} onSendFile={sendFile} />
        <Feed items={items} transfers={transfers} />
        <HistoryPanel
          open={historyOpen}
          items={historyItems}
          onToggle={() => setHistoryOpen((v) => !v)}
          onClear={onClearHistory}
        />
      </main>

      <footer className="app__footer">
        Files stream directly between your devices — nothing is stored on a server. Both devices must be open at the same time.
      </footer>
    </div>
  );
}
