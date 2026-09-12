import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// Looks like a link if it's a single token starting with a URL scheme or www.
function looksLikeLink(text) {
  const t = text.trim();
  return /^(https?:\/\/|www\.)\S+$/i.test(t) && !/\s/.test(t);
}

export default function Composer({ disabled, connectedDevices = [], onSendText, onSendFile }) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState(""); // "" = all connected devices
  const fileInput = useRef(null);

  useEffect(() => {
    if (target && !connectedDevices.some((d) => d.id === target)) setTarget("");
  }, [connectedDevices, target]);

  const sendTypedText = () => {
    const value = text.trim();
    if (!value) return;
    onSendText(looksLikeLink(value) ? "link" : "text", value, target || undefined);
    setText("");
  };

  const sendFiles = (fileList) => {
    for (const file of fileList) onSendFile(file, target || undefined);
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    let handledFile = false;
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          onSendFile(file, target || undefined);
          handledFile = true;
        }
      }
    }
    if (handledFile) e.preventDefault();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) sendFiles(e.dataTransfer.files);
  };

  return (
    <section
      className={`composer ${dragging ? "composer--drag" : ""} ${disabled ? "composer--disabled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="composer__head">
        <h2 className="composer__title">Send something</h2>
        {connectedDevices.length > 1 && (
          <label className="composer__target">
            <span>To</span>
            <select value={target} disabled={disabled} onChange={(e) => setTarget(e.target.value)}>
              <option value="">all devices</option>
              {connectedDevices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <textarea
        className="composer__text"
        placeholder={
          disabled
            ? "No devices online yet — link one, or wait for it to come online…"
            : "Type a message or link, or paste a screenshot…"
        }
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendTypedText();
        }}
      />

      <div className="composer__drop" onClick={() => !disabled && fileInput.current?.click()}>
        <Icon name="upload" size={22} />
        <span>Drop files here, or click to choose</span>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) sendFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="composer__actions">
        <span className="composer__tip">⌘/Ctrl + Enter sends</span>
        <button className="btn btn--primary" disabled={disabled || !text.trim()} onClick={sendTypedText}>
          Send <Icon name="arrowRight" size={16} />
        </button>
      </div>
    </section>
  );
}
