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
    // Free public TURN relay (best-effort). When two devices can't reach each
    // other directly — strict Wi-Fi, mobile data, symmetric NAT — the data is
    // relayed through TURN instead of failing. For guaranteed reliability,
    // swap these for your own credentials (Metered.ca free tier or Cloudflare).
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

const CHUNK_SIZE = 64 * 1024;
const HIGH_WATER = 8 * 1024 * 1024;
const LOW_WATER = 1 * 1024 * 1024;
const RECONNECT_MS = 4000;

function uuid() {
  return crypto.randomUUID();
}

export function createMesh({ onItem, onProgress, onChange, onPaired, onLog }) {
  const self = getSelf();
  let peer = null; // (re)created by startPeer(); may be rebuilt to reclaim our id

  const conns = new Map(); // deviceId -> open DataConnection
  const assembling = new Map(); // fileId -> { meta, chunks, received }
  const seen = []; // recent msgIds (loop/dedupe guard)
  const seenSet = new Set();
  let reconnectTimer = null;
  let restartTimer = null;
  let destroyed = false;
  let brokerReady = false;
  const pendingJoins = []; // pairing payloads waiting for the peer to open

  const notify = () => onChange && onChange();
  const log = (msg) => onLog && onLog(msg); // human-readable diagnostics line

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
        log("pairing: channel open — sending request");
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
      log(`connected to ${msg.name || dev.name}`);
      notify();
      return;
    }

    // Someone scanned our QR and wants to pair.
    if (msg.t === "pair") {
      const secret = getPairingSecret();
      if (!secret) {
        log("pairing: request came in but no code is active here");
        conn.close();
        return;
      }
      if (msg.secret !== secret) {
        log("pairing: request rejected — code didn't match");
        conn.close();
        return;
      }
      upsertDevice({ id: msg.id, name: msg.name || "Device", secret });
      conns.set(msg.id, conn);
      conn.send({ t: "pair-ok", id: self.id, name: self.name });
      conn.send({ t: "rules", rules: getRules() });
      log(`pairing: linked with ${msg.name || "a device"} ✓`);
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
      log(`pairing: linked with ${msg.name || p.name || "a device"} ✓`);
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

    // A device we trust is introducing us to another device (transitive link).
    // We add that peer with the shared secret it supplies, then connect directly
    // — from here on we reach them without the introducer in the middle.
    if (msg.t === "introduce") {
      const introducerId = connDeviceId(conn);
      if (!introducerId) return; // only trust introductions from a paired device
      const p = msg.peer;
      if (p && p.id && p.id !== self.id) {
        const already = getDevices().some((d) => d.id === p.id);
        upsertDevice({ id: p.id, name: p.name || "Device", secret: p.secret });
        const introName = getDevices().find((d) => d.id === introducerId)?.name || "a device";
        log(`${already ? "re-linked" : "linked"} with ${p.name || "a device"} (introduced by ${introName})`);
        notify();
        if (peer && peer.open && !conns.has(p.id)) {
          attachConn(peer.connect(p.id, { reliable: true }), null);
        }
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

  // Pick who a send goes to. targetId null/undefined = every connected device
  // (default); a specific id = only that device (must be directly connected).
  function targetsFor(targetId) {
    if (targetId) {
      const c = conns.get(targetId);
      return c && c.open ? [c] : [];
    }
    return openConns();
  }

  function sendText(kind, content, targetId) {
    const targets = targetsFor(targetId);
    const msg = { ...envelope(), t: "text", kind, content };
    for (const c of targets) c.send(msg);
    onItem && onItem({ id: uuid(), dir: "out", from: self.name, kind, content, at: Date.now() });
    return targets.length;
  }

  async function sendFile(file, targetId) {
    const targets = targetsFor(targetId);
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

  function joinFromPayload(payload, attempt = 0) {
    if (!payload || !payload.id || payload.id === self.id) return;
    if (getDevices().some((d) => d.id === payload.id)) return; // already paired
    if (!peer || !peer.open) {
      pendingJoins.push(payload); // run once the broker connection is ready
      return;
    }
    log(
      attempt === 0
        ? "pairing: reaching the other device…"
        : `pairing: retry ${attempt} — reaching the other device…`
    );
    const conn = peer.connect(payload.id, { reliable: true });
    attachConn(conn, payload);
    // Pairing can fail transiently (the other device wasn't reachable yet, or a
    // relay path was still being negotiated). If the channel hasn't opened
    // shortly, close it and try again a few times before giving up.
    setTimeout(() => {
      if (destroyed) return;
      const paired = getDevices().some((d) => d.id === payload.id);
      if (!paired && !conn.open && attempt < 3) {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
        joinFromPayload(payload, attempt + 1);
      }
    }, 3500);
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

  // Introduce two of THIS device's paired devices to each other so they link
  // directly (no QR, and afterwards they connect without this device relaying).
  // Both must be connected to us right now so we can deliver the introduction.
  function introduce(aId, bId) {
    if (!aId || !bId || aId === bId) return { ok: false, reason: "pick two different devices" };
    const a = conns.get(aId);
    const b = conns.get(bId);
    if (!a || !a.open || !b || !b.open) {
      return { ok: false, reason: "both devices must be online right now" };
    }
    const da = getDevices().find((d) => d.id === aId);
    const db = getDevices().find((d) => d.id === bId);
    const secret = uuid(); // shared secret the two will use to trust each other
    a.send({ t: "introduce", peer: { id: bId, name: db ? db.name : "Device", secret } });
    b.send({ t: "introduce", peer: { id: aId, name: da ? da.name : "Device", secret } });
    log(`introduced ${da?.name || "a device"} ↔ ${db?.name || "a device"} — they can now link directly`);
    return { ok: true };
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
    if (destroyed || !peer || !peer.open) return;
    for (const dev of getDevices()) {
      if (!conns.has(dev.id)) {
        const conn = peer.connect(dev.id, { reliable: true });
        attachConn(conn, null);
      }
    }
  }

  // Tear down the current peer and build a fresh one after `delay` ms. This is
  // how we reclaim our own id when the broker still thinks a previous session
  // holds it ("unavailable-id" / ghost) — we wait for that to time out, then
  // re-register with the same id.
  function scheduleRestart(delay) {
    if (destroyed || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (destroyed) return;
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        if (peer && !peer.destroyed) peer.destroy();
      } catch {
        /* ignore */
      }
      startPeer();
    }, delay);
  }

  function startPeer() {
    if (destroyed) return;
    peer = new Peer(self.id, { config: ICE_CONFIG });

    peer.on("open", () => {
      brokerReady = true;
      log("matchmaker: connected — this device is now findable");
      while (pendingJoins.length) joinFromPayload(pendingJoins.shift());
      reconnectKnown();
      if (!reconnectTimer) reconnectTimer = setInterval(reconnectKnown, RECONNECT_MS);
      notify();
    });

    peer.on("connection", (conn) => attachConn(conn, null));

    peer.on("disconnected", () => {
      // The broker dropped this peer (idle timeout / flaky network). Try a plain
      // reconnect first; if that can't reclaim the id, startPeer's error handler
      // will schedule a full rebuild.
      brokerReady = false;
      log("matchmaker: dropped — reconnecting…");
      notify();
      if (!destroyed && peer && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          scheduleRestart(3000);
        }
      }
    });

    peer.on("error", (err) => {
      const type = (err && err.type) || "error";
      if (type === "unavailable-id") {
        // Our id is still held by a very recent session of THIS device. Wait for
        // the broker to release it, then rebuild and reclaim it. Keeps retrying.
        brokerReady = false;
        log("device id still held by a previous session — reclaiming shortly…");
        notify();
        scheduleRestart(5000);
        return;
      }
      if (
        type === "network" ||
        type === "server-error" ||
        type === "socket-error" ||
        type === "socket-closed"
      ) {
        brokerReady = false;
        log(`can't reach the matchmaker (${type}) — retrying…`);
        notify();
        scheduleRestart(3000);
        return;
      }
      if (type === "peer-unavailable") {
        log("the other device isn't reachable on the matchmaker right now");
        return;
      }
      log(`connection error: ${type}`);
    });
  }

  // Release our id on the broker when the tab really closes/reloads, so we don't
  // leave a ghost that blocks the next session (the cause of unavailable-id).
  const releaseOnUnload = (e) => {
    if (e && e.type === "pagehide" && e.persisted) return; // bfcache, keep peer
    try {
      if (peer && !peer.destroyed) peer.destroy();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("pagehide", releaseOnUnload);
  window.addEventListener("beforeunload", releaseOnUnload);

  startPeer();

  function destroy() {
    destroyed = true;
    if (reconnectTimer) clearInterval(reconnectTimer);
    if (restartTimer) clearTimeout(restartTimer);
    window.removeEventListener("pagehide", releaseOnUnload);
    window.removeEventListener("beforeunload", releaseOnUnload);
    try {
      if (peer && !peer.destroyed) peer.destroy();
    } catch {
      /* ignore */
    }
  }

  return {
    self,
    getState: () => ({
      devices: getDevices(),
      rules: getActiveRules(),
      statuses: statuses(),
      brokerReady,
    }),
    sendText,
    sendFile,
    joinFromPayload,
    revoke,
    setRule,
    introduce,
    destroy,
  };
}
