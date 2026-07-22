import Feed from "./Feed.jsx";

// Shows this device's saved local history (from IndexedDB). Reuses the same
// card layout as the live feed for consistency.
export default function HistoryPanel({ open, items, onToggle, onClear }) {
  return (
    <section className="history">
      <div className="history__head">
        <button className="btn btn--ghost btn--small" onClick={onToggle}>
          {open ? "Hide history" : `Saved on this device (${items.length})`}
        </button>
        {open && items.length > 0 && (
          <button className="btn btn--ghost btn--small" onClick={onClear}>
            Clear history
          </button>
        )}
      </div>
      {open &&
        (items.length ? (
          <Feed items={items} transfers={{}} />
        ) : (
          <p className="history__empty">No saved items on this device yet.</p>
        ))}
    </section>
  );
}
