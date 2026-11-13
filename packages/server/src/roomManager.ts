import type {
  AckResult,
  CreateRoomPayload,
  JoinRoomPayload,
  PublicRoomSummary,
  ReconnectRoomPayload,
  RoomJoinSuccess,
} from '@uno/shared';
import {
  DEFAULT_TIMING_OPTIONS,
  Room,
  type RoomTimingOptions,
  type TypedIoServer,
} from './room.js';
import { normalizeRoomId, sanitizeAvatarId, sanitizeDisplayName } from './security.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;

export interface SocketMembership {
  roomId: string;
  entityId: string;
}

/** Manages all active UNO rooms, socket-to-room indexing, and idle TTL garbage collection. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketIndex = new Map<string, SocketMembership>();
  private readonly io: TypedIoServer;
  private readonly timing: RoomTimingOptions;
  private readonly gcInterval: NodeJS.Timeout;

  constructor(io: TypedIoServer, timingOverrides?: Partial<RoomTimingOptions>) {
    this.io = io;
    this.timing = { ...DEFAULT_TIMING_OPTIONS, ...timingOverrides };

    const gcPeriodMs = Math.max(5000, Math.min(60_000, Math.floor(this.timing.idleRoomTtlMs / 4)));
    this.gcInterval = setInterval(() => this.pruneIdleRooms(), gcPeriodMs);
    this.gcInterval.unref();
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(normalizeRoomId(roomId));
  }

  getMembership(socketId: string): SocketMembership | undefined {
    return this.socketIndex.get(socketId);
  }

  getPublicRooms(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPublicLobby()) {
        list.push(room.toPublicSummary());
      }
    }
    return list;
  }

  private generateUniqueRoomId(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  private detachSocket(socketId: string): void {
    const existing = this.socketIndex.get(socketId);
    if (!existing) return;
    this.socketIndex.delete(socketId);
    const sock = this.io.sockets.sockets.get(socketId);
    if (sock) {
      sock.leave(existing.roomId);
    }
  }

  private removeRoom(roomId: string, reason?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (reason) {
      this.io.to(roomId).emit('room:closed', { reason });
    }
    room.dispose();
    this.rooms.delete(roomId);
    for (const [sockId, member] of this.socketIndex.entries()) {
      if (member.roomId === roomId) {
        this.socketIndex.delete(sockId);
      }
    }
  }

  /** Creates a new room and binds the creator socket as host. */
  createRoom(socketId: string, payload: CreateRoomPayload): AckResult<RoomJoinSuccess> {
    const nameRes = sanitizeDisplayName(payload?.playerName);
    if (!nameRes.ok) return { ok: false, error: nameRes.error, code: 'INVALID_NAME' };
    const avatarId = sanitizeAvatarId(payload?.avatarId);

    this.leaveCurrentRoom(socketId);

    const roomId = this.generateUniqueRoomId();
    const room = new Room(
      roomId,
      this.io,
      this.timing,
      (emptyId) => this.removeRoom(emptyId),
      (staleSocketId) => this.detachSocket(staleSocketId)
    );

    const joinSuccess = room.initializeHost(
      nameRes.value,
      avatarId,
      socketId,
      payload.mode ?? 'classic',
      payload.configOverrides
    );

    this.rooms.set(roomId, room);
    this.socketIndex.set(socketId, { roomId, entityId: joinSuccess.playerId });

    const sock = this.io.sockets.sockets.get(socketId);
    if (sock) {
      sock.join(roomId);
      room.broadcastRoomState();
    }

    return { ok: true, ...joinSuccess };
  }

  /** Joins an existing room as player or spectator (or restores via sessionToken). */
  joinRoom(socketId: string, payload: JoinRoomPayload): AckResult<RoomJoinSuccess> {
    const roomId = normalizeRoomId(payload?.roomId);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, error: `Room "${roomId || '?'}" not found.`, code: 'ROOM_NOT_FOUND' };
    }

    const existing = this.socketIndex.get(socketId);
    if (existing && existing.roomId !== roomId) {
      this.leaveCurrentRoom(socketId);
    }

    const res = room.join(payload.playerName, payload.avatarId, socketId, payload.sessionToken);
    if (!res.ok) return res;

    this.socketIndex.set(socketId, { roomId, entityId: res.playerId });
    const sock = this.io.sockets.sockets.get(socketId);
    if (sock) {
      sock.join(roomId);
    }
    return res;
  }

  /** Reconnects a client to an existing seat/spectator slot using its sessionToken. */
  reconnectRoom(socketId: string, payload: ReconnectRoomPayload): AckResult<RoomJoinSuccess> {
    const roomId = normalizeRoomId(payload?.roomId);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, error: `Room "${roomId || '?'}" no longer exists.`, code: 'ROOM_NOT_FOUND' };
    }

    const res = room.reconnect(payload.sessionToken, socketId);
    if (!res.ok) return res;

    this.socketIndex.set(socketId, { roomId, entityId: res.playerId });
    const sock = this.io.sockets.sockets.get(socketId);
    if (sock) {
      sock.join(roomId);
    }
    return res;
  }

  leaveCurrentRoom(socketId: string): void {
    const membership = this.socketIndex.get(socketId);
    if (!membership) return;

    this.socketIndex.delete(socketId);
    const sock = this.io.sockets.sockets.get(socketId);
    if (sock) {
      sock.leave(membership.roomId);
    }

    const room = this.rooms.get(membership.roomId);
    if (room) {
      room.leave(membership.entityId);
    }
  }

  handleDisconnect(socketId: string): void {
    const membership = this.socketIndex.get(socketId);
    if (!membership) return;

    this.socketIndex.delete(socketId);
    const room = this.rooms.get(membership.roomId);
    if (room) {
      room.handleDisconnect(membership.entityId);
    }
  }

  pruneIdleRooms(now = Date.now()): number {
    let removed = 0;
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.isAbandonedAndIdle(now) || room.isExpiredIdle(now)) {
        this.removeRoom(roomId, 'Room closed due to inactivity.');
        removed += 1;
      }
    }
    return removed;
  }

  dispose(): void {
    clearInterval(this.gcInterval);
    for (const room of this.rooms.values()) {
      room.dispose();
    }
    this.rooms.clear();
    this.socketIndex.clear();
  }
}
