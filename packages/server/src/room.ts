import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  applyGameAction,
  createMatchState,
  getDefaultRoomConfig,
  MAX_PLAYERS,
  MIN_PLAYERS,
  resolveRoomConfig,
  sanitizeStateForPlayer,
  startNextRound,
  toAuthoritativeAction,
  type AckResult,
  type ChatMessage,
  type ClientGameAction,
  type ClientToServerEvents,
  type EmojiReaction,
  type GameEvent,
  type GameState,
  type LobbyRoomState,
  type PublicRoomSummary,
  type RoomJoinSuccess,
  type ServerToClientEvents,
  type UpdateConfigPayload,
} from '@uno/shared';
import { BOT_NAMES, decideBotAction } from './bot.js';
import { isValidReactionEmoji, sanitizeAvatarId, sanitizeChatText, sanitizeDisplayName } from './security.js';

export type TypedIoServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface RoomTimingOptions {
  botActionDelayMs: number;
  botCatchDelayMs: number;
  lobbyDisconnectGraceMs: number;
  inGameTakeoverGraceMs: number;
  turnTimerScaleMs: number;
  idleRoomTtlMs: number;
}

export const DEFAULT_TIMING_OPTIONS: RoomTimingOptions = {
  botActionDelayMs: 850,
  botCatchDelayMs: 2500,
  lobbyDisconnectGraceMs: 25_000,
  inGameTakeoverGraceMs: 12_000,
  turnTimerScaleMs: 1000,
  idleRoomTtlMs: 30 * 60 * 1000,
};

interface InternalPlayer {
  id: string;
  name: string;
  avatarId: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  sessionToken: string;
  socketId: string | null;
  botTakeoverActive: boolean;
}

interface InternalSpectator {
  id: string;
  name: string;
  avatarId: string;
  connected: boolean;
  sessionToken: string;
  socketId: string | null;
}

function getActiveActorId(state: GameState): string | null {
  if (state.phase !== 'playing') return null;
  if (state.pendingAction) {
    return state.pendingAction.type === 'wild_four_challenge'
      ? state.pendingAction.challengerId
      : state.pendingAction.playerId;
  }
  return state.players[state.currentPlayerIndex]?.id ?? null;
}

/** Manages lifecycle, lobby setup, live game state, bots, timers, and reconnects for one UNO room. */
export class Room {
  readonly roomId: string;
  readonly createdAt: number = Date.now();
  lastActivityAt: number = Date.now();

  private config = getDefaultRoomConfig('classic');
  private players: InternalPlayer[] = [];
  private spectators: InternalSpectator[] = [];
  private gameState: GameState | null = null;
  private turnDeadlineAt: number | null = null;

  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private catchTimer: NodeJS.Timeout | null = null;
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private disposed = false;

  private readonly io: TypedIoServer;
  private readonly timing: RoomTimingOptions;
  private readonly onEmpty: (roomId: string) => void;
  private readonly onDetachSocket: (socketId: string) => void;

  constructor(
    roomId: string,
    io: TypedIoServer,
    timing: RoomTimingOptions,
    onEmpty: (roomId: string) => void,
    onDetachSocket: (socketId: string) => void
  ) {
    this.roomId = roomId;
    this.io = io;
    this.timing = timing;
    this.onEmpty = onEmpty;
    this.onDetachSocket = onDetachSocket;
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }

  private getHostPlayer(): InternalPlayer | undefined {
    return this.players.find((p) => p.isHost);
  }

  private hasConnectedHumans(): boolean {
    return (
      this.players.some((p) => !p.isBot && p.connected) ||
      this.spectators.some((s) => s.connected)
    );
  }

  /** True if room has no connected humans and no pending reconnect grace timers. */
  isAbandonedAndIdle(now = Date.now()): boolean {
    if (this.hasConnectedHumans()) return false;
    if (this.disconnectTimers.size > 0) return false;
    const hasHumansInRoom = this.players.some((p) => !p.isBot) || this.spectators.length > 0;
    if (!hasHumansInRoom) return true;
    return now - this.lastActivityAt >= this.timing.idleRoomTtlMs;
  }

  isExpiredIdle(now = Date.now()): boolean {
    return now - this.lastActivityAt >= this.timing.idleRoomTtlMs;
  }

  toLobbyState(): LobbyRoomState {
    const host = this.getHostPlayer();
    return {
      roomId: this.roomId,
      hostId: host?.id ?? '',
      status: this.gameState ? 'in_game' : 'lobby',
      config: {
        ...this.config,
        rules: { ...this.config.rules },
      },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatarId: p.avatarId,
        isBot: p.isBot,
        isHost: p.isHost,
        connected: p.connected,
        ready: p.ready,
      })),
      spectators: this.spectators.map((s) => ({
        id: s.id,
        name: s.name,
        avatarId: s.avatarId,
        connected: s.connected,
      })),
      turnDeadlineAt: this.turnDeadlineAt,
      createdAt: this.createdAt,
    };
  }

  toPublicSummary(): PublicRoomSummary {
    const host = this.getHostPlayer();
    return {
      roomId: this.roomId,
      hostName: host?.name ?? 'Host',
      mode: this.config.mode,
      playerCount: this.players.length,
      maxPlayers: this.config.maxPlayers,
      status: this.gameState ? 'in_game' : 'lobby',
    };
  }

  isPublicLobby(): boolean {
    return this.config.isPublic;
  }

  broadcastRoomState(): void {
    this.io.to(this.roomId).emit('room:state', this.toLobbyState());
  }

  broadcastGameState(events?: GameEvent[]): void {
    if (!this.gameState) return;
    if (events && events.length > 0) {
      this.io.to(this.roomId).emit('game:events', events);
    }

    for (const p of this.players) {
      if (!p.isBot && p.connected && p.socketId) {
        this.io.to(p.socketId).emit('game:state', sanitizeStateForPlayer(this.gameState, p.id));
      }
    }

    for (const s of this.spectators) {
      if (s.connected && s.socketId) {
        this.io.to(s.socketId).emit('game:state', sanitizeStateForPlayer(this.gameState, s.id));
      }
    }
  }

  private emitSystemChat(text: string): void {
    const msg: ChatMessage = {
      id: randomUUID(),
      senderId: 'system',
      senderName: 'Table',
      avatarId: 'owl',
      text,
      timestamp: Date.now(),
      isSystem: true,
    };
    this.io.to(this.roomId).emit('chat:message', msg);
  }

  private syncGameConnections(): void {
    if (!this.gameState) return;
    for (const seat of this.gameState.players) {
      const lobbyPlayer = this.players.find((p) => p.id === seat.id);
      if (lobbyPlayer) {
        seat.connected = lobbyPlayer.connected;
      }
    }
  }

  private migrateHostIfNeeded(): void {
    const currentHost = this.getHostPlayer();
    if (currentHost && !currentHost.isBot && currentHost.connected) {
      return;
    }

    const nextHuman = this.players.find((p) => !p.isBot && p.connected);
    if (!nextHuman) return;

    for (const p of this.players) {
      p.isHost = p.id === nextHuman.id;
    }
    nextHuman.ready = true;
    this.emitSystemChat(`${nextHuman.name} is now the room host.`);
  }

  private clearActionTimers(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.catchTimer) {
      clearTimeout(this.catchTimer);
      this.catchTimer = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearActionTimers();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  private scheduleNextTick(): void {
    this.clearActionTimers();
    if (this.disposed || !this.gameState || this.gameState.phase !== 'playing') {
      this.turnDeadlineAt = null;
      this.broadcastRoomState();
      return;
    }

    // Pause autonomous timers if nobody is connected to observe/play.
    if (!this.hasConnectedHumans()) {
      this.turnDeadlineAt = null;
      return;
    }

    const timerSec = this.gameState.config.turnTimerSeconds;
    if (timerSec > 0) {
      const timeoutMs = timerSec * this.timing.turnTimerScaleMs;
      this.turnDeadlineAt = Date.now() + timeoutMs;
      this.turnTimer = setTimeout(() => this.handleTurnTimeout(), timeoutMs);
    } else {
      this.turnDeadlineAt = null;
    }

    this.broadcastRoomState();

    // Schedule bot move when active actor is a bot or disconnected human under AI takeover.
    const actorId = getActiveActorId(this.gameState);
    if (actorId) {
      const actor = this.players.find((p) => p.id === actorId);
      if (actor && (actor.isBot || (!actor.connected && actor.botTakeoverActive))) {
        this.botTimer = setTimeout(
          () => this.runBotTurn(actor.id),
          this.timing.botActionDelayMs
        );
      }
    }

    // Schedule delayed bot catch if a player forgot to call UNO.
    const vulnerableId = this.gameState.unoVulnerablePlayerId;
    if (vulnerableId) {
      const catcherBot = this.players.find((p) => p.isBot && p.id !== vulnerableId);
      if (catcherBot) {
        this.catchTimer = setTimeout(
          () => this.runBotCatch(catcherBot.id, vulnerableId),
          this.timing.botCatchDelayMs
        );
      }
    }
  }

  private handleTurnTimeout(): void {
    if (this.disposed || !this.gameState || this.gameState.phase !== 'playing') return;
    const res = applyGameAction(this.gameState, { type: 'timeout_turn' });
    if (!res.ok) return;

    this.gameState = res.state;
    this.touch();
    this.broadcastGameState(res.events);
    this.scheduleNextTick();
  }

  private runBotTurn(botId: string): void {
    if (this.disposed || !this.gameState || this.gameState.phase !== 'playing') return;
    if (getActiveActorId(this.gameState) !== botId) return;

    const plan = decideBotAction(
      this.gameState,
      botId,
      this.gameState.config.botDifficulty
    );
    if (!plan) return;

    const combinedEvents: GameEvent[] = [];
    if (plan.preCallUno) {
      const unoRes = applyGameAction(this.gameState, { type: 'call_uno', playerId: botId });
      if (unoRes.ok) {
        this.gameState = unoRes.state;
        combinedEvents.push(...unoRes.events);
      }
    }

    const res = applyGameAction(this.gameState, plan.action);
    if (!res.ok) return;

    this.gameState = res.state;
    combinedEvents.push(...res.events);
    this.touch();
    this.broadcastGameState(combinedEvents);
    this.scheduleNextTick();
  }

  private runBotCatch(botId: string, targetPlayerId: string): void {
    if (this.disposed || !this.gameState || this.gameState.phase !== 'playing') return;
    if (this.gameState.unoVulnerablePlayerId !== targetPlayerId) return;

    const res = applyGameAction(this.gameState, {
      type: 'catch_uno',
      playerId: botId,
      targetPlayerId,
    });
    if (!res.ok) return;

    this.gameState = res.state;
    this.touch();
    this.broadcastGameState(res.events);
    this.scheduleNextTick();
  }

  private joinSocketToRoom(socketId: string): void {
    this.io.sockets.sockets.get(socketId)?.join(this.roomId);
  }

  /** Adds the creator as host in a newly created room. */
  initializeHost(
    playerName: string,
    avatarId: string,
    socketId: string,
    mode = this.config.mode,
    configOverrides?: UpdateConfigPayload['configOverrides']
  ): RoomJoinSuccess {
    this.config = resolveRoomConfig(mode, configOverrides);
    const playerId = randomUUID();
    const sessionToken = randomUUID();
    this.players.push({
      id: playerId,
      name: playerName,
      avatarId,
      isBot: false,
      isHost: true,
      connected: true,
      ready: true,
      sessionToken,
      socketId,
      botTakeoverActive: false,
    });
    this.joinSocketToRoom(socketId);
    this.touch();
    return { roomId: this.roomId, playerId, sessionToken, role: 'player' };
  }

  join(
    rawName: unknown,
    rawAvatarId: unknown,
    socketId: string,
    existingToken?: string
  ): AckResult<RoomJoinSuccess> {
    this.touch();

    if (existingToken) {
      const reconnected = this.reconnect(existingToken, socketId);
      if (reconnected.ok) return reconnected;
    }

    const nameRes = sanitizeDisplayName(rawName);
    if (!nameRes.ok) return { ok: false, error: nameRes.error, code: 'INVALID_NAME' };
    const avatarId = sanitizeAvatarId(rawAvatarId);

    if (!this.gameState && this.players.length < this.config.maxPlayers) {
      const isHost = !this.players.some((p) => !p.isBot);
      const playerId = randomUUID();
      const sessionToken = randomUUID();
      this.players.push({
        id: playerId,
        name: nameRes.value,
        avatarId,
        isBot: false,
        isHost,
        connected: true,
        ready: isHost,
        sessionToken,
        socketId,
        botTakeoverActive: false,
      });
      this.joinSocketToRoom(socketId);
      this.emitSystemChat(`${nameRes.value} joined the room.`);
      this.broadcastRoomState();
      return { ok: true, roomId: this.roomId, playerId, sessionToken, role: 'player' };
    }

    if (!this.config.allowSpectators) {
      return {
        ok: false,
        error: this.gameState ? 'Match is already in progress.' : 'Room is full.',
        code: 'ROOM_FULL',
      };
    }

    const spectatorId = randomUUID();
    const sessionToken = randomUUID();
    this.spectators.push({
      id: spectatorId,
      name: nameRes.value,
      avatarId,
      connected: true,
      sessionToken,
      socketId,
    });
    this.joinSocketToRoom(socketId);
    this.emitSystemChat(`${nameRes.value} joined as a spectator.`);
    this.broadcastRoomState();
    if (this.gameState) {
      this.io.to(socketId).emit('game:state', sanitizeStateForPlayer(this.gameState, spectatorId));
    }
    return { ok: true, roomId: this.roomId, playerId: spectatorId, sessionToken, role: 'spectator' };
  }

  reconnect(sessionToken: string, socketId: string): AckResult<RoomJoinSuccess> {
    this.touch();
    const player = this.players.find((p) => !p.isBot && p.sessionToken === sessionToken);
    if (player) {
      const pendingTimer = this.disconnectTimers.get(player.id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.disconnectTimers.delete(player.id);
      }

      if (player.socketId && player.socketId !== socketId) {
        this.onDetachSocket(player.socketId);
      }
      player.socketId = socketId;
      player.connected = true;
      player.botTakeoverActive = false;

      // Ensure at least one connected human holds host if the room had lost all hosts.
      if (!this.getHostPlayer()?.connected) {
        for (const p of this.players) p.isHost = p.id === player.id;
      }

      this.joinSocketToRoom(socketId);
      this.syncGameConnections();
      this.broadcastRoomState();
      if (this.gameState) {
        this.io.to(socketId).emit('game:state', sanitizeStateForPlayer(this.gameState, player.id));
        this.scheduleNextTick();
      }
      return { ok: true, roomId: this.roomId, playerId: player.id, sessionToken, role: 'player' };
    }

    const spectator = this.spectators.find((s) => s.sessionToken === sessionToken);
    if (spectator) {
      const pendingTimer = this.disconnectTimers.get(spectator.id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.disconnectTimers.delete(spectator.id);
      }
      if (spectator.socketId && spectator.socketId !== socketId) {
        this.onDetachSocket(spectator.socketId);
      }
      spectator.socketId = socketId;
      spectator.connected = true;
      this.joinSocketToRoom(socketId);
      this.broadcastRoomState();
      if (this.gameState) {
        this.io.to(socketId).emit('game:state', sanitizeStateForPlayer(this.gameState, spectator.id));
        this.scheduleNextTick();
      }
      return {
        ok: true,
        roomId: this.roomId,
        playerId: spectator.id,
        sessionToken,
        role: 'spectator',
      };
    }

    return { ok: false, error: 'Session token not found in this room.', code: 'INVALID_SESSION' };
  }

  handleDisconnect(entityId: string): void {
    this.touch();
    const player = this.players.find((p) => p.id === entityId && !p.isBot);
    if (player) {
      player.connected = false;
      player.socketId = null;
      this.syncGameConnections();
      this.broadcastRoomState();
      if (this.gameState) this.broadcastGameState();

      const existing = this.disconnectTimers.get(player.id);
      if (existing) clearTimeout(existing);

      const graceMs = this.gameState
        ? this.timing.inGameTakeoverGraceMs
        : this.timing.lobbyDisconnectGraceMs;

      const timer = setTimeout(() => {
        this.disconnectTimers.delete(player.id);
        if (this.disposed || player.connected) return;

        if (!this.gameState) {
          this.removeEntityCompletely(player.id, true);
        } else {
          player.botTakeoverActive = true;
          this.migrateHostIfNeeded();
          this.emitSystemChat(`${player.name} disconnected — AI autopilot stepped in.`);
          this.broadcastRoomState();
          this.scheduleNextTick();
        }
        this.checkEmptyCleanup();
      }, graceMs);

      this.disconnectTimers.set(player.id, timer);
      return;
    }

    const spectator = this.spectators.find((s) => s.id === entityId);
    if (spectator) {
      spectator.connected = false;
      spectator.socketId = null;
      this.broadcastRoomState();

      const existing = this.disconnectTimers.get(spectator.id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.disconnectTimers.delete(spectator.id);
        if (this.disposed || spectator.connected) return;
        this.spectators = this.spectators.filter((s) => s.id !== spectator.id);
        this.broadcastRoomState();
        this.checkEmptyCleanup();
      }, this.timing.lobbyDisconnectGraceMs);

      this.disconnectTimers.set(spectator.id, timer);
    }
  }

  leave(entityId: string): void {
    this.touch();
    const pendingTimer = this.disconnectTimers.get(entityId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.disconnectTimers.delete(entityId);
    }

    const player = this.players.find((p) => p.id === entityId);
    if (player) {
      if (!this.gameState) {
        this.removeEntityCompletely(entityId, false);
      } else {
        player.connected = false;
        player.socketId = null;
        player.sessionToken = randomUUID(); // Revoke old reconnect token on explicit leave.
        player.botTakeoverActive = true;
        this.migrateHostIfNeeded();
        this.syncGameConnections();
        this.emitSystemChat(`${player.name} left the table — AI autopilot took their seat.`);
        this.broadcastRoomState();
        this.broadcastGameState();
        this.scheduleNextTick();
      }
      this.checkEmptyCleanup();
      return;
    }

    this.spectators = this.spectators.filter((s) => s.id !== entityId);
    this.broadcastRoomState();
    this.checkEmptyCleanup();
  }

  private removeEntityCompletely(entityId: string, timedOut: boolean): void {
    const leaving = this.players.find((p) => p.id === entityId);
    this.players = this.players.filter((p) => p.id !== entityId);
    if (leaving) {
      this.emitSystemChat(`${leaving.name} ${timedOut ? 'timed out' : 'left the lobby'}.`);
    }
    this.migrateHostIfNeeded();
    this.broadcastRoomState();
  }

  private checkEmptyCleanup(): void {
    if (this.isAbandonedAndIdle()) {
      this.onEmpty(this.roomId);
    }
  }

  private requireHost(actorId: string): AckResult | null {
    const host = this.getHostPlayer();
    if (!host || host.id !== actorId) {
      return { ok: false, error: 'Only the room host can perform this action.', code: 'FORBIDDEN' };
    }
    return null;
  }

  updateConfig(actorId: string, payload: UpdateConfigPayload): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;
    if (this.gameState) {
      return { ok: false, error: 'Cannot change room rules during an active match.', code: 'IN_GAME' };
    }

    const nextMode = payload.mode ?? this.config.mode;
    const isModeSwitch = payload.mode !== undefined && payload.mode !== this.config.mode;

    const mergedOverrides = isModeSwitch
      ? {
          maxPlayers: this.config.maxPlayers,
          isPublic: this.config.isPublic,
          allowSpectators: this.config.allowSpectators,
          botDifficulty: this.config.botDifficulty,
          ...payload.configOverrides,
        }
      : {
          ...this.config,
          ...payload.configOverrides,
          rules: {
            ...this.config.rules,
            ...payload.configOverrides?.rules,
          },
        };

    const nextConfig = resolveRoomConfig(nextMode, mergedOverrides);
    if (nextConfig.maxPlayers < this.players.length) {
      return {
        ok: false,
        error: `Max players cannot be lower than current player count (${this.players.length}).`,
        code: 'INVALID_CONFIG',
      };
    }

    this.config = nextConfig;
    this.touch();
    this.broadcastRoomState();
    return { ok: true };
  }

  addBot(actorId: string, rawName?: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;
    if (this.gameState) {
      return { ok: false, error: 'Cannot add bots during an active match.', code: 'IN_GAME' };
    }
    if (this.players.length >= this.config.maxPlayers) {
      return { ok: false, error: 'Room is already at max player capacity.', code: 'ROOM_FULL' };
    }

    const usedNames = new Set(this.players.map((p) => p.name));
    const customNameRes = rawName ? sanitizeDisplayName(rawName) : null;
    let botName = customNameRes?.ok ? customNameRes.value : '';
    if (!botName) {
      botName =
        BOT_NAMES.find((n) => !usedNames.has(n)) ??
        `Bot ${this.players.filter((p) => p.isBot).length + 1}`;
    }

    this.players.push({
      id: `bot_${randomUUID().slice(0, 8)}`,
      name: botName,
      avatarId: sanitizeAvatarId(undefined),
      isBot: true,
      isHost: false,
      connected: true,
      ready: true,
      sessionToken: '',
      socketId: null,
      botTakeoverActive: true,
    });
    this.touch();
    this.broadcastRoomState();
    return { ok: true };
  }

  removePlayer(actorId: string, targetPlayerId: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;
    if (actorId === targetPlayerId) {
      return { ok: false, error: 'Use Leave Room instead of kicking yourself.', code: 'INVALID_TARGET' };
    }

    const target = this.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      return { ok: false, error: 'Player not found in room.', code: 'INVALID_TARGET' };
    }

    const pendingTimer = this.disconnectTimers.get(target.id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.disconnectTimers.delete(target.id);
    }

    if (target.socketId) {
      const sock = this.io.sockets.sockets.get(target.socketId);
      if (sock) {
        sock.emit('room:kicked', { reason: 'Removed by room host.' });
        sock.leave(this.roomId);
      }
      this.onDetachSocket(target.socketId);
    }

    if (!this.gameState) {
      this.players = this.players.filter((p) => p.id !== targetPlayerId);
      this.emitSystemChat(`${target.name} was removed from the lobby.`);
    } else {
      target.connected = false;
      target.socketId = null;
      target.sessionToken = randomUUID();
      target.botTakeoverActive = true;
      this.syncGameConnections();
      this.emitSystemChat(`${target.name} was removed — AI autopilot took over.`);
      this.scheduleNextTick();
    }

    this.touch();
    this.broadcastRoomState();
    return { ok: true };
  }

  transferHost(actorId: string, targetPlayerId: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;

    const target = this.players.find((p) => p.id === targetPlayerId && !p.isBot && p.connected);
    if (!target) {
      return { ok: false, error: 'Target must be a connected human player.', code: 'INVALID_TARGET' };
    }

    for (const p of this.players) {
      p.isHost = p.id === targetPlayerId;
    }
    target.ready = true;
    this.touch();
    this.emitSystemChat(`${target.name} is now the room host.`);
    this.broadcastRoomState();
    return { ok: true };
  }

  toggleReady(actorId: string): AckResult {
    if (this.gameState) {
      return { ok: false, error: 'Already in game.', code: 'IN_GAME' };
    }
    const player = this.players.find((p) => p.id === actorId && !p.isBot);
    if (!player) return { ok: false, error: 'Player not found.', code: 'INVALID_PLAYER' };
    player.ready = !player.ready;
    this.touch();
    this.broadcastRoomState();
    return { ok: true };
  }

  startMatch(actorId: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;
    if (this.gameState) {
      return { ok: false, error: 'Match already started.', code: 'IN_GAME' };
    }
    if (this.players.length < MIN_PLAYERS) {
      return {
        ok: false,
        error: `Need at least ${MIN_PLAYERS} players (or add a bot) to start.`,
        code: 'NOT_ENOUGH_PLAYERS',
      };
    }
    if (this.players.length > MAX_PLAYERS) {
      return { ok: false, error: `Maximum ${MAX_PLAYERS} players allowed.`, code: 'TOO_MANY_PLAYERS' };
    }

    this.gameState = createMatchState(
      this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatarId: p.avatarId,
        isBot: p.isBot,
      })),
      this.config
    );
    this.syncGameConnections();
    this.touch();

    const startEvents: GameEvent[] = [
      {
        type: 'round_started',
        roundNumber: 1,
        activeColor: this.gameState.activeColor,
      },
    ];
    this.broadcastRoomState();
    this.broadcastGameState(startEvents);
    this.scheduleNextTick();
    return { ok: true };
  }

  nextRound(actorId: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;
    if (!this.gameState || this.gameState.phase !== 'round_over') {
      return { ok: false, error: 'No completed round waiting for next round.', code: 'INVALID_STATE' };
    }

    const res = startNextRound(this.gameState);
    if (!res.ok) return { ok: false, error: res.error, code: res.code };

    this.gameState = res.state;
    this.syncGameConnections();
    this.touch();
    this.broadcastGameState(res.events);
    this.scheduleNextTick();
    return { ok: true };
  }

  rematch(actorId: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;
    if (!this.gameState) {
      return { ok: false, error: 'No active or finished match to rematch.', code: 'INVALID_STATE' };
    }

    this.gameState = createMatchState(
      this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatarId: p.avatarId,
        isBot: p.isBot,
      })),
      this.config
    );
    this.syncGameConnections();
    this.touch();
    this.broadcastGameState([
      { type: 'round_started', roundNumber: 1, activeColor: this.gameState.activeColor },
    ]);
    this.scheduleNextTick();
    return { ok: true };
  }

  returnToLobby(actorId: string): AckResult {
    const denied = this.requireHost(actorId);
    if (denied) return denied;

    this.clearActionTimers();
    this.gameState = null;
    this.turnDeadlineAt = null;

    // Remove disconnected non-human/abandoned human seats on return to lobby.
    this.players = this.players.filter((p) => p.isBot || p.connected);
    for (const p of this.players) {
      p.ready = p.isHost || p.isBot;
      p.botTakeoverActive = false;
    }

    // Promote connected spectators up to maxPlayers.
    const remainingSpectators: InternalSpectator[] = [];
    for (const s of this.spectators) {
      if (s.connected && this.players.length < this.config.maxPlayers) {
        this.players.push({
          id: s.id,
          name: s.name,
          avatarId: s.avatarId,
          isBot: false,
          isHost: false,
          connected: true,
          ready: false,
          sessionToken: s.sessionToken,
          socketId: s.socketId,
          botTakeoverActive: false,
        });
      } else if (s.connected) {
        remainingSpectators.push(s);
      }
    }
    this.spectators = remainingSpectators;
    this.migrateHostIfNeeded();

    this.touch();
    this.broadcastRoomState();
    return { ok: true };
  }

  applyPlayerAction(actorId: string, clientAction: ClientGameAction): AckResult {
    if (!this.gameState) {
      return { ok: false, error: 'Match has not started yet.', code: 'NOT_IN_GAME' };
    }
    const isPlayer = this.players.some((p) => p.id === actorId);
    if (!isPlayer) {
      return { ok: false, error: 'Spectators cannot perform game actions.', code: 'FORBIDDEN' };
    }

    const authAction = toAuthoritativeAction(clientAction, actorId);
    const res = applyGameAction(this.gameState, authAction);
    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code };
    }

    this.gameState = res.state;
    this.touch();
    this.broadcastGameState(res.events);
    this.scheduleNextTick();
    return { ok: true };
  }

  sendChat(actorId: string, rawText: unknown): AckResult {
    const sender =
      this.players.find((p) => p.id === actorId) ?? this.spectators.find((s) => s.id === actorId);
    if (!sender) return { ok: false, error: 'Sender not in room.', code: 'FORBIDDEN' };

    const textRes = sanitizeChatText(rawText);
    if (!textRes.ok) return { ok: false, error: textRes.error, code: 'INVALID_CHAT' };

    this.touch();
    this.io.to(this.roomId).emit('chat:message', {
      id: randomUUID(),
      senderId: sender.id,
      senderName: sender.name,
      avatarId: sender.avatarId,
      text: textRes.value,
      timestamp: Date.now(),
    });
    return { ok: true };
  }

  sendReaction(actorId: string, rawEmoji: unknown): AckResult {
    const sender =
      this.players.find((p) => p.id === actorId) ?? this.spectators.find((s) => s.id === actorId);
    if (!sender) return { ok: false, error: 'Sender not in room.', code: 'FORBIDDEN' };
    if (!isValidReactionEmoji(rawEmoji)) {
      return { ok: false, error: 'Unsupported reaction emoji.', code: 'INVALID_REACTION' };
    }

    this.touch();
    const reaction: EmojiReaction = {
      id: randomUUID(),
      senderId: sender.id,
      emoji: rawEmoji,
      timestamp: Date.now(),
    };
    this.io.to(this.roomId).emit('reaction:burst', reaction);
    return { ok: true };
  }
}
