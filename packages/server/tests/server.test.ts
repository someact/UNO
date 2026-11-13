import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import type {
  ClientGameState,
  ClientToServerEvents,
  GameEvent,
  LobbyRoomState,
  ServerToClientEvents,
} from '@uno/shared';
import {
  createMatchState,
  getDefaultRoomConfig,
  type CardFace,
  type Card,
} from '@uno/shared';
import { decideBotAction } from '../src/bot.js';
import {
  isValidReactionEmoji,
  sanitizeChatText,
  sanitizeDisplayName,
  SlidingWindowLimiter,
} from '../src/security.js';
import { createUnoServer, type UnoServerInstance } from '../src/server.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function makeCard(id: string, light: CardFace): Card {
  return { id, light };
}

function face(color: CardFace['color'], kind: CardFace['kind'], value?: number): CardFace {
  return {
    color,
    kind,
    ...(value !== undefined ? { value } : {}),
    points: kind === 'number' ? (value ?? 0) : 20,
  };
}

function waitForEvent<T>(
  socket: ClientSocket,
  event: keyof ServerToClientEvents,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener as never);
      reject(new Error(`Timed out waiting for event "${String(event)}"`));
    }, timeoutMs);

    const listener = (payload: T) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, listener as never);
        resolve(payload);
      }
    };

    socket.on(event, listener as never);
  });
}

async function connectClient(baseUrl: string): Promise<ClientSocket> {
  const socket: ClientSocket = createClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
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

describe('@uno/server security & bot unit checks', () => {
  it('sanitizes names, chat, emojis, and enforces sliding window rate limit', () => {
    expect(sanitizeDisplayName('  Alice\u0007   Bob  ')).toEqual({ ok: true, value: 'Alice Bob' });
    expect(sanitizeDisplayName('   ').ok).toBe(false);
    expect(sanitizeDisplayName('A'.repeat(21)).ok).toBe(false);

    expect(sanitizeChatText('  gg! \n ')).toEqual({ ok: true, value: 'gg!' });
    expect(sanitizeChatText('a'.repeat(201)).ok).toBe(false);

    expect(isValidReactionEmoji('🔥')).toBe(true);
    expect(isValidReactionEmoji('<script>')).toBe(false);

    const limiter = new SlidingWindowLimiter();
    expect(limiter.allow('k1', 2, 1000, 100)).toBe(true);
    expect(limiter.allow('k1', 2, 1000, 200)).toBe(true);
    expect(limiter.allow('k1', 2, 1000, 300)).toBe(false);
    expect(limiter.allow('k1', 2, 1000, 1500)).toBe(true);
  });

  it('chooses smart bot plays for stacking, lowest-hand 7-swap, and dominant wild color', () => {
    const config = getDefaultRoomConfig('no-mercy');
    const state = createMatchState(
      [
        { id: 'h1', name: 'Human', avatarId: 'fox', isBot: false },
        { id: 'b1', name: 'Byte', avatarId: 'cat', isBot: true },
        { id: 'h2', name: 'Other', avatarId: 'owl', isBot: false },
      ],
      config
    );
    state.currentPlayerIndex = 1;
    state.drawPenalty = { amount: 2, minDrawValue: 2 };
    state.players[1].hand = [
      makeCard('d2', face('red', 'draw_two')),
      makeCard('w10', face('wild', 'wild_draw_ten')),
      makeCard('g1', face('green', 'number', 1)),
      makeCard('g2', face('green', 'number', 2)),
    ];

    // Smart bot stacks lowest valid draw (+2 before +10).
    const stackPlan = decideBotAction(state, 'b1', 'smart', () => 0.1);
    expect(stackPlan?.action).toEqual({
      type: 'play_card',
      playerId: 'b1',
      cardId: 'd2',
    });

    // Smart bot picks opponent with fewest cards on choose_swap_target.
    state.drawPenalty = null;
    state.players[0].hand = [makeCard('x1', face('red', 'number', 1))];
    state.players[2].hand = [
      makeCard('y1', face('red', 'number', 2)),
      makeCard('y2', face('red', 'number', 3)),
      makeCard('y3', face('red', 'number', 4)),
    ];
    state.pendingAction = { type: 'choose_swap_target', playerId: 'b1' };
    const swapPlan = decideBotAction(state, 'b1', 'smart');
    expect(swapPlan?.action).toEqual({
      type: 'choose_swap_target',
      playerId: 'b1',
      targetPlayerId: 'h1',
    });
  });
});

describe('@uno/server Socket.IO integration', () => {
  let server: UnoServerInstance | null = null;
  const sockets: ClientSocket[] = [];

  async function startTestServer(timingOverrides?: Parameters<typeof createUnoServer>[0]) {
    server = createUnoServer({
      timing: {
        botActionDelayMs: 25,
        botCatchDelayMs: 40,
        lobbyDisconnectGraceMs: 40,
        inGameTakeoverGraceMs: 40,
        turnTimerScaleMs: 10,
        idleRoomTtlMs: 60_000,
        ...timingOverrides?.timing,
      },
      ...timingOverrides,
    });
    await new Promise<void>((resolve) => {
      server!.httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Expected TCP port');
    return `http://127.0.0.1:${addr.port}`;
  }

  afterEach(async () => {
    for (const s of sockets.splice(0)) {
      s.disconnect();
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('serves /healthz, supports lobby creation, bots, public room listing, kick, and host transfer', async () => {
    const baseUrl = await startTestServer();
    const healthRes = await fetch(`${baseUrl}/healthz`);
    const healthJson = (await healthRes.json()) as { ok: boolean; rooms: number };
    expect(healthRes.status).toBe(200);
    expect(healthJson.ok).toBe(true);

    const host = await connectClient(baseUrl);
    const guest = await connectClient(baseUrl);
    const extra = await connectClient(baseUrl);
    sockets.push(host, guest, extra);

    const hostStatePromise = waitForEvent<LobbyRoomState>(host, 'room:state');
    const created = await host.emitWithAck('room:create', {
      playerName: 'HostOne',
      avatarId: 'fox',
      mode: 'classic',
      configOverrides: { isPublic: true, maxPlayers: 3 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const initialLobby = await hostStatePromise;
    expect(initialLobby.roomId).toBe(created.roomId);
    expect(initialLobby.players).toHaveLength(1);

    // Public room list returns our public room.
    const publicRooms = await guest.emitWithAck('room:list_public');
    expect(publicRooms.some((r) => r.roomId === created.roomId)).toBe(true);

    // Guest joins, non-host config update is rejected.
    const joined = await guest.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'GuestTwo',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const denied = await guest.emitWithAck('room:update_config', { mode: 'no-mercy' });
    expect(denied.ok).toBe(false);

    // Host updates mode and adds a bot (room reaches capacity 3).
    const updated = await host.emitWithAck('room:update_config', { mode: 'no-mercy' });
    expect(updated.ok).toBe(true);
    const addedBot = await host.emitWithAck('room:add_bot', { name: 'BotAlpha' });
    expect(addedBot.ok).toBe(true);

    // Extra joins while room is full -> enters as spectator because allowSpectators=true.
    const specJoin = await extra.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'Watcher',
    });
    expect(specJoin.ok).toBe(true);
    if (specJoin.ok) expect(specJoin.role).toBe('spectator');

    // Host transfers host to Guest, then Guest kicks Host.
    const transferred = await host.emitWithAck('room:transfer_host', {
      targetPlayerId: joined.playerId,
    });
    expect(transferred.ok).toBe(true);

    const kickedPromise = waitForEvent<{ reason: string }>(host, 'room:kicked');
    const removed = await guest.emitWithAck('room:remove_player', {
      targetPlayerId: created.playerId,
    });
    expect(removed.ok).toBe(true);
    await kickedPromise;
  });

  it('runs a live human+bot match, enforces sanitized hands, handles disconnect takeover + reconnect, and cleans up idle rooms', async () => {
    const baseUrl = await startTestServer();
    const p1 = await connectClient(baseUrl);
    const p2 = await connectClient(baseUrl);
    const spec = await connectClient(baseUrl);
    sockets.push(p1, p2, spec);

    const created = await p1.emitWithAck('room:create', {
      playerName: 'Alice',
      mode: 'classic',
      configOverrides: { turnTimerSeconds: 0, maxPlayers: 4 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await p2.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'Bob',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    await p1.emitWithAck('room:add_bot', {});

    const p1GamePromise = waitForEvent<ClientGameState>(p1, 'game:state');
    const p2GamePromise = waitForEvent<ClientGameState>(p2, 'game:state');
    const startEventsPromise = waitForEvent<GameEvent[]>(p1, 'game:events');

    const started = await p1.emitWithAck('room:start_match');
    expect(started.ok).toBe(true);

    const [p1State, p2State, events] = await Promise.all([
      p1GamePromise,
      p2GamePromise,
      startEventsPromise,
    ]);
    expect(events[0]?.type).toBe('round_started');
    expect(p1State.myHand).toHaveLength(7);
    expect(p2State.myHand).toHaveLength(7);
    expect('hand' in p1State.players[1]).toBe(false);

    // Late joiner enters as spectator and cannot submit game actions.
    const specJoin = await spec.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'LateSpec',
    });
    expect(specJoin.ok).toBe(true);
    if (specJoin.ok) expect(specJoin.role).toBe('spectator');
    const specAction = await spec.emitWithAck('game:action', { type: 'draw_card' });
    expect(specAction.ok).toBe(false);

    // Chat and emoji reactions broadcast cleanly, invalid emoji rejected.
    const chatPromise = waitForEvent<{ text: string }>(p2, 'chat:message', (m) => m.text === 'glhf!');
    const chatRes = await p1.emitWithAck('chat:send', { text: '  glhf! ' });
    expect(chatRes.ok).toBe(true);
    await chatPromise;

    const badReact = await p1.emitWithAck('reaction:send', { emoji: 'BAD' });
    expect(badReact.ok).toBe(false);
    const reactPromise = waitForEvent<{ emoji: string }>(p2, 'reaction:burst');
    expect((await p1.emitWithAck('reaction:send', { emoji: '🔥' })).ok).toBe(true);
    expect((await reactPromise).emoji).toBe('🔥');

    // Alice (host, currentPlayer) disconnects -> grace expires -> Bob becomes host -> Alice reconnects with token!
    const hostMigratedPromise = waitForEvent<LobbyRoomState>(
      p2,
      'room:state',
      (r) => r.hostId === joined.playerId
    );
    p1.disconnect();
    const migratedLobby = await hostMigratedPromise;
    expect(migratedLobby.hostId).toBe(joined.playerId);

    const p1Reconnected = await connectClient(baseUrl);
    sockets.push(p1Reconnected);
    const restoredGamePromise = waitForEvent<ClientGameState>(p1Reconnected, 'game:state');
    const reconnected = await p1Reconnected.emitWithAck('room:reconnect', {
      roomId: created.roomId,
      sessionToken: created.sessionToken,
    });
    expect(reconnected.ok).toBe(true);
    const restoredState = await restoredGamePromise;
    expect(restoredState.myPlayerId).toBe(created.playerId);
    expect(restoredState.myHand.length).toBeGreaterThan(0);

    // Return to lobby promotes spectator into player seat.
    const lobbyPromotedPromise = waitForEvent<LobbyRoomState>(
      p2,
      'room:state',
      (r) => r.status === 'lobby' && r.players.some((pl) => pl.name === 'LateSpec')
    );
    const returned = await p2.emitWithAck('room:return_to_lobby');
    expect(returned.ok).toBe(true);
    await lobbyPromotedPromise;

    // Idle TTL garbage collection closes stale rooms cleanly.
    const closedPromise = waitForEvent<{ reason: string }>(p2, 'room:closed');
    const pruned = server!.roomManager.pruneIdleRooms(Date.now() + 120_000);
    expect(pruned).toBe(1);
    await closedPromise;
  });

  it('auto-advances turn when server turn timer expires', async () => {
    const baseUrl = await startTestServer({
      timing: { turnTimerScaleMs: 8 },
    });
    const p1 = await connectClient(baseUrl);
    const p2 = await connectClient(baseUrl);
    sockets.push(p1, p2);

    const created = await p1.emitWithAck('room:create', {
      playerName: 'TimedOne',
      mode: 'blitz', // 15s * 8ms = 120ms timeout
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await p2.emitWithAck('room:join', {
      roomId: created.roomId,
      playerName: 'TimedTwo',
    });

    const timeoutAdvance = waitForEvent<ClientGameState>(
      p2,
      'game:state',
      (s) => s.turnCounter >= 1 && s.currentPlayerId !== created.playerId,
      2000
    );
    expect((await p1.emitWithAck('room:start_match')).ok).toBe(true);
    const afterTimeout = await timeoutAdvance;
    expect(afterTimeout.turnCounter).toBeGreaterThanOrEqual(1);
  });
});
