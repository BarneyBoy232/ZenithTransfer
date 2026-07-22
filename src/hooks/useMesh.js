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

  const refresh = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const state = mesh.getState();
    setDevices(state.devices);
    setRules(state.rules);
    setStatuses(state.statuses);
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
    const mesh = createMesh({
      onItem: (item) => onItemRef.current && onItemRef.current(item),
      onProgress: reportProgress,
      onChange: refresh,
      onPaired: () => {
        clearPairingSecret(); // one QR pairs one device; re-open to add another
        refresh();
      },
    });
    meshRef.current = mesh;
    setSelf(mesh.self);
    refresh();

    // If this page was opened from a pairing link, start pairing then clean URL.
    const match = window.location.hash.match(/pair=([^&]+)/);
    if (match) {
      const payload = decodePairing(match[1]);
      if (payload) mesh.joinFromPayload(payload);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    return () => mesh.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendText = useCallback((kind, content) => meshRef.current?.sendText(kind, content), []);
  const sendFile = useCallback((file) => meshRef.current?.sendFile(file), []);
  const revoke = useCallback((id) => meshRef.current?.revoke(id), []);
  const setRule = useCallback((rule) => meshRef.current?.setRule(rule), []);

  const renameSelf = useCallback((name) => {
    const updated = persistSelfName(name);
    setSelf({ ...updated });
  }, []);

  // Build a fresh pairing link/QR (this device becomes the inviter).
  const createPairingUrl = useCallback(() => {
    if (!self) return "";
    const secret = newPairingSecret();
    const encoded = encodePairing({ id: self.id, name: self.name, secret });
    return `${window.location.origin}${window.location.pathname}#pair=${encoded}`;
  }, [self]);

  const connectedCount = Object.values(statuses).filter(Boolean).length;

  return {
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
  };
}
