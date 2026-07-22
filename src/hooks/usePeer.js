import { useCallback, useEffect, useRef, useState } from "react";
import { createHostPeer, createJoinerPeer } from "../lib/peer.js";
import {
  generateCode,
  getRoomFromHash,
  setRoomHash,
} from "../lib/room.js";
import {
  createReceiver,
  sendFile as sendFileOverConn,
  sendText as sendTextOverConn,
} from "../lib/transfer.js";

// Roles are remembered per-code in sessionStorage so a page refresh keeps the
// host as the host (its URL now contains the code too, which would otherwise
// look just like a joiner).
function roleKey(code) {
  return `zt-role-${code}`;
}

// Decide who we are on first load:
//  - URL already has a code we previously HOSTED  -> host (a refresh)
//  - URL has a code we didn't host                -> joiner (opened the link)
//  - URL has no code                              -> host (fresh start)
function resolveRole() {
  const fromHash = getRoomFromHash();
  if (fromHash) {
    const remembered = sessionStorage.getItem(roleKey(fromHash));
    return { role: remembered === "host" ? "host" : "joiner", code: fromHash };
  }
  const code = generateCode();
  return { role: "host", code };
}

export function usePeer({ onItem } = {}) {
  const [status, setStatus] = useState("starting"); // starting|waiting|connected|error
  const [error, setError] = useState(null);
  const [transfers, setTransfers] = useState({}); // id -> { name, progress, dir }
  const initial = useRef(resolveRole());
  const [code] = useState(initial.current.code);
  const role = initial.current.role;

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;

  // Update the progress bar for one in-flight transfer.
  const reportProgress = useCallback((p) => {
    setTransfers((prev) => {
      if (p.done) {
        const next = { ...prev };
        delete next[p.id];
        return next;
      }
      return { ...prev, [p.id]: { name: p.name, progress: p.progress, dir: p.dir || "in" } };
    });
  }, []);

  // Attach handlers to a freshly opened connection (works for host or joiner).
  const bindConnection = useCallback(
    (conn) => {
      connRef.current = conn;
      const receive = createReceiver({
        onItem: (item) => onItemRef.current && onItemRef.current(item),
        onProgress: reportProgress,
      });
      conn.on("data", receive);
      conn.on("open", () => setStatus("connected"));
      conn.on("close", () => {
        if (connRef.current === conn) {
          connRef.current = null;
          setStatus("waiting");
        }
      });
      conn.on("error", () => {
        if (connRef.current === conn) {
          connRef.current = null;
          setStatus("waiting");
        }
      });
      if (conn.open) setStatus("connected");
    },
    [reportProgress]
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    if (role === "host") {
      sessionStorage.setItem(roleKey(code), "host");
      setRoomHash(code);
      const peer = createHostPeer(code);
      peerRef.current = peer;
      peer.on("open", () => !cancelled && setStatus("waiting"));
      // The other device connected to us.
      peer.on("connection", (conn) => {
        if (connRef.current && connRef.current.open) {
          // Already paired with someone; ignore extra connections.
          return;
        }
        bindConnection(conn);
      });
      peer.on("error", (err) => {
        if (cancelled) return;
        // "unavailable-id" means this code is momentarily taken — the safest fix
        // is to reload with a brand-new code.
        if (err.type === "unavailable-id") {
          sessionStorage.removeItem(roleKey(code));
          window.location.hash = "";
          window.location.reload();
          return;
        }
        setError(err.type || "connection-error");
        setStatus("error");
      });
    } else {
      // Joiner: connect to the host, retrying until the host is ready.
      const peer = createJoinerPeer();
      peerRef.current = peer;

      const tryConnect = () => {
        if (cancelled || (connRef.current && connRef.current.open)) return;
        const conn = peer.connect(hostIdFor(code), { reliable: true });
        bindConnection(conn);
        // If it hasn't opened shortly, the host probably isn't up yet — retry.
        retryTimer = setTimeout(() => {
          if (!cancelled && (!connRef.current || !connRef.current.open)) {
            try {
              conn.close();
            } catch {
              /* ignore */
            }
            tryConnect();
          }
        }, 2500);
      };

      peer.on("open", () => {
        if (cancelled) return;
        setStatus("waiting");
        tryConnect();
      });
      peer.on("error", (err) => {
        if (cancelled) return;
        // Host not registered yet -> keep retrying rather than hard-failing.
        if (err.type === "peer-unavailable") return;
        setError(err.type || "connection-error");
        setStatus("error");
      });
    }

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        if (connRef.current) connRef.current.close();
      } catch {
        /* ignore */
      }
      try {
        if (peerRef.current) peerRef.current.destroy();
      } catch {
        /* ignore */
      }
    };
    // We deliberately run this once for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = status === "connected";

  // Send a text snippet or link. Also echoes it into our own feed.
  const sendText = useCallback(
    (kind, content) => {
      const conn = connRef.current;
      if (!conn || !conn.open) return false;
      sendTextOverConn(conn, kind, content);
      onItemRef.current &&
        onItemRef.current({
          id: crypto.randomUUID(),
          dir: "out",
          kind,
          content,
          at: Date.now(),
        });
      return true;
    },
    []
  );

  // Send a File/Blob with a live progress bar; echoes it into our own feed.
  const sendFile = useCallback(async (file) => {
    const conn = connRef.current;
    if (!conn || !conn.open) return false;
    const tempId = crypto.randomUUID();
    reportProgress({ id: tempId, name: file.name, progress: 0, dir: "out" });
    const meta = await sendFileOverConn(conn, file, (progress) =>
      reportProgress({ id: tempId, name: file.name, progress, dir: "out" })
    );
    reportProgress({ id: tempId, done: true });
    const kind = (file.type || "").startsWith("image/") ? "image" : "file";
    onItemRef.current &&
      onItemRef.current({
        id: meta.id,
        dir: "out",
        kind,
        name: file.name,
        mime: file.type,
        size: file.size,
        blob: file,
        url: URL.createObjectURL(file),
        at: Date.now(),
      });
    return true;
  }, [reportProgress]);

  return { status, error, code, role, isConnected, transfers, sendText, sendFile };
}

// Small helper kept here to avoid an import cycle in the effect above.
function hostIdFor(code) {
  return "zenithtransfer-" + code;
}
