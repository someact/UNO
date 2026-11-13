# 🚀 Multi-UNO Deployment Guide (`cs31` + Cloudflare Tunnel)

Multi-UNO runs as a single self-contained container serving the compiled React/Vite client and authoritative Express + Socket.IO server on container port `3000`, bound on loopback `127.0.0.1:3150` by default.

- **Repository:** `https://github.com/someact/UNO`
- **Target host directory:** `~/multi-uno` on `cs31` (leaves inactive legacy `~/uno-game` untouched)
- **Host port:** `127.0.0.1:3150 -> 3000` (override with `HOST_PORT`)

---

## 1. First-Time Deploy on `cs31`

```bash
ssh cs31@100.104.87.92
git clone https://github.com/someact/UNO.git ~/multi-uno
cd ~/multi-uno
docker compose up -d --build
```

Verify the container and health endpoint:

```bash
docker compose ps
curl -s http://127.0.0.1:3150/healthz
# Expected: {"ok":true,"rooms":0,"uptimeSeconds":...}
```

---

## 2. Cloudflare Zero Trust Tunnel Routing

In your Cloudflare Zero Trust dashboard (`Tunnels -> Public Hostname`):

| Field | Value |
| --- | --- |
| **Public Hostname** | Your desired domain / subdomain (e.g. `uno.yourdomain.com`) |
| **Service Type** | `HTTP` |
| **URL** | `http://localhost:3150` |

> [!TIP]
> Ensure **WebSockets** remain enabled under Cloudflare `Network` settings so Socket.IO stays on WebSocket transport without falling back strictly to polling.

---

## 3. Optional Environment Overrides

Create a `.env` file in `~/multi-uno` if you want to customize port binding or restrict CORS strictly to your public domain:

```env
HOST_PORT=3150
CORS_ORIGIN=https://uno.yourdomain.com
```

Then recreate the container:

```bash
docker compose up -d --build
```

---

## 4. Routine Updates

```bash
ssh cs31@100.104.87.92 "cd ~/multi-uno && git pull && docker compose up -d --build"
```

Useful maintenance commands:

```bash
docker compose logs -f multi-uno
docker compose restart multi-uno
docker compose down
```
