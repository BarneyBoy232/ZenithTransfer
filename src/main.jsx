import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Note: we intentionally do NOT use <React.StrictMode> here. StrictMode
// double-invokes effects in development, which would create and destroy the
// PeerJS peer twice and cause "ID already taken" errors during pairing.
createRoot(document.getElementById("root")).render(<App />);
