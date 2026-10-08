# ZenithTransfer signaling server

A tiny PeerJS signaling server ("matchmaker"). It only **introduces** two devices
to each other — no files, messages, or data ever pass through it. Running our own
instead of the free public PeerJS cloud makes connecting reliable.

## Deploy to Render (free)

1. Push this repo to GitHub (already done).
2. Go to [render.com](https://render.com) → sign in with GitHub.
3. **New → Blueprint**, pick the `ZenithTransfer` repo. Render reads `render.yaml`
   and creates the `zenithtransfer-signal` web service from this `server/` folder.
   (Or **New → Web Service**, root directory `server`, build `npm install`,
   start `npm start`.)
4. Deploy. You'll get a URL like `https://zenithtransfer-signal.onrender.com`.
5. Open that URL — it should say "ZenithTransfer signaling server is running."

## Point the app at it

In Vercel → the ZenithTransfer project → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `VITE_PEER_HOST` | `zenithtransfer-signal.onrender.com` (your URL, no `https://`) |
| `VITE_PEER_PORT` | `443` |
| `VITE_PEER_PATH` | `/rtc` |
| `VITE_PEER_SECURE` | `true` |

Then redeploy the frontend. The app now uses your server. Confirm in
**Connection details** — the matchmaker line should go green reliably.

> Note: Render's free tier sleeps after inactivity, so the first connection of
> the day may take ~30s to wake it. Railway/Fly or Render's paid tier avoid that.
