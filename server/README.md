# ZenithTransfer signaling server

A tiny PeerJS signaling server ("matchmaker"). It only **introduces** two devices
to each other (a tiny handshake). No files, messages, or data ever pass through
it — once two devices are introduced, everything streams directly between them.
Running our own instead of the free public PeerJS cloud makes connecting reliable.

Listens on port `9000` (or `$PORT`), PeerJS endpoint mounted at `/rtc`.

---

## Option A — Cloudflare Tunnel on your own machine (recommended)

Run it on a machine you already keep on (e.g. your Minecraft host) and expose it
through a Cloudflare Tunnel, exactly like you do for Minecraft. Free, and it lands
on Cloudflare's HTTPS/443 which school networks tend to allow.

**1. Run the server** (on that machine):

```
cd server
npm install
node index.js        # or keep it running: npm i -g pm2 && pm2 start index.js --name zt-signal && pm2 save
```

Check `http://localhost:9000/` → "ZenithTransfer signaling server is running."

**2. Create the tunnel** (if you don't already have `cloudflared`, install it):

```
cloudflared tunnel login                                   # authorise the zenithurl.com zone
cloudflared tunnel create zenithtransfer-signal            # prints a TUNNEL_ID + creds .json path
cloudflared tunnel route dns zenithtransfer-signal peer.zenithurl.com
```

**3. Configure it.** Copy `cloudflared/config.example.yml` to `config.yml`, fill in
the `TUNNEL_ID` and the credentials-file path it printed, then run:

```
cloudflared tunnel run zenithtransfer-signal
```

(To keep it running on boot: `cloudflared service install`.)

**4. Verify:** open `https://peer.zenithurl.com/` — it should show the "running" message.

WebSockets pass through a tunnel automatically — no extra settings needed.

---

## Option B — a host that runs it for you (Render, etc.)

The repo includes `render.yaml` for a one-click Render Blueprint deploy of this
folder. Any Node host works too (Fly.io, Koyeb, a VPS) — it's a standard Node app
(`npm install` / `npm start`).

---

## Point the app at your server

In Vercel → the ZenithTransfer project → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `VITE_PEER_HOST` | `peer.zenithurl.com` (your hostname, no `https://`) |
| `VITE_PEER_PORT` | `443` |
| `VITE_PEER_PATH` | `/rtc` |
| `VITE_PEER_SECURE` | `true` |

Then **redeploy** the frontend. Confirm in the app's **Connection details** — the
matchmaker line should go green reliably. Leaving these unset falls back to the
public PeerJS cloud.
