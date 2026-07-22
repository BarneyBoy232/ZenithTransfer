// Turn a byte count into something readable like "2.3 MB".
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

function ItemCard({ item }) {
  const dirLabel =
    item.dir === "out" ? "Sent" : item.from ? `From ${item.from}` : "Received";

  if (item.kind === "link") {
    return (
      <article className={`card card--${item.dir}`}>
        <div className="card__tag">{dirLabel} · link</div>
        <a className="card__link" href={item.content} target="_blank" rel="noreferrer">
          {item.content}
        </a>
        <CopyButton value={item.content} />
      </article>
    );
  }

  if (item.kind === "text") {
    return (
      <article className={`card card--${item.dir}`}>
        <div className="card__tag">{dirLabel} · text</div>
        <p className="card__text">{item.content}</p>
        <CopyButton value={item.content} />
      </article>
    );
  }

  if (item.kind === "image") {
    return (
      <article className={`card card--${item.dir}`}>
        <div className="card__tag">{dirLabel} · image · {formatSize(item.size)}</div>
        {item.url && <img className="card__image" src={item.url} alt={item.name || "image"} />}
        {item.url && (
          <a className="btn btn--ghost" href={item.url} download={item.name || "image"}>
            Download
          </a>
        )}
      </article>
    );
  }

  // Generic file
  return (
    <article className={`card card--${item.dir}`}>
      <div className="card__tag">{dirLabel} · file · {formatSize(item.size)}</div>
      <div className="card__file">📄 {item.name}</div>
      {item.url ? (
        <a className="btn btn--ghost" href={item.url} download={item.name || "file"}>
          Download
        </a>
      ) : (
        <span className="card__muted">Too large to keep in history</span>
      )}
    </article>
  );
}

function CopyButton({ value }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  };
  return (
    <button className="btn btn--ghost btn--small" onClick={copy}>
      Copy
    </button>
  );
}

export default function Feed({ items, transfers }) {
  const active = Object.entries(transfers || {});

  if (!items.length && !active.length) {
    return (
      <section className="feed feed--empty">
        <p>Nothing yet. Anything you send from either device shows up here instantly.</p>
      </section>
    );
  }

  return (
    <section className="feed">
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
        <ItemCard key={item.id} item={item} />
      ))}
    </section>
  );
}
