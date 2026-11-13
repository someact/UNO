import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import {
  getActiveFace,
  isWildKind,
  pickFallbackColor,
  type ClientGameState,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@uno/shared';
import { createUnoServer, type UnoServerInstance } from '../src/server.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToClientEvents>;

async function connectClient(baseUrl: string): Promise<ClientSocket> {
  const socket: ClientSocket = createClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 4000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

/** Plays valid moves for controlled human sockets until the match reaches `match_over` or `round_over`. */
async function playHumansToFinish(
  clients: Array<{ socket: ClientSocket; playerId: string }>,
  latestStates: Map<string, ClientGameState>,
  onState?: (playerId: string, state: ClientGameState) => void,
  maxSteps = 450
): Promise<ClientGameState> {
  const clientById = new Map(clients.map((c) => [c.playerId, c.socket]));
  const listeners: Array<() => void> = [];

  for (const c of clients) {
    const handler = (st: ClientGameState) => {
      latestStates.set(c.playerId, st);
      onState?.(c.playerId, st);
    };
    c.socket.on('game:state', handler);
    listeners.push(() => c.socket.off('game:state', handler));
  }

  let steps = 0;
  try {
    while (steps < maxSteps) {
      steps += 1;
      const sample = [...latestStates.values()][0];
      if (sample && (sample.phase === 'match_over' || sample.phase === 'round_over')) {
        return sample;
      }

      let acted = false;
      for (const [pid, state] of latestStates.entries()) {
        if (state.phase !== 'playing') return state;

        const sock = clientById.get(pid);
        if (!sock) continue;

        // Respond to pending actions first.
        if (state.pendingAction) {
          if (state.pendingAction.type === 'drawn_playable' && state.pendingAction.playerId === pid) {
            const card = state.myHand.find((c) => c.id === state.pendingAction!.cardId);
            if (card) {
              const face = getActiveFace(card, state.activeSide);
              await sock.emitWithAck('game:action', {
                type: 'play_card',
                cardId: card.id,
                ...(isWildKind(face.kind)
                  ? { chosenColor: pickFallbackColor(state.myHand, state.activeSide) }
                  : {}),
              });
              acted = true;
              break;
            }
          } else if (
            state.pendingAction.type === 'choose_swap_target' &&
            state.pendingAction.playerId === pid
          ) {
            const targets = state.players
              .filter((p) => !p.eliminated && p.id !== pid)
              .sort((a, b) => a.handCount - b.handCount);
            if (targets[0]) {
              await sock.emitWithAck('game:action', {
                type: 'choose_swap_target',
                targetPlayerId: targets[0].id,
              });
              acted = true;
              break;
            }
          } else if (
            state.pendingAction.type === 'wild_four_challenge' &&
            state.pendingAction.challengerId === pid
          ) {
            await sock.emitWithAck('game:action', {
              type: 'respond_wild_four',
              challenge: false,
            });
            acted = true;
            break;
          }
          continue;
        }

        if (state.currentPlayerId !== pid) continue;

        // Pre-call UNO cleanly when holding 2 cards with a legal play.
        const me = state.players.find((p) => p.id === pid);
        if (
          me &&
          !me.unoSafe &&
          state.myHand.length === 2 &&
          state.playableCardIds.length > 0
        ) {
          await sock.emitWithAck('game:action', { type: 'call_uno' });
        }

        if (state.playableCardIds.length > 0) {
          const cardId = state.playableCardIds[0];
          const card = state.myHand.find((c) => c.id === cardId)!;
          const face = getActiveFace(card, state.activeSide);
          await sock.emitWithAck('game:action', {
            type: 'play_card',
            cardId,
            ...(isWildKind(face.kind)
              ? { chosenColor: pickFallbackColor(state.myHand, state.activeSide) }
              : {}),
          });
          acted = true;
          break;
        }

        await sock.emitWithAck('game:action', { type: 'draw_card' });
        acted = true;
        break;
      }

      if (!acted) {
        await new Promise((r) => setTimeout(r, 15));
      } else {
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    throw new Error(`Match did not finish within ${maxSteps} steps`);
  } finally {
    for (const off of listeners) off();
  }
}

describe('@uno/server full multi-mode playtests', () => {
  let server: UnoServerInstance | null = null;
  const sockets: ClientSocket[] = [];

  async function startPlaytestServer(turnTimerScaleMs = 0) {
    server = createUnoServer({
      timing: {
        botActionDelayMs: 6,
        botCatchDelayMs: 12,
        lobbyDisconnectGraceMs: 30,
        inGameTakeoverGraceMs: 30,
        turnTimerScaleMs: turnTimerScaleMs || 1000,
        idleRoomTtlMs: 120_000,
      },
    });
    await new Promise<void>((resolve) => {
      server!.httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Expected TCP port');
    return `http://127.0.0.1:${addr.port}`;
  }

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.disconnect();
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('plays a complete 2-player Classic match to match_over and supports Rematch', async () => {
    const baseUrl = await startPlaytestServer();
    const p1 = await connectClient(baseUrl);
    const p2 = await connectClient(baseUrl);
    sockets.push(p1, p2);

    const created = await p1.emitWithAck('room:create', {
      playerName: 'Alice',
      mode: 'classic',
      configOverrides: { startingHandSize: 5, winTargetScore: 0, turnTimerSeconds: 0 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await p2.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'Bob',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const states = new Map<string, ClientGameState>();
    const p1Init = new Promise<void>((res) =>
      p1.once('game:state', (s) => {
        states.set(created.playerId, s);
        res();
      })
    );
    const p2Init = new Promise<void>((res) =>
      p2.once('game:state', (s) => {
        states.set(joined.playerId, s);
        res();
      })
    );

    expect((await p1.emitWithAck('room:start_match')).ok).toBe(true);
    await Promise.all([p1Init, p2Init]);

    const finalState = await playHumansToFinish(
      [
        { socket: p1, playerId: created.playerId },
        { socket: p2, playerId: joined.playerId },
      ],
      states
    );
    expect(finalState.phase).toBe('match_over');
    expect(finalState.matchWinnerId).toBeTruthy();

    // Host triggers rematch cleanly.
    const rematchStatePromise = new Promise<ClientGameState>((res) =>
      p1.once('game:state', (s) => res(s))
    );
    expect((await p1.emitWithAck('room:rematch')).ok).toBe(true);
    const rematchState = await rematchStatePromise;
    expect(rematchState.phase).toBe('playing');
    expect(rematchState.roundNumber).toBe(1);
    expect(rematchState.players.every((p) => p.score === 0)).toBe(true);
  }, 15_000);

  it('completes a full 6-player No Mercy match (2 humans + 4 AI bots)', async () => {
    const baseUrl = await startPlaytestServer();
    const p1 = await connectClient(baseUrl);
    const p2 = await connectClient(baseUrl);
    sockets.push(p1, p2);

    const created = await p1.emitWithAck('room:create', {
      playerName: 'MercyHost',
      mode: 'no-mercy',
      configOverrides: { maxPlayers: 6, startingHandSize: 5, winTargetScore: 0, turnTimerSeconds: 0 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await p2.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'MercyGuest',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    for (let i = 0; i < 4; i += 1) {
      expect((await p1.emitWithAck('room:add_bot', {})).ok).toBe(true);
    }

    const states = new Map<string, ClientGameState>();
    const p1Init = new Promise<void>((res) =>
      p1.once('game:state', (s) => {
        states.set(created.playerId, s);
        res();
      })
    );
    const p2Init = new Promise<void>((res) =>
      p2.once('game:state', (s) => {
        states.set(joined.playerId, s);
        res();
      })
    );

    expect((await p1.emitWithAck('room:start_match')).ok).toBe(true);
    await Promise.all([p1Init, p2Init]);
    expect(states.get(created.playerId)?.players).toHaveLength(6);

    const finalState = await playHumansToFinish(
      [
        { socket: p1, playerId: created.playerId },
        { socket: p2, playerId: joined.playerId },
      ],
      states,
      undefined,
      600
    );
    expect(finalState.phase).toBe('match_over');
    expect(finalState.matchWinnerId).toBeTruthy();
  }, 15_000);

  it('plays UNO Flip! match cleanly across Light and Dark sides', async () => {
    const baseUrl = await startPlaytestServer();
    const p1 = await connectClient(baseUrl);
    sockets.push(p1);

    const created = await p1.emitWithAck('room:create', {
      playerName: 'FlipHost',
      mode: 'flip',
      configOverrides: { maxPlayers: 4, startingHandSize: 5, winTargetScore: 0, turnTimerSeconds: 0 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    for (let i = 0; i < 3; i += 1) {
      expect((await p1.emitWithAck('room:add_bot', {})).ok).toBe(true);
    }

    const states = new Map<string, ClientGameState>();
    const seenSides = new Set<string>();
    const p1Init = new Promise<void>((res) =>
      p1.once('game:state', (s) => {
        states.set(created.playerId, s);
        seenSides.add(s.activeSide);
        res();
      })
    );

    expect((await p1.emitWithAck('room:start_match')).ok).toBe(true);
    await p1Init;

    const finalState = await playHumansToFinish(
      [{ socket: p1, playerId: created.playerId }],
      states,
      (_pid, st) => seenSides.add(st.activeSide),
      600
    );
    expect(finalState.phase).toBe('match_over');
    expect(seenSides.has('light')).toBe(true);
  }, 15_000);

  it('plays Blitz mode with AI bot takeover on disconnect and seamless token reconnect', async () => {
    const baseUrl = await startPlaytestServer();
    const p1 = await connectClient(baseUrl);
    const p2 = await connectClient(baseUrl);
    sockets.push(p1, p2);

    const created = await p1.emitWithAck('room:create', {
      playerName: 'BlitzOne',
      mode: 'blitz',
      configOverrides: { startingHandSize: 7, winTargetScore: 0, turnTimerSeconds: 0 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await p2.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'BlitzTwo',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    expect((await p1.emitWithAck('room:add_bot', {})).ok).toBe(true);

    const states = new Map<string, ClientGameState>();
    const p1Init = new Promise<ClientGameState>((res) =>
      p1.once('game:state', (s) => {
        states.set(created.playerId, s);
        res(s);
      })
    );
    const p2Init = new Promise<ClientGameState>((res) =>
      p2.once('game:state', (s) => {
        states.set(joined.playerId, s);
        res(s);
      })
    );

    expect((await p1.emitWithAck('room:start_match')).ok).toBe(true);
    const [initP1] = await Promise.all([p1Init, p2Init]);
    const initialTurns = initP1.turnCounter;

    // Keep p1's state map continuously synced across p2 disconnect & AI takeover.
    const keepP1Synced = (st: ClientGameState) => states.set(created.playerId, st);
    p1.on('game:state', keepP1Synced);

    // Disconnect p2 mid-match; AI autopilot steps in so turns keep advancing while p1 stays connected.
    const takeoverAnnounced = new Promise<void>((res) => {
      const listener = (m: { text: string; isSystem?: boolean }) => {
        if (m.isSystem && m.text.includes('autopilot')) {
          p1.off('chat:message', listener);
          res();
        }
      };
      p1.on('chat:message', listener);
    });
    p2.disconnect();
    await takeoverAnnounced;

    // Reconnect p2 with original sessionToken and reclaim live seat.
    const p2Reconnected = await connectClient(baseUrl);
    sockets.push(p2Reconnected);
    const restoredPromise = new Promise<ClientGameState>((res) =>
      p2Reconnected.once('game:state', (s) => res(s))
    );
    const reconnectAck = await p2Reconnected.emitWithAck('room:reconnect', {
      roomId: created.roomId,
      sessionToken: joined.sessionToken,
    });
    expect(reconnectAck.ok).toBe(true);
    const restored = await restoredPromise;
    p1.off('game:state', keepP1Synced);
    expect(restored.myPlayerId).toBe(joined.playerId);
    states.set(joined.playerId, restored);

    // Finish the Blitz match with both reconnected humans active.
    const finalState = await playHumansToFinish(
      [
        { socket: p1, playerId: created.playerId },
        { socket: p2Reconnected, playerId: joined.playerId },
      ],
      states,
      undefined,
      650
    );
    expect(finalState.phase).toBe('match_over');
    expect(finalState.turnCounter).toBeGreaterThanOrEqual(initialTurns);
  }, 15_000);
});
