import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { buildJoinUrl } from "../lib/room.js";

// Human-readable label + colour for each connection state.
const STATUS_LABEL = {
  starting: "Starting…",
  waiting: "Waiting for the other device…",
  connected: "Connected",
  error: "Connection problem",
};

export default function RoomBar({ code, role, status }) {
  const [copied, setCopied] = useState(false);
  const joinUrl = buildJoinUrl(code);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still read the code */
    }
  };

  return (
    <section className="roombar">
      <div className="roombar__status">
        <span className={`dot dot--${status}`} />
        <span>{STATUS_LABEL[status] || status}</span>
      </div>

      {/* The QR + code are only useful on the HOST (the device others join). */}
      {role === "host" && status !== "connected" && (
        <div className="pairing">
          <div className="pairing__qr">
            <QRCodeSVG value={joinUrl} size={168} includeMargin bgColor="#ffffff" fgColor="#0b0f19" />
          </div>
          <div className="pairing__info">
            <p className="pairing__hint">Scan with your phone's camera, or open on the other device and type this code:</p>
            <div className="code">{code}</div>
            <button className="btn btn--ghost" onClick={copyLink}>
              {copied ? "Link copied ✓" : "Copy link"}
            </button>
          </div>
        </div>
      )}

      {role === "joiner" && status !== "connected" && (
        <p className="pairing__hint">Connecting to room <strong>{code}</strong>…</p>
      )}
    </section>
  );
}
