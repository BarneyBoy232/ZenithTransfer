import { useMemo, useState } from "react";

// Lets you build "chains": rules that make one device auto-forward items to
// another. Example: on the phone, forward anything from PC1 to PC2. Every rule
// has an on/off toggle, and because rules sync across devices you can flip a
// chain from any of them.
export default function ChainManager({ self, devices, rules, onSetRule }) {
  const [open, setOpen] = useState(false);

  // All devices you can pick from = this device plus everything paired.
  const all = useMemo(
    () => [{ id: self?.id, name: `${self?.name} (this device)` }, ...devices],
    [self, devices]
  );
  const nameOf = (id) => all.find((d) => d.id === id)?.name || "unknown";

  const [relayId, setRelayId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const canAdd = relayId && fromId && toId && fromId !== toId && relayId !== fromId && relayId !== toId;

  const addRule = () => {
    if (!canAdd) return;
    onSetRule({ id: crypto.randomUUID(), relayId, fromId, toId, enabled: true });
    setRelayId("");
    setFromId("");
    setToId("");
  };

  // Chains need at least two other devices to be meaningful.
  const canBuild = all.length >= 3;

  return (
    <section className="chains">
      <button className="btn btn--ghost btn--small" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide chains" : `Chains (${rules.length})`}
      </button>

      {open && (
        <div className="chains__body">
          <p className="chains__hint">
            A chain makes one device pass items along automatically. It only relays while that middle device is online.
          </p>

          {rules.length > 0 && (
            <ul className="chains__list">
              {rules.map((r) => (
                <li key={r.id} className="chains__item">
                  <span className="chains__rule">
                    <strong>{nameOf(r.relayId)}</strong>: {nameOf(r.fromId)} → {nameOf(r.toId)}
                  </span>
                  <label className="chains__toggle">
                    <input
                      type="checkbox"
                      checked={!!r.enabled}
                      onChange={() => onSetRule({ ...r, enabled: !r.enabled })}
                    />
                    {r.enabled ? "On" : "Off"}
                  </label>
                  <button
                    className="btn btn--ghost btn--small"
                    onClick={() => onSetRule({ ...r, deleted: true })}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canBuild ? (
            <div className="chains__add">
              <label>
                On
                <select value={relayId} onChange={(e) => setRelayId(e.target.value)}>
                  <option value="">device…</option>
                  {all.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label>
                forward from
                <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  <option value="">device…</option>
                  {all.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label>
                to
                <select value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">device…</option>
                  {all.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <button className="btn btn--primary btn--small" disabled={!canAdd} onClick={addRule}>
                Add chain
              </button>
            </div>
          ) : (
            <p className="chains__hint">Link at least two other devices to build a chain.</p>
          )}
        </div>
      )}
    </section>
  );
}
