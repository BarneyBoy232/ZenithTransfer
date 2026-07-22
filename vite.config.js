import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static single-page app. `host: true` lets you open the dev server from your
// phone on the same WiFi (e.g. http://192.168.x.x:5173) for quick testing.
export default defineConfig({
  plugins: [react()],
  server: { host: true },
});
