import { useCallback, useEffect, useRef, useState } from "react";
import { useMesh } from "./hooks/useMesh.js";
import { clearHistory, loadItems, saveItem } from "./lib/history.js";
import Logo from "./components/Logo.jsx";
import DeviceManager from "./components/DeviceManager.jsx";
import Composer from "./components/Composer.jsx";
import Feed from "./components/Feed.jsx";
import ChainManager from "./components/ChainManager.jsx";
import HistoryPanel from "./components/HistoryPanel.jsx";

export default function App() {
  const [items, setItems] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const historyLoaded = useRef(false);

  // Every sent or received item shows at the top of the feed and is saved to
  // this device's own local history.
  const handleItem = useCallback((item) => {
    setItems((prev) => [item, ...prev]);
    saveItem(item);
  }, []);

  const {
    self,
    devices,
    rules,
    statuses,
    transfers,
    connectedCount,
    sendText,
    sendFile,
    revoke,
    setRule,
    renameSelf,
    createPairingUrl,
  } = useMesh({ onItem: handleItem });

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
        <p className="app__tag">Link your devices once. Send anything, any time they're both open.</p>
      </header>

      <main className="app__main">
        <DeviceManager
          self={self}
          devices={devices}
          statuses={statuses}
          connectedCount={connectedCount}
          onRevoke={revoke}
          onRename={renameSelf}
          createPairingUrl={createPairingUrl}
        />
        <Composer disabled={connectedCount === 0} onSendText={sendText} onSendFile={sendFile} />
        <Feed items={items} transfers={transfers} />
        <ChainManager self={self} devices={devices} rules={rules} onSetRule={setRule} />
        <HistoryPanel
          open={historyOpen}
          items={historyItems}
          onToggle={() => setHistoryOpen((v) => !v)}
          onClear={onClearHistory}
        />
      </main>

      <footer className="app__footer">
        Items stream directly between your devices — nothing is stored on a server. Devices must be open at the same time to transfer.
      </footer>
    </div>
  );
}
