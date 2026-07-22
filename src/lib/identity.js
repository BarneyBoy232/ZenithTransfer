// Everything about "who this device is" and "who it's paired with" lives here,
// saved in localStorage so it survives refreshes and browser restarts. Nothing
// is stored on a server — each device keeps its own copy.

// Storage keys. A "?dev=<name>" URL parameter namespaces them, which lets you
// run several independent identities in one browser (handy for testing multiple
// devices on a single machine). With no parameter, the normal keys are used.
const NS = (() => {
  try {
    const dev = new URLSearchParams(window.location.search).get("dev");
    return dev ? "-" + dev : "";
  } catch {
    return "";
  }
})();
const SELF_KEY = "zt-self-v1" + NS;
const DEVICES_KEY = "zt-devices-v1" + NS;
const RULES_KEY = "zt-rules-v1" + NS;
const PAIRING_KEY = "zt-pairing-v1" + NS;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — ignore */
  }
}

function guessName() {
  const ua = navigator.userAgent || "";
  if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return "My phone";
  if (/iPad|Tablet/i.test(ua)) return "My tablet";
  return "My computer";
}

// --- This device's own stable identity -------------------------------------

export function getSelf() {
  let self = readJSON(SELF_KEY, null);
  if (!self || !self.id) {
    self = { id: "zt-" + crypto.randomUUID(), name: guessName() };
    writeJSON(SELF_KEY, self);
  }
  return self;
}

export function setSelfName(name) {
  const self = getSelf();
  self.name = name.trim() || self.name;
  writeJSON(SELF_KEY, self);
  return self;
}

// --- Paired devices --------------------------------------------------------

export function getDevices() {
  return readJSON(DEVICES_KEY, []);
}

export function upsertDevice(device) {
  const list = getDevices();
  const i = list.findIndex((d) => d.id === device.id);
  if (i >= 0) list[i] = { ...list[i], ...device };
  else list.push(device);
  writeJSON(DEVICES_KEY, list);
  return list;
}

export function removeDevice(id) {
  writeJSON(DEVICES_KEY, getDevices().filter((d) => d.id !== id));
  // Tombstone any forwarding rules that mention this device so the deletion
  // syncs to the other devices too.
  const now = Date.now();
  const rules = getRules().map((r) =>
    r.relayId === id || r.fromId === id || r.toId === id
      ? { ...r, deleted: true, updatedAt: now }
      : r
  );
  writeJSON(RULES_KEY, rules);
  return getDevices();
}

// --- Forwarding rules (the "chains") ---------------------------------------
// A rule means: on device `relayId`, when an item arrives from `fromId`,
// also forward it to `toId`. Rules are shared across devices and merged with
// "last edit wins" so any device can toggle a chain on or off.

export function getRules() {
  return readJSON(RULES_KEY, []);
}

// Rules that are actually usable (not deleted).
export function getActiveRules() {
  return getRules().filter((r) => !r.deleted);
}

export function upsertRule(rule) {
  const list = getRules();
  const i = list.findIndex((r) => r.id === rule.id);
  if (i >= 0) list[i] = { ...list[i], ...rule };
  else list.push(rule);
  writeJSON(RULES_KEY, list);
  return getRules();
}

// Merge an incoming rule set from another device (last-write-wins by updatedAt).
export function mergeRules(incoming) {
  const byId = new Map(getRules().map((r) => [r.id, r]));
  for (const r of incoming || []) {
    const existing = byId.get(r.id);
    if (!existing || (r.updatedAt || 0) > (existing.updatedAt || 0)) byId.set(r.id, r);
  }
  const merged = Array.from(byId.values());
  writeJSON(RULES_KEY, merged);
  return merged;
}

// --- Pairing secret (short-lived, used only while adding a device) ----------

export function getPairingSecret() {
  return readJSON(PAIRING_KEY, null);
}
export function newPairingSecret() {
  const secret = crypto.randomUUID();
  writeJSON(PAIRING_KEY, secret);
  return secret;
}
export function clearPairingSecret() {
  try {
    localStorage.removeItem(PAIRING_KEY);
  } catch {
    /* ignore */
  }
}

// --- Pairing payload encode/decode (goes in the QR / link) ------------------

export function encodePairing(payload) {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}
export function decodePairing(encoded) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}
