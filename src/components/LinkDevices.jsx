import { useState } from "react";

// Transitive linking: pick two of THIS device's paired devices and link them
// directly to each other — no QR needed. Afterwards they connect on their own,
// without this device in the middle. A primary connection action, shown openly.
export default function LinkDevices({ devices, statuses, onIntroduce }) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [result, setResult] = useState(null); // { ok, reason }

  const canLink = aId && bId && aId !== bId && statuses[aId] && statuses[bId];

  const doLink = () => {
    const r = onIntroduce(aId, bId);
    setResult(r);
    if (r?.ok) {
      setAId("");
      setBId("");
    }
  };

  const options = devices.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name} {statuses[d.id] ? "" : "(offline)"}
    </option>
  ));

  return (
    <section className="linkdev">
      <h3 className="section-title">Link two devices directly</h3>
      <p className="section-sub">
        Link two of your devices to each other — no QR. Both must be online now; afterwards they connect directly, without this device.
      </p>

      {devices.length < 2 ? (
        <p className="linkdev__hint">Link at least two devices to this one first.</p>
      ) : (
        <>
          <div className="linkdev__row">
            <label>
              Link
              <select value={aId} onChange={(e) => setAId(e.target.value)}>
                <option value="">device…</option>
                {options}
              </select>
            </label>
            <label>
              with
              <select value={bId} onChange={(e) => setBId(e.target.value)}>
                <option value="">device…</option>
                {options}
              </select>
            </label>
            <button className="btn btn--primary btn--small" disabled={!canLink} onClick={doLink}>
              Link directly
            </button>
          </div>
          {aId && bId && aId !== bId && (!statuses[aId] || !statuses[bId]) && (
            <p className="linkdev__warn">Both devices need to be online right now to link them.</p>
          )}
          {result && (
            <p className={result.ok ? "linkdev__ok" : "linkdev__warn"}>
              {result.ok ? "Done — they'll link directly within a few seconds." : `Couldn't link: ${result.reason}`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
