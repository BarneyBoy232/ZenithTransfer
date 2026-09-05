import { useCallback, useEffect, useRef, useState } from "react";
import { createMesh } from "../lib/mesh.js";
import {
  decodePairing,
  encodePairing,
  newPairingSecret,
  clearPairingSecret,
  setSelfName as persistSelfName,
} from "../lib/identity.js";

// React wrapper around the mesh. Exposes device/rule/status state and the
// actions the UI needs, and handles the "opened a pairing link" case on load.
export function useMesh({ onItem } = {}) {
  const meshRef = useRef(null);
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;

  const [self, setSelf] = useState(null);
  const [devices, setDevices] = useState([]);
  const [rules, setRules] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [transfers, setTransfers] = useState({});
  const [pairingStatus, setPairingStatus] = useState(null); // null|'pairing'|'paired'|'failed'
  const [logs, setLogs] = useState([]);
  const [brokerReady, setBrokerReady] = useState(false);
  const joiningRef = useRef(false);
  const failTimerRef = useRef(null);
  const paidTimerRef = useRef(null);

  const refresh = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const state = mesh.getState();
    setDevices(state.devices);
    setRules(state.rules);
    setStatuses(state.statuses);
    setBrokerReady(!!state.brokerReady);
  }, []);

  // Diagnostics log. Consecutive identical lines collapse into one with a count
  // so the background reconnect loop doesn't flood the view.
  const addLog = useCallback((msg) => {
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.msg === msg) {
        return [...prev.slice(0, -1), { ...last, count: (last.count || 1) + 1, t: Date.now() }];
      }
      const next = [...prev, { msg, t: Date.now(), count: 1 }];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, []);

  const reportProgress = useCallback((p) => {
    setTransfers((prev) => {
      if (p.done) {
        const next = { ...prev };
        delete next[p.id];
        return next;
      }
      return { ...prev, [p.id]: { name: p.name, progress: p.progress, dir: p.dir } };
    });
  }, []);

  useEffect(() => {
    // Clear any stale pairing code left over from a previous session, so a code
    // is only ever "live" while the Add-device panel is actually open.
    clearPairingSecret();

    const mesh = createMesh({
      onItem: (item) => onItemRef.current && onItemRef.current(item),
      onProgress: reportProgress,
      onChange: refresh,
      onLog: addLog,
      onPaired: () => {
        refresh();
        // Only the device that scanned the link shows a "linked" banner. The
        // inviter keeps its code live so more devices can pair from the same QR.
        if (joiningRef.current) {
          joiningRef.current = false;
          if (failTimerRef.current) clearTimeout(failTimerRef.current);
          setPairingStatus("paired");
          paidTimerRef.current = setTimeout(() => setPairingStatus(null), 4000);
        }
      },
    });
    meshRef.current = mesh;
    setSelf(mesh.self);
    refresh();

    // If this page was opened from a pairing link, start pairing then clean URL.
    const match = window.location.hash.match(/pair=([^&]+)/);
    if (match) {
      const payload = decodePairing(match[1]);
      if (payload) {
        joiningRef.current = true;
        setPairingStatus("pairing");
        mesh.joinFromPayload(payload);
        failTimerRef.current = setTimeout(() => {
          if (joiningRef.current) {
            joiningRef.current = false;
            setPairingStatus("failed");
          }
        }, 16000);
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    return () => {
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
      if (paidTimerRef.current) clearTimeout(paidTimerRef.current);
      mesh.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendText = useCallback((kind, content, targetId) => meshRef.current?.sendText(kind, content, targetId), []);
  const sendFile = useCallback((file, targetId) => meshRef.current?.sendFile(file, targetId), []);
  const revoke = useCallback((id) => meshRef.current?.revoke(id), []);
  const setRule = useCallback((rule) => meshRef.current?.setRule(rule), []);
  const introduce = useCallback((aId, bId) => meshRef.current?.introduce(aId, bId), []);

  const renameSelf = useCallback((name) => {
    const updated = persistSelfName(name);
    setSelf({ ...updated });
  }, []);

  // Build a fresh pairing link/QR (this device becomes the inviter). The code
  // stays live so several devices can pair from the same QR until Done.
  const createPairingUrl = useCallback(() => {
    if (!self) return "";
    const secret = newPairingSecret();
    const encoded = encodePairing({ id: self.id, name: self.name, secret });
    return `${window.location.origin}${window.location.pathname}#pair=${encoded}`;
  }, [self]);

  // Called when the inviter closes the Add-device panel — retire the code.
  const stopPairing = useCallback(() => clearPairingSecret(), []);

  const connectedCount = Object.values(statuses).filter(Boolean).length;

  return {
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
  };
}
