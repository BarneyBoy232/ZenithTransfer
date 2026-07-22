import Peer from "peerjs";
import {
  getSelf,
  getDevices,
  upsertDevice,
  removeDevice,
  getRules,
  getActiveRules,
  mergeRules,
  upsertRule,
  getPairingSecret,
} from "./identity.js";

// The mesh keeps a live connection to every paired device that's currently
// online, re-connecting automatically. It also relays items along the chains
// (forwarding rules) you've defined. No server holds any data — the PeerJS
// public broker is used only to introduce two devices.

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CHUNK_SIZE = 64 * 1024;
const HIGH_WATER = 8 * 1024 * 1024;
const LOW_WATER = 1 * 1024 * 1024;
const RECONNECT_MS = 4000;

function uuid() {
  return crypto.randomUUID();
}

export function createMesh({ onItem, onProgress, onChange, onPaired }) {
  const self = getSelf();
  const peer = new Peer(self.id, { config: ICE_CONFIG });

  const conns = new Map(); // deviceId -> open DataConnection
  const assembling = new Map(); // fileId -> { meta, chunks, received }
  const seen = []; // recent msgIds (loop/dedupe guard)
  const seenSet = new Set();
  let reconnectTimer = null;
  let destroyed = false;
  const pendingJoins = []; // pairing payloads waiting for the peer to open

  const notify = () => onChange && onChange();

  function rememberSeen(msgId) {
    if (!msgId) return;
    seenSet.add(msgId);
    seen.push(msgId);
    if (seen.length > 5000) seenSet.delete(seen.shift());
  }

  function statuses() {
    const map = {};
    for (const d of getDevices()) map[d.id] = conns.has(d.id);
    return map;
  }

  function connDeviceId(conn) {
    for (const [id, c] of conns) if (c === conn) return id;
    return null;
  }

  function openConns() {
    return [...conns.values()].filter((c) => c && c.open);
  }

  // --- Connection lifecycle -------------------------------------------------

  function attachConn(conn, pairPayload) {
    if (pairPayload) conn._pairPayload = pairPayload;

    conn.on("open", () => {
      if (conn._pairPayload) {
        // We are joining someone: ask to pair.
        conn.send({ t: "pair", id: self.id, name: self.name, secret: conn._pairPayload.secret });
        return;
      }
      // Normal connect to a known device: say hello with our shared secret.
      const dev = getDevices().find((d) => d.id === conn.peer);
      conn.send({ t: "hello", id: self.id, name: self.name, secret: dev ? dev.secret : null });
    });

    conn.on("data", (msg) => onConnData(conn, msg));

    conn.on("close", () => {
      const id = connDeviceId(conn);
      if (id) conns.delete(id);
      notify();
    });
    conn.on("error", () => {
      const id = connDeviceId(conn);
      if (id) conns.delete(id);
      notify();
    });
  }

  function onConnData(conn, msg) {
    if (!msg || typeof msg !== "object") return;

    // A known device introduced itself: verify the shared secret, then trust it.
    if (msg.t === "hello") {
      const dev = getDevices().find((d) => d.id === msg.id);
      if (!dev) return; // unknown — ignore unless it pairs
      if (dev.secret && msg.secret !== dev.secret) {
        conn.close();
        return;
      }
      conns.set(dev.id, conn);
      if (msg.name && msg.name !== dev.name) upsertDevice({ id: dev.id, name: msg.name });
      conn.send({ t: "rules", rules: getRules() }); // share chain state
      notify();
      return;
    }

    // Someone scanned our QR and wants to pair.
    if (msg.t === "pair") {
      const secret = getPairingSecret();
      if (!secret || msg.secret !== secret) {
        conn.close();
        return;
      }
      upsertDevice({ id: msg.id, name: msg.name || "Device", secret });
      conns.set(msg.id, conn);
      conn.send({ t: "pair-ok", id: self.id, name: self.name });
      conn.send({ t: "rules", rules: getRules() });
      notify();
      onPaired && onPaired(msg.id);
      return;
    }

    // Our pair request was accepted.
    if (msg.t === "pair-ok" && conn._pairPayload) {
      const p = conn._pairPayload;
      upsertDevice({ id: p.id, name: msg.name || p.name || "Device", secret: p.secret });
      conns.set(p.id, conn);
      delete conn._pairPayload;
      notify();
      onPaired && onPaired(p.id);
      return;
    }

    if (msg.t === "rules") {
      mergeRules(msg.rules);
      notify();
      return;
    }

    if (msg.t === "revoke") {
      const id = connDeviceId(conn);
      if (id) {
        removeDevice(id);
        conns.delete(id);
        notify();
      }
      return;
    }

    // Anything else is a data message — only accept it from a verified device.
    const fromId = connDeviceId(conn);
    if (!fromId) return;
    handleDataMessage(fromId, msg);
  }

  // --- Receiving + relaying data -------------------------------------------

  function handleDataMessage(fromId, msg) {
    if (msg.msgId) {
      if (seenSet.has(msg.msgId)) return; // already handled (loop guard)
      rememberSeen(msg.msgId);
    }
    deliverLocally(fromId, msg);
    relay(fromId, msg);
  }

  function deliverLocally(fromId, msg) {
    const originName = msg.originName || "A device";
    if (msg.t === "text") {
      onItem &&
        onItem({
          id: uuid(),
          dir: "in",
          from: originName,
          kind: msg.kind || "text",
          content: msg.content,
          at: Date.now(),
        });
    } else if (msg.t === "file-meta") {
      assembling.set(msg.fileId, { meta: msg, chunks: [], received: 0, from: originName });
      onProgress && onProgress({ id: msg.fileId, name: msg.name, progress: 0, dir: "in" });
    } else if (msg.t === "file-chunk") {
      const entry = assembling.get(msg.fileId);
      if (!entry) return;
      entry.chunks.push(msg.data);
      entry.received += msg.data.byteLength;
      const progress = entry.meta.size ? entry.received / entry.meta.size : 0;
      onProgress && onProgress({ id: msg.fileId, name: entry.meta.name, progress, dir: "in" });
    } else if (msg.t === "file-end") {
      const entry = assembling.get(msg.fileId);
      if (!entry) return;
      assembling.delete(msg.fileId);
      const blob = new Blob(entry.chunks, { type: entry.meta.mime });
      onItem &&
        onItem({
          id: msg.fileId,
          dir: "in",
          from: entry.from,
          kind: entry.meta.kind,
          name: entry.meta.name,
          mime: entry.meta.mime,
          size: entry.meta.size,
          blob,
          url: URL.createObjectURL(blob),
          at: Date.now(),
        });
      onProgress && onProgress({ id: msg.fileId, done: true });
    }
  }

  function relay(fromId, msg) {
    const path = msg.path || [];
    const rules = getActiveRules().filter(
      (r) => r.enabled && r.relayId === self.id && r.fromId === fromId
    );
    for (const rule of rules) {
      const target = conns.get(rule.toId);
      if (target && target.open && !path.includes(rule.toId)) {
        target.send({ ...msg, path: [...path, self.id] });
      }
    }
  }

  // --- Sending --------------------------------------------------------------

  function envelope() {
    return { msgId: uuid(), originId: self.id, originName: self.name, path: [self.id] };
  }

  function waitForDrain(targets) {
    return new Promise((resolve) => {
      const check = () => {
        const busy = targets.some((c) => c.dataChannel && c.dataChannel.bufferedAmount > HIGH_WATER);
        if (!busy) return resolve();
        setTimeout(() => {
          const stillBusy = targets.some(
            (c) => c.dataChannel && c.dataChannel.bufferedAmount > LOW_WATER
          );
          stillBusy ? check() : resolve();
        }, 20);
      };
      check();
    });
  }

  function sendText(kind, content) {
    const targets = openConns();
    const msg = { ...envelope(), t: "text", kind, content };
    for (const c of targets) c.send(msg);
    onItem && onItem({ id: uuid(), dir: "out", from: self.name, kind, content, at: Date.now() });
    return targets.length;
  }

  async function sendFile(file) {
    const targets = openConns();
    if (!targets.length) return 0;
    const fileId = uuid();
    const kind = (file.type || "").startsWith("image/") ? "image" : "file";
    const meta = {
      t: "file-meta",
      fileId,
      name: file.name || "file",
      mime: file.type || "application/octet-stream",
      size: file.size,
      kind,
    };
    for (const c of targets) c.send({ ...envelope(), ...meta });

    onProgress && onProgress({ id: fileId, name: meta.name, progress: 0, dir: "out" });
    let offset = 0;
    while (offset < file.size) {
      const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      await waitForDrain(targets);
      for (const c of targets) c.send({ ...envelope(), t: "file-chunk", fileId, data: buffer });
      offset += buffer.byteLength;
      onProgress && onProgress({ id: fileId, name: meta.name, progress: offset / file.size, dir: "out" });
    }
    for (const c of targets) c.send({ ...envelope(), t: "file-end", fileId });
    onProgress && onProgress({ id: fileId, done: true });

    onItem &&
      onItem({
        id: fileId,
        dir: "out",
        from: self.name,
        kind,
        name: file.name,
        mime: file.type,
        size: file.size,
        blob: file,
        url: URL.createObjectURL(file),
        at: Date.now(),
      });
    return targets.length;
  }

  // --- Pairing + device management -----------------------------------------

  function joinFromPayload(payload) {
    if (!payload || !payload.id || payload.id === self.id) return;
    if (!peer.open) {
      pendingJoins.push(payload); // run once the broker connection is ready
      return;
    }
    const conn = peer.connect(payload.id, { reliable: true });
    attachConn(conn, payload);
  }

  function revoke(id) {
    const conn = conns.get(id);
    if (conn && conn.open) conn.send({ t: "revoke", id: self.id });
    removeDevice(id);
    conns.delete(id);
    if (conn) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    notify();
  }

  function broadcastRules() {
    const rules = getRules();
    for (const c of openConns()) c.send({ t: "rules", rules });
  }

  function setRule(rule) {
    upsertRule({ ...rule, updatedAt: Date.now() });
    broadcastRules();
    notify();
  }

  // --- Auto-reconnect loop --------------------------------------------------

  function reconnectKnown() {
    if (destroyed || !peer.open) return;
    for (const dev of getDevices()) {
      if (!conns.has(dev.id)) {
        const conn = peer.connect(dev.id, { reliable: true });
        attachConn(conn, null);
      }
    }
  }

  peer.on("open", () => {
    while (pendingJoins.length) joinFromPayload(pendingJoins.shift());
    reconnectKnown();
    reconnectTimer = setInterval(reconnectKnown, RECONNECT_MS);
    notify();
  });
  peer.on("connection", (conn) => attachConn(conn, null));
  peer.on("error", (err) => {
    // "peer-unavailable" just means a device is offline right now — keep trying.
    if (err && err.type === "peer-unavailable") return;
  });

  function destroy() {
    destroyed = true;
    if (reconnectTimer) clearInterval(reconnectTimer);
    try {
      peer.destroy();
    } catch {
      /* ignore */
    }
  }

  return {
    self,
    getState: () => ({ devices: getDevices(), rules: getActiveRules(), statuses: statuses() }),
    sendText,
    sendFile,
    joinFromPayload,
    revoke,
    setRule,
    destroy,
  };
}
