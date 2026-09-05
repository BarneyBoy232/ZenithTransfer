import { useEffect, useRef, useState } from "react";

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

  // If the chosen target goes offline, fall back to "all" so sends still work.
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

  // Paste handler: images on the clipboard become files; text fills the box.
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
      {/* Choose a specific device, or leave on "all" (the default). Only shown
          when more than one device is connected. */}
      {connectedDevices.length > 1 && (
        <label className="composer__target">
          Send to
          <select value={target} disabled={disabled} onChange={(e) => setTarget(e.target.value)}>
            <option value="">all connected devices</option>
            {connectedDevices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      )}

      <textarea
        className="composer__text"
        placeholder={
          disabled
            ? "No devices online — link one above, or wait for it to come online…"
            : "Type or paste text, a link, or an image here…"
        }
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendTypedText();
        }}
      />

      <div className="composer__actions">
        <button className="btn btn--ghost" disabled={disabled} onClick={() => fileInput.current?.click()}>
          Add files
        </button>
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
        <button className="btn btn--primary" disabled={disabled || !text.trim()} onClick={sendTypedText}>
          Send text
        </button>
      </div>

      <p className="composer__tip">Tip: drag files onto this box, or paste a screenshot. ⌘/Ctrl + Enter sends text.</p>
    </section>
  );
}
