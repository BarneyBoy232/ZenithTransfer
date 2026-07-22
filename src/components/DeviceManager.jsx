import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// Shows this device's name, the list of paired devices with live status, and an
// "Add device" panel that produces a QR / link another device scans to pair.
export default function DeviceManager({ self, devices, statuses, connectedCount, onRevoke, onRename, createPairingUrl }) {
  const [adding, setAdding] = useState(false);
  const [pairUrl, setPairUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const openAdd = () => {
    setPairUrl(createPairingUrl());
    setAdding(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pairUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const saveName = () => {
    onRename(nameDraft);
    setEditingName(false);
  };

  return (
    <section className="devices">
      <div className="devices__self">
        <span className="devices__label">This device</span>
        {editingName ? (
          <span className="devices__rename">
            <input
              className="devices__nameinput"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <button className="btn btn--ghost btn--small" onClick={saveName}>Save</button>
          </span>
        ) : (
          <span className="devices__name">
            {self?.name}
            <button
              className="btn btn--ghost btn--small"
              onClick={() => {
                setNameDraft(self?.name || "");
                setEditingName(true);
              }}
            >
              Rename
            </button>
          </span>
        )}
      </div>

      <div className="devices__head">
        <span className="devices__label">
          Your devices · {connectedCount} online
        </span>
        <button className="btn btn--primary btn--small" onClick={openAdd}>
          Add device
        </button>
      </div>

      {devices.length === 0 && !adding && (
        <p className="devices__empty">No devices linked yet. Tap “Add device” and scan the code on your other phone or computer — they stay linked until you revoke them.</p>
      )}

      <ul className="devices__list">
        {devices.map((d) => (
          <li key={d.id} className="devices__item">
            <span className={`dot dot--${statuses[d.id] ? "connected" : "waiting"}`} />
            <span className="devices__itemname">{d.name}</span>
            <span className="devices__itemstatus">{statuses[d.id] ? "online" : "offline"}</span>
            <button className="btn btn--ghost btn--small" onClick={() => onRevoke(d.id)}>
              Revoke
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="pairing">
          <div className="pairing__qr">
            <QRCodeSVG value={pairUrl} size={160} includeMargin bgColor="#ffffff" fgColor="#0b0f19" />
          </div>
          <div className="pairing__info">
            <p className="pairing__hint">On your other device, scan this with the camera (or open the copied link). It links permanently.</p>
            <div className="pairing__actions">
              <button className="btn btn--ghost" onClick={copyLink}>
                {copied ? "Link copied ✓" : "Copy link"}
              </button>
              <button className="btn btn--ghost" onClick={() => setAdding(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
