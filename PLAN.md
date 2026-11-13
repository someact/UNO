# 🃏 Multi-UNO — Project Plan & Task Tracker

Online multiplayer UNO built for browsers across **PC, tablet, and phone**—easy drop-in play with just a display name and Room ID, rich custom SVG card illustrations & animations, multiple UNO game modes, AI bots, and Docker + Cloudflare Tunnel deployment on `cs31`.

> **Current Status:** Phase 0 (Planning & Environment Setup) — **No application code written yet.**

---

## 1. Core Product Requirements

- **Instant Drop-In Join:** Enter a display name only (no accounts/login). Create a room to get a short shareable **Room ID** (e.g., `UNO-4829` or `ABCD`) + invite URL / QR code, or join an existing room by ID.
- **Player Capacity:** **2 to 6 players** per room (mix of human players and AI bots).
- **Host Room Controls:**
  - Game mode selector
  - Add / remove AI bots (configurable difficulty: Casual / Smart)
  - Turn timer (`Off`, `15s`, `30s`, `45s`)
  - Match win condition (`Single Round` vs `Target Score: 250 / 500 pts`)
  - Starting hand size (`5`, `7`, `10`) & house-rule toggles
  - Room lock / kick / transfer host / rematch in same lobby
- **Authoritative & Resilient Gameplay:**
  - Server owns deck & hands (clients never receive opponent cards—only card counts and public discard pile)
  - `localStorage` reconnect token so phone refreshes or brief Wi-Fi drops restore your exact seat & hand
  - Optional bot auto-takeover if a player disconnects mid-match or times out

---

## 2. Game Modes (Classic + Suggested Variants)

| Mode | Core Twist | Why Include It |
| :--- | :--- | :--- |
| **Classic UNO** | Official rules: match color/number/symbol, `Skip`, `Reverse` (acts as Skip in 2P), `+2`, `Wild`, `Wild +4`, `UNO!` call & `+2` catch penalty. | Familiar baseline everyone knows immediately. |
| **UNO No Mercy** *(Recommended)* | **Progressive stacking** (`+2` / `+4` / `+6` / `+10`), **7-0 Rule** (`7` = swap hands with any player, `0` = rotate all hands in turn direction), **Discard All** (drop all matching-color cards at once), and **25-Card Mercy Elimination**. | Huge replay value and hilarious comeback/chaos moments with 3–6 friends. |
| **UNO Flip! (Light & Dark)** | Two-sided cards! Starts on **Light Side** (`+1`, `Skip`, `Flip`); playing a **Flip** card flips the entire table, deck, and all hands to **Dark Side** (`Draw +5`, `Skip Everyone` [play again!], `Wild Draw Color`) until flipped back. | Visually dramatic 3D card-flip animations and tactical shifts. |
| **Blitz / Speed UNO** | **Jump-In** (play an identical color + value card out of turn if you react first!), **Draw-Until-Playable**, mandatory fast turn timer (`15s`). | Keeps everyone engaged even when it's not their turn. |
| **Custom House Rules** | Host mixes and matches individual toggles (`Stacking`, `7-0`, `Jump-In`, `Draw Until Match`, `Hand Size`). | Lets friend groups play their exact local rules. |

---

## 3. Visual Design, Illustration & Animation Spec

- **Tabletop Aesthetic:** Tactile arcade card lounge—deep felt/slate arena with subtle radial spotlight, glowing active-turn seat ring, and dynamic table rim color matching the current active color (plus colorblind-friendly corner badges/patterns on every card).
- **Custom SVG Card Art:** Crisp bespoke vector illustrations for:
  - Number cards (`0–9` with bold corner indices and subtle diagonal emblem)
  - Action cards (`Skip`, `Reverse`, `Draw +2`, `Wild`, `Wild +4`, plus mode specials like `+6`, `+10`, `Discard All`, `Flip`, `Skip Everyone`)
  - Light & Dark card backs for **UNO Flip!**
- **Animations (Framer Motion + CSS 3D):**
  - Round-start **deal burst** flying cards from center deck to all seats
  - **Curved fanned hand** with smooth hover/touch lift and glowing playable-card outline
  - **Arced card throw** from hand/opponent avatar onto discard pile with slight natural rotation
  - **3D card flip** on draw and **full-table Light ↔ Dark flip** in UNO Flip
  - **Spinning direction orbit** around center table reversing smoothly on `Reverse`
  - **Callout overlays & particle bursts** for `SKIP!`, `+4 STACK!`, `UNO!`, `CAUGHT!`, and winner confetti podium
- **Zero-Latency Audio (Web Audio API):** Procedural SFX for card snap, shuffle, draw swoosh, illegal-card thud, UNO buzzer, and victory chime (with mute toggle).

---

## 4. Cross-Device UX & Card Interaction Spec (PC / Tablet / Phone)

- **Adaptive 2–6 Player Layout:**
  - **Phone Portrait (`360px–600px`):** Compact top/arc opponent badges showing avatar, name, card count mini-stack, turn progress ring, and UNO badge; large centered Draw Deck + Discard Pile; generous curved/scrollable bottom hand tray in thumb reach.
  - **Tablet & Desktop (`768px+`):** Full radial oval table positioning opponents cleanly around top/left/right edges, spacious center arena, and non-overlapping reaction/event drawer.
- **Multi-Modal Card Controls:**
  - **Swipe Up to Play (Touch):** Flick/swipe any playable card upward past a release threshold toward the discard zone (highlighted magnetic drop target).
  - **Drag & Drop (Touch & Mouse):** Grab any card and drag it smoothly onto the discard pile; springs back cleanly if invalid or cancelled.
  - **Tap-to-Preview + Tap-to-Play (Safe Mode for Crowded Hands):** First tap raises/inspects the card; second tap (or tapping the discard pile) plays it—great on small phone screens when holding 12+ cards.
  - **Horizontal Hand Swipe / Scroll:** Smooth scroll/pan across fanned cards when holding large hands.
  - **Keyboard Shortcuts (PC):** `ArrowLeft`/`ArrowRight` (or `1–9`) select card, `Enter` play, `Space` draw, `U` call `UNO!`.
  - **Color Picker & Target Picker Modals:** Instant radial 4-color wheel for Wilds (pre-orientable or fast tap) and quick seat picker when playing a `7` swap in No Mercy.

---

## 5. Technical Stack & Repository Layout

```text
Multi-UNO/                     # Local workspace -> github.com/someact/UNO
├── PLAN.md                    # This living plan & task tracker
├── Dockerfile                 # Multi-stage production build (client + server)
├── docker-compose.yml         # Maps 127.0.0.1:${HOST_PORT:-3150}:3000
├── package.json               # npm workspaces monorepo root
└── packages/
    ├── shared/                # @uno/shared: types, deck builders, pluggable mode rule engines
    ├── server/                # @uno/server: Node + Express + Socket.IO, rooms, bots, timers
    └── client/                # @uno/client: React + Vite + Tailwind + Framer Motion + gesture physics
```

---

## 6. Deployment & Networking Plan (`cs31` + Cloudflare Tunnel)

- **Target Server:** `cs31@100.104.87.92` (Arch Linux, Docker + `cloudflared.service` active).
- **Assigned Host Port:** **`127.0.0.1:3150->3000`** (configurable via `HOST_PORT`, default `3150`).
  - Verified free on `cs31` (`3090`, `3100`, `3131`, `3140`, `8120` are used by existing containers).
  - Matches `cs31`'s `cloudflared` loopback pattern so you can point your domain/subdomain (e.g., `uno.yourdomain.com`) to `http://localhost:3150` with WebSocket support enabled automatically over HTTPS/WSS.
- **Workflow:**
  1. Build, test, and verify locally in `/home/BYACT/Projects/Multi-UNO`
  2. Commit & push to `https://github.com/someact/UNO` (`git` + `gh` credentials)
  3. Pull & deploy on `cs31` via `docker compose up -d --build`

---

## 7. Task Tracking Checklist

### Phase 0 — Environment & Design Alignment (Current)
- [x] Verify SSH connectivity and Docker/Cloudflared setup on `cs31@100.104.87.92`
- [x] Verify `gh` CLI authentication (`someact`) and `https://github.com/someact/UNO` access
- [x] Identify non-conflicting server port (`3150`) for Cloudflare Tunnel routing
- [x] Create `PLAN.md` task tracker (no application code yet)
- [ ] Test initial commit & push of `PLAN.md` to `https://github.com/someact/UNO` using `git`/`gh`
- [ ] Confirm design preferences with user (prototype reuse vs clean build, launch modes, art theme, deploy directory on `cs31`)

### Phase 1 — Monorepo & Shared Game Engine (`@uno/shared`)
- [ ] Initialize npm workspace monorepo (`shared`, `server`, `client`) with TypeScript strict mode & Vitest
- [ ] Define core card, player, room config, action, and sanitized client-state schemas
- [ ] Implement pluggable `GameModeEngine` interface + deck generators
- [ ] Implement **Classic UNO** rules + win scoring + UNO penalty/catch state machine
- [ ] Implement **UNO No Mercy** rules (stacking `+2/+4/+6/+10`, `7-0` swap/rotate, `Discard All`, `25`-card elimination)
- [ ] Implement **UNO Flip!** rules (Light/Dark dual-sided cards, `Flip`, `+5`, `Skip Everyone`, `Wild Draw Color`)
- [ ] Implement **Blitz / Speed UNO** & **Custom House Rules** toggles (`Jump-In`, `Draw-Until-Playable`)
- [ ] Write comprehensive unit tests covering every mode, edge case, and 2–6 player turn transitions

### Phase 2 — Authoritative Multiplayer Server (`@uno/server`)
- [ ] Set up Express + Socket.IO server with health check endpoint (`/healthz`) and production static serving
- [ ] Build room lifecycle manager (create room, short Room ID generator, join validation up to 6 players, host controls, lobby chat/ready state)
- [ ] Implement session reconnect tokens & mid-game disconnect grace window / bot fallback
- [ ] Build server-side turn countdown timers + automatic timeout action
- [ ] Build AI Bot engine (smart color choice, stacking awareness, 7-swap target heuristic, UNO call chance)
- [ ] Add integration tests for Socket.IO room lifecycle, reconnects, Jump-In race handling, and bot turns

### Phase 3 — Visual System, Card Art & Audio (`@uno/client`)
- [ ] Set up React + Vite + Tailwind CSS + Framer Motion + design tokens (light/dark table themes & colorblind badges)
- [ ] Design custom SVG card artwork & card backs (Classic, No Mercy specials, UNO Flip Light & Dark sets)
- [ ] Build animated table center (Draw Deck, Discard Pile, spinning Direction Orbit, stacked-penalty counter badge)
- [ ] Build opponent seat cards/avatars around radial table with active turn countdown ring & mini card stacks
- [ ] Implement Web Audio API procedural sound effects + mute/volume toggle

### Phase 4 — Cross-Device UX & Interactive Controls (`@uno/client`)
- [ ] Build Lobby & Home Screen (Name input, Create Room, Join by Room ID / `?room=XXXX` auto-fill, QR share sheet, Host Rule Configurator)
- [ ] Implement unified gesture hand tray: **Swipe Up to Play**, **Drag & Drop to Pile**, **Tap-to-Preview / Double-Tap**, and horizontal pan for large hands
- [ ] Implement desktop hover fanning + keyboard navigation shortcuts
- [ ] Build interactive Wild Color Wheel modal, `7`-Swap Target Picker modal, UNO Shout / Catch alert bar, and Round/Match Podium scoreboard
- [ ] Add floating emoji reactions & collapsible game log / quick chat drawer

### Phase 5 — Verification, Polish & Cross-Viewport QA
- [ ] Test responsive layouts across mobile portrait (`375x812`), tablet (`768x1024`), and desktop (`1440x900`) viewports
- [ ] Run automated unit + integration test suite + production TypeScript/Vite build
- [ ] Playtest full 2-player and 6-player (humans + bots) matches across Classic, No Mercy, Flip, and Blitz modes

### Phase 6 — GitHub Push & `cs31` Deployment
- [ ] Add `Dockerfile` (multi-stage Node 22 build), `.dockerignore`, and `docker-compose.yml` (`127.0.0.1:3150:3000`)
- [ ] Write `DEPLOY.md` with exact Cloudflare Tunnel ingress instructions (`http://localhost:3150`)
- [ ] Commit & push final release to `https://github.com/someact/UNO`
- [ ] Clone/pull on `cs31@100.104.87.92`, run `docker compose up -d --build`, verify `/healthz` and WebSocket room play via domain
