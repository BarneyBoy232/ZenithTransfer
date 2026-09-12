import { useEffect } from "react";
import Icon from "./Icon.jsx";

// A slide-in settings sheet. Holds the occasional stuff (devices, chains,
// linking, diagnostics, history) so the main screen stays focused on sending.
export default function Drawer({ open, title = "Settings", onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="drawer__head">
          <span className="drawer__title">{title}</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}
