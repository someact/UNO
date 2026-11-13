# 🃏 Multi-UNO — Project Plan & Task Tracker

Online multiplayer UNO for **PC, tablet, and phone browsers**—join in seconds with just a display name and Room ID, featuring rich custom SVG card illustrations & animations, multiple UNO modes, AI bots, mobile gesture controls, and Docker + Cloudflare Tunnel deployment on `cs31`.

> **Current Progress:** Phase 1 Complete (`@uno/shared` Engine & 16/16 Unit Tests Passing) — Ready for **Phase 2 (`@uno/server`)**

---

## Architecture & Decisions Summary

- **Codebase Approach:** Clean-slate TypeScript monorepo in `/home/BYACT/Projects/Multi-UNO` (`https://github.com/someact/UNO`), leaving the old inactive `~/uno-game` directory on `cs31` untouched and deploying cleanly to `~/multi-uno`.
- **Server Port & Domain Routing:** Docker Compose binds **`127.0.0.1:3150->3000`** (`HOST_PORT` configurable), verified free on `cs31` and aligned with `cloudflared` loopback routing (`http://localhost:3150`).
- **Player Capacity:** **2 to 6 players** per room (humans + AI bots), plus optional **Spectator** slot for late joiners who auto-enter the next round.
- **Game Modes Included:**
  1. **Classic UNO** (with optional `Wild +4` Challenge/Bluff rule & Draw-1 Play-or-Keep)
  2. **UNO No Mercy** (progressive `+2/+4/+6/+10` stacking, `7` swap / `0` rotate hands, `Discard All` color, `25`-card Mercy elimination)
  3. **UNO Flip!** (two-sided Light/Dark cards, `Flip` inverts entire table/hands, Dark `+5`, `Skip Everyone`, `Wild Draw Color`)
  4. **Blitz / Speed UNO** (`Jump-In` out-of-turn exact match with server race lock, `Draw-Until-Playable`, `15s` turn timer)
  5. **Custom House Rules** (mix-and-match rule toggles + starting hand size `5 / 7 / 10`)

---

## Task Tracking by Phase

### Phase 0 — Environment, Repo & Design Alignment
- [x] Verify SSH connectivity (`cs31@100.104.87.92`) and Docker / `cloudflared` environment
- [x] Verify `gh` CLI auth (`someact`) and push access to `https://github.com/someact/UNO`
- [x] Identify non-conflicting server port (`3150`) for Cloudflare Tunnel ingress
- [x] Test initial commit & push of `PLAN.md` to `https://github.com/someact/UNO` (`bc1e62b`)
- [x] Incorporate edge-case rules, mobile gesture physics, and spectator/host-migration specs into separated phases

---

### Phase 1 — Monorepo Setup & Shared Game Engine (`@uno/shared`)
**Goal:** Build a strictly typed, framework-agnostic, 100% unit-tested UNO rule engine supporting all 5 modes, 2–6 players, and anti-cheat sanitized state views.

- [x] **1.1** Initialize npm workspaces monorepo (`package.json`, `tsconfig.base.json`, `.gitignore`, `packages/shared`) with TypeScript strict mode & Vitest
- [x] **1.2** Define core schemas in `@uno/shared`: dual-face `Card` (`light` + optional `dark`), `SeatPlayer`, `RoomConfig`, `HouseRules`, `GameAction`, `PendingAction`, and `ClientGameState` (no opponent card leaks)
- [x] **1.3** Implement deterministic deck builders, Fisher-Yates shuffle, auxiliary-deck exhaustion fallback, and hand sorting utilities
- [x] **1.4** Implement core turn flow (`findNextActiveIndex`, 2-player `Reverse` = `Skip`, `Draw-1` play-or-keep, `UNO!` shout & `CATCH!` `+2` penalty, round/match scoring)
- [x] **1.5** Implement **Classic UNO** rules + optional **Wild +4 Bluff Challenge** (`+4` to offender if guilty, `+6` to challenger if innocent)
- [x] **1.6** Implement **UNO No Mercy** rules (progressive `+2/+4/+6/+10` stacking, `7` swap target, `0` rotate hands, `Discard All`, `25`-card Mercy elimination & last-standing win)
- [x] **1.7** Implement **UNO Flip!** rules (Light/Dark active side switching, `Flip`, Light `+1` / `Wild +2`, Dark `+5` / `Skip Everyone` / `Wild Draw Color`)
- [x] **1.8** Implement **Blitz / Speed UNO** & **Custom House Rules** (`Jump-In` out-of-turn exact match, `Draw-Until-Playable`, mode preset builder)
- [x] **1.9** Write comprehensive Vitest unit tests for all modes, edge cases, deck reshuffling, and sanitized client projections; verify `npm test` & `npm run build` pass, then commit & push Phase 1 to GitHub

---

### Phase 2 — Authoritative Multiplayer Server (`@uno/server`)
**Goal:** Real-time Socket.IO game server with room management, reconnect persistence, smart AI bots, timers, and abuse protection.

- [ ] **2.1** Set up Express + Socket.IO server with `/healthz` endpoint, CORS/origin support, and production static serving
- [ ] **2.2** Build `RoomManager` & `Room` lifecycle (short Room ID generator, max 6 players, late-joiner Spectator mode, automatic Host Migration on disconnect, idle room TTL garbage collection)
- [ ] **2.3** Implement `localStorage` session token reconnection + optional bot auto-takeover on disconnect
- [ ] **2.4** Implement server-authoritative turn countdown timers + automatic timeout fallback (auto-draw / keep / random valid color)
- [ ] **2.5** Build AI Bot engine (`Casual` & `Smart` difficulties: stack defense, best-color selection, `7`-swap targeting lowest-card rival, human-like reaction delay & UNO shout probability)
- [ ] **2.6** Add input sanitization, chat/reaction rate limiting, and Socket.IO integration tests; commit & push Phase 2 to GitHub

---

### Phase 3 — Visual System, Card Art & Sound (`@uno/client`)
**Goal:** Rich tabletop atmosphere with custom illustrated SVG cards, colorblind accessibility, and tactile Web Audio feedback.

- [ ] **3.1** Initialize React + Vite + Tailwind CSS + Framer Motion client workspace with responsive `100dvh` viewport and `overscroll-behavior: none`
- [ ] **3.2** Create selectable tabletop themes (Classic Emerald Felt, Neon Arcade Lounge, Cozy Wood Café) + dynamic active-color table rim glow
- [ ] **3.3** Design crisp custom SVG card faces & Light/Dark card backs (`0–9`, `Skip`, `Reverse`, `+1/+2/+5`, `Wild`, `+4/+6/+10`, `Discard All`, `Flip`, `Skip Everyone`, `Wild Draw Color`) with colorblind corner symbols
- [ ] **3.4** Build animated center arena (Draw Deck stack, Discard Pile with angled throws, spinning Direction Orbit, live Draw-Stack penalty counter badge)
- [ ] **3.5** Build radial 2–6 player opponent seat badges with illustrated avatars, mini card-fan counts, active turn progress ring, and floating emoji reactions
- [ ] **3.6** Implement zero-latency Web Audio API sound synthesizer (deal, snap, draw swoosh, flip whoosh, UNO alert, victory chime) + optional mobile vibration haptics + mute toggle; commit & push Phase 3 to GitHub

---

### Phase 4 — Cross-Device UX, Gestures & Game Modals (`@uno/client`)
**Goal:** Effortless play on phone, tablet, and PC via swipe, drag-and-drop, tap-to-preview, and keyboard shortcuts.

- [ ] **4.1** Build Home & Lobby screen (Name-only entry, Create/Join by Room ID, `?room=XXXX` deep link, QR code share sheet, Host Rule Configurator, Mode Rules Cheat Sheet modal)
- [ ] **4.2** Build responsive hand tray with **Directional Gesture Locking**: horizontal hand scroll (`dx`), **Swipe-Up-to-Play** (`dy`), **Drag-and-Drop** onto discard pile with magnetic target glow, and **Tap-to-Preview / Double-Tap** safe mode
- [ ] **4.3** Add Sort Hand button (by color/playable), playable-card elevation & dimming, desktop hover fanning, and keyboard shortcuts (`Arrows`/`1–9`/`Enter`/`Space`/`U`)
- [ ] **4.4** Build interactive game modals: radial Wild Color Wheel, `7`-Swap Target Picker, `Wild +4` Challenge prompt, `UNO!` / `CATCH!` floating action bar, and Round/Match Score Podium with Rematch button
- [ ] **4.5** Add floating emoji reaction bar & collapsible chat/event drawer; commit & push Phase 4 to GitHub

---

### Phase 5 — Verification, Responsive QA & Polish
**Goal:** Verify everything end-to-end across viewports, automated suites, and live multi-client matches.

- [ ] **5.1** Run full `@uno/shared` unit tests + `@uno/server` integration tests + production TypeScript/Vite build
- [ ] **5.2** Verify responsive UX & gesture interactions across Phone (`375x812`), Tablet (`768x1024`), and Desktop (`1440x900`) viewports
- [ ] **5.3** Playtest 2-player and 6-player matches across Classic, No Mercy, UNO Flip, and Blitz modes (including reconnect & bot takeover); commit & push Phase 5 to GitHub

---

### Phase 6 — Docker Packaging & `cs31` Deployment
**Goal:** Ship cleanly to `cs31` behind your Cloudflare Tunnel domain on port `3150`.

- [ ] **6.1** Add multi-stage `Dockerfile` (Node 22 Alpine), `.dockerignore`, and `docker-compose.yml` binding `127.0.0.1:${HOST_PORT:-3150}:3000`
- [ ] **6.2** Write `DEPLOY.md` documenting `cs31` deploy steps and Cloudflare Zero Trust Tunnel ingress (`http://localhost:3150`)
- [ ] **6.3** Commit & push final release to `https://github.com/someact/UNO`
- [ ] **6.4** Clone/pull repo to `cs31@100.104.87.92:~/multi-uno`, run `docker compose up -d --build`, verify `/healthz` and live multiplayer gameplay over your domain
