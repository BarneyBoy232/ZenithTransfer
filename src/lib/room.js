// Room codes: short, human-friendly identifiers that pair two devices.
// We avoid characters that are easy to confuse (0/O, 1/I/L) so a code read off
// a screen is hard to mistype.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Make a random N-character code using the browser's secure random generator.
export function generateCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

// Read a room code out of the URL hash (e.g. ".../#K7P2QX" -> "K7P2QX").
// Returns null if the hash isn't a valid-looking code.
export function getRoomFromHash() {
  const raw = window.location.hash.replace(/^#/, "").trim().toUpperCase();
  return /^[A-Z0-9]{4,10}$/.test(raw) ? raw : null;
}

// Put a code into the URL hash without adding a new browser history entry.
export function setRoomHash(code) {
  const url = `${window.location.pathname}${window.location.search}#${code}`;
  window.history.replaceState(null, "", url);
}

// Build the full shareable link that the other device opens (also the QR value).
export function buildJoinUrl(code) {
  return `${window.location.origin}${window.location.pathname}#${code}`;
}
