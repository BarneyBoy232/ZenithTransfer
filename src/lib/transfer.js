// The wire protocol for sending items over an open PeerJS connection.
//
// Messages are plain objects sent with conn.send(...). PeerJS serializes them
// (including binary ArrayBuffer fields) for us. Three message shapes exist:
//   { t: "text",      kind, content }                  -> a text snippet or link
//   { t: "file-meta", id, name, mime, size, kind }     -> a file is starting
//   { t: "file-chunk",id, data }                       -> one piece of that file
//   { t: "file-end",  id }                             -> that file is complete
//
// Files are split into chunks so any size can be sent and progress can be shown.

const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk

// Above this much unsent data buffered in the channel, we pause so we don't
// flood memory on a slow link (backpressure).
const HIGH_WATER = 8 * 1024 * 1024; // 8 MB
const LOW_WATER = 1 * 1024 * 1024; // 1 MB

function newId() {
  return crypto.randomUUID();
}

// Send a text snippet or a link.
export function sendText(conn, kind, content) {
  conn.send({ t: "text", kind, content });
}

// Wait until the channel has drained enough to keep sending.
function waitForDrain(conn) {
  return new Promise((resolve) => {
    const channel = conn.dataChannel;
    if (!channel || channel.bufferedAmount < HIGH_WATER) return resolve();
    const check = () => {
      if (!channel || channel.bufferedAmount < LOW_WATER) resolve();
      else setTimeout(check, 20);
    };
    check();
  });
}

// Send a File (or Blob) in chunks. onProgress is called with a 0..1 fraction.
export async function sendFile(conn, file, onProgress) {
  const id = newId();
  const kind = (file.type || "").startsWith("image/") ? "image" : "file";
  const meta = {
    t: "file-meta",
    id,
    name: file.name || "file",
    mime: file.type || "application/octet-stream",
    size: file.size,
    kind,
  };
  conn.send(meta);

  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    await waitForDrain(conn);
    conn.send({ t: "file-chunk", id, data: buffer });
    offset += buffer.byteLength;
    if (onProgress) onProgress(Math.min(offset / file.size, 1));
  }

  conn.send({ t: "file-end", id });
  return { id, ...meta };
}

// Build a handler for INCOMING messages. It reassembles chunked files and
// reports finished items plus live progress.
//   onItem({ id, dir:"in", kind, content?/blob?/url?, name?, mime?, size?, at })
//   onProgress({ id, name, progress })  |  { id, done: true }
export function createReceiver({ onItem, onProgress }) {
  const incoming = new Map(); // id -> { meta, chunks, received }

  return function handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;

    if (msg.t === "text") {
      onItem({
        id: newId(),
        dir: "in",
        kind: msg.kind || "text",
        content: msg.content,
        at: Date.now(),
      });
      return;
    }

    if (msg.t === "file-meta") {
      incoming.set(msg.id, { meta: msg, chunks: [], received: 0 });
      onProgress({ id: msg.id, name: msg.name, progress: 0 });
      return;
    }

    if (msg.t === "file-chunk") {
      const entry = incoming.get(msg.id);
      if (!entry) return;
      entry.chunks.push(msg.data);
      entry.received += msg.data.byteLength;
      const progress = entry.meta.size ? entry.received / entry.meta.size : 0;
      onProgress({ id: msg.id, name: entry.meta.name, progress });
      return;
    }

    if (msg.t === "file-end") {
      const entry = incoming.get(msg.id);
      if (!entry) return;
      incoming.delete(msg.id);
      const blob = new Blob(entry.chunks, { type: entry.meta.mime });
      const url = URL.createObjectURL(blob);
      onItem({
        id: msg.id,
        dir: "in",
        kind: entry.meta.kind,
        name: entry.meta.name,
        mime: entry.meta.mime,
        size: entry.meta.size,
        blob,
        url,
        at: Date.now(),
      });
      onProgress({ id: msg.id, done: true });
    }
  };
}
