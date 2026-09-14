import Feed from "./Feed.jsx";

// Shows this device's saved local history (from IndexedDB). Reuses the same
// card layout as the live feed for consistency.
export default function HistoryPanel({ open, items, onToggle, onClear }) {
  return (
    <section className="history">
      <div className="history__head">
        <button className="section-toggle" onClick={onToggle}>
          <span>History{items.length ? ` (${items.length})` : ""}</span>
          <span className="section-toggle__hint">{open ? "hide" : "saved on this device"}</span>
        </button>
        {open && items.length > 0 && (
          <button className="btn btn--ghost btn--small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {open &&
        (items.length ? (
          <Feed items={items} transfers={{}} label="" emptyText="" />
        ) : (
          <p className="history__empty">No saved items on this device yet.</p>
        ))}
    </section>
  );
}
