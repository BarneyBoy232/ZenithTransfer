import { useCallback, useEffect, useRef, useState } from "react";
import { useMesh } from "./hooks/useMesh.js";
import { clearHistory, loadItems, saveItem } from "./lib/history.js";
import Logo from "./components/Logo.jsx";
import Icon from "./components/Icon.jsx";
import Composer from "./components/Composer.jsx";
import Feed from "./components/Feed.jsx";
import Drawer from "./components/Drawer.jsx";
import DeviceManager from "./components/DeviceManager.jsx";
import LinkDevices from "./components/LinkDevices.jsx";
import ChainManager from "./components/ChainManager.jsx";
import Diagnostics from "./components/Diagnostics.jsx";
import HistoryPanel from "./components/HistoryPanel.jsx";

export default function App() {
  const [items, setItems] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const historyLoaded = useRef(false);

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
    pairingStatus,
    stopPairing,
    logs,
    brokerReady,
    sendText,
    sendFile,
    revoke,
    setRule,
    introduce,
    renameSelf,
    createPairingUrl,
  } = useMesh({ onItem: handleItem });

  const connectedDevices = devices.filter((d) => statuses[d.id]);

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

  // Status pill wording: how many devices are online (or the linking state).
  const statusLabel =
    connectedCount > 0
      ? `${connectedCount} online`
      : devices.length > 0
      ? "offline"
      : brokerReady
      ? "no devices"
      : "connecting…";
  const statusOn = connectedCount > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <Logo size={30} />
          <span className="topbar__name">
            Zenith<span className="topbar__accent">Transfer</span>
          </span>
        </div>
        <div className="topbar__right">
          <button
            className={`statuspill ${statusOn ? "statuspill--on" : ""}`}
            onClick={() => setDrawerOpen(true)}
          >
            <span className={`dot dot--${statusOn ? "connected" : brokerReady ? "waiting" : "error"}`} />
            {statusLabel}
          </button>
          <button className="iconbtn" onClick={() => setDrawerOpen(true)} aria-label="Settings">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="main">
        <Composer
          disabled={connectedCount === 0}
          connectedDevices={connectedDevices}
          onSendText={sendText}
          onSendFile={sendFile}
        />
        <Feed items={items} transfers={transfers} />
      </main>

      <footer className="app__footer">
        Sent directly between your devices — nothing is stored on a server.
      </footer>

      <Drawer open={drawerOpen} title="Devices" onClose={() => setDrawerOpen(false)}>
        <DeviceManager
          self={self}
          devices={devices}
          statuses={statuses}
          connectedCount={connectedCount}
          pairingStatus={pairingStatus}
          onRevoke={revoke}
          onRename={renameSelf}
          onStopPairing={stopPairing}
          createPairingUrl={createPairingUrl}
        />
        <LinkDevices devices={devices} statuses={statuses} onIntroduce={introduce} />
        <ChainManager self={self} devices={devices} rules={rules} onSetRule={setRule} />
        <HistoryPanel
          open={historyOpen}
          items={historyItems}
          onToggle={() => setHistoryOpen((v) => !v)}
          onClear={onClearHistory}
        />
        <Diagnostics self={self} brokerReady={brokerReady} logs={logs} />
      </Drawer>
    </div>
  );
}
