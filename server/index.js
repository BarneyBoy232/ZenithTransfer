// ZenithTransfer signaling server ("matchmaker").
//
// This ONLY introduces two devices to each other (a tiny handshake). No files,
// messages, or data ever pass through here — once two devices are introduced,
// everything streams directly between them. Running our own instead of the free
// public PeerJS cloud makes connecting reliable (the public one is overloaded).
//
// Deploy this `server/` folder to any Node host (Render/Railway/Fly free tier).
// Then point the web app at it with the VITE_PEER_* env vars (see ../.env.example).

const express = require("express");
const cors = require("cors");
const { ExpressPeerServer } = require("peer");

const app = express();

// The web app is served from a different origin (Vercel), so allow it to reach
// the signaling endpoints. This server holds no data, so allowing all origins
// is fine — there's nothing private here to protect.
app.use(cors());

// Simple health check (hosts ping "/" to confirm the service is up).
app.get("/", (_req, res) => res.send("ZenithTransfer signaling server is running."));

const port = process.env.PORT || 9000;
const server = app.listen(port, () => {
  console.log(`ZenithTransfer signaling server listening on ${port}`);
});

const peerServer = ExpressPeerServer(server, {
  path: "/",
  proxied: true, // we sit behind the host's HTTPS proxy
  allow_discovery: false, // devices find each other by shared code, not by listing
});

// Mounted at /rtc → the web app connects with path "/rtc".
app.use("/rtc", peerServer);
