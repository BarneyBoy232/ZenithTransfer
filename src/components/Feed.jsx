import Icon from "./Icon.jsx";

function formatSize(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function metaLine(item) {
  const who = item.dir === "out" ? "Sent" : item.from ? `From ${item.from}` : "Received";
  const size = item.size ? ` · ${formatSize(item.size)}` : "";
  return who + size;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* ignore */
  }
}

function Row({ item }) {
  if (item.kind === "image") {
    return (
      <div className="item">
        <div className="item__thumb">{item.url && <img src={item.url} alt={item.name || "image"} />}</div>
        <div className="item__body">
          <div className="item__name">{item.name || "image"}</div>
          <div className="item__meta">{metaLine(item)}</div>
        </div>
        {item.url && (
          <a className="item__action" href={item.url} download={item.name || "image"} aria-label="Download">
            <Icon name="download" />
          </a>
        )}
      </div>
    );
  }

  if (item.kind === "file") {
    return (
      <div className="item">
        <div className="item__icon"><Icon name="file" /></div>
        <div className="item__body">
          <div className="item__name">{item.name}</div>
          <div className="item__meta">{metaLine(item)}</div>
        </div>
        {item.url ? (
          <a className="item__action" href={item.url} download={item.name || "file"} aria-label="Download">
            <Icon name="download" />
          </a>
        ) : (
          <span className="item__meta">too large to keep</span>
        )}
      </div>
    );
  }

  const isLink = item.kind === "link";
  return (
    <div className="item">
      <div className="item__icon"><Icon name={isLink ? "link" : "text"} /></div>
      <div className="item__body">
        {isLink ? (
          <a className="item__name item__link" href={item.content} target="_blank" rel="noreferrer">
            {item.content}
          </a>
        ) : (
          <div className="item__name item__text">{item.content}</div>
        )}
        <div className="item__meta">{metaLine(item)}</div>
      </div>
      <button className="item__action" onClick={() => copyText(item.content)} aria-label="Copy">
        <Icon name="copy" />
      </button>
    </div>
  );
}

export default function Feed({ items, transfers, label = "Activity", emptyText = "Anything you send or receive appears here." }) {
  const active = Object.entries(transfers || {});

  return (
    <section className="feed">
      {label && <div className="feed__label">{label}</div>}

      {active.length === 0 && items.length === 0 && emptyText && (
        <p className="feed__empty">{emptyText}</p>
      )}

      {active.map(([id, t]) => (
        <div key={id} className="progress">
          <div className="progress__label">
            {t.dir === "out" ? "Sending" : "Receiving"} {t.name} — {Math.round((t.progress || 0) * 100)}%
          </div>
          <div className="progress__bar">
            <div className="progress__fill" style={{ width: `${Math.round((t.progress || 0) * 100)}%` }} />
          </div>
        </div>
      ))}

      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </section>
  );
}
