// Local, per-device history using IndexedDB. Nothing here ever leaves the
// device — it's just a personal log of what you sent/received in this browser.
//
// To keep the database small we store text/links in full, and for files we
// store the metadata plus the actual bytes only when they're reasonably small.

const DB_NAME = "zenithtransfer";
const STORE = "history";
const MAX_STORED_BLOB = 10 * 1024 * 1024; // only keep blobs up to 10 MB

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save one feed item. We strip the temporary object URL (it isn't valid after a
// reload) and drop large blobs so the database stays small.
export async function saveItem(item) {
  try {
    const db = await openDb();
    const record = { ...item, url: undefined };
    if (record.blob && record.size > MAX_STORED_BLOB) {
      record.blob = undefined; // too big to keep; metadata only
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // History is a nice-to-have; never let it break a transfer.
  }
}

// Load all saved items, newest first, rebuilding a usable object URL for any
// blob we kept.
export async function loadItems() {
  try {
    const db = await openDb();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items
      .map((it) => (it.blob ? { ...it, url: URL.createObjectURL(it.blob) } : it))
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

// Wipe all saved history on this device.
export async function clearHistory() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}
