import { useState } from "react";

// A plain-language connection log so you can see WHERE pairing breaks on a real
// phone (where the browser console isn't easily accessible). Open it on both
// devices, try to pair, and read what each one says.
function timeOf(t) {
  const d = new Date(t);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export default function Diagnostics({ self, brokerReady, logs }) {
  const [open, setOpen] = useState(false);

  const copyLog = async () => {
    const text = logs.map((l) => `${timeOf(l.t)} ${l.msg}${l.count > 1 ? ` (x${l.count})` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="diag">
      <button className="btn btn--ghost btn--small" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide connection details" : "Connection details"}
      </button>

      {open && (
        <div className="diag__body">
          <div className="diag__row">
            <span className={`dot dot--${brokerReady ? "connected" : "waiting"}`} />
            <span>{brokerReady ? "Matchmaker connected — this device is findable" : "Connecting to matchmaker…"}</span>
          </div>
          <div className="diag__id">This device id: <code>{self?.id}</code></div>

          <div className="diag__loghead">
            <span>Log</span>
            <button className="btn btn--ghost btn--small" onClick={copyLog}>Copy log</button>
          </div>
          <ul className="diag__log">
            {logs.length === 0 && <li className="diag__muted">No events yet.</li>}
            {logs.map((l, i) => (
              <li key={i}>
                <span className="diag__time">{timeOf(l.t)}</span> {l.msg}
                {l.count > 1 && <span className="diag__count"> ×{l.count}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
