import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type {
  AckResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno/shared';
import type { Room, RoomTimingOptions, TypedIoServer } from './room.js';
import { RoomManager } from './roomManager.js';
import { SlidingWindowLimiter } from './security.js';

export interface UnoServerOptions {
  corsOrigin?: string | string[];
  clientDistDir?: string;
  timing?: Partial<RoomTimingOptions>;
}

export interface UnoServerInstance {
  app: Express;
  httpServer: HttpServer;
  io: TypedIoServer;
  roomManager: RoomManager;
  close: () => Promise<void>;
}

const DEFAULT_CLIENT_DIST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../client/dist'
);

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Creates and configures the Express + Socket.IO Multi-UNO server without binding a port yet. */
export function createUnoServer(options: UnoServerOptions = {}): UnoServerInstance {
  const app = express();
  const corsOrigin = options.corsOrigin ?? '*';

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  const httpServer = createServer(app);
  const io: TypedIoServer = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
      },
      pingTimeout: 20_000,
      pingInterval: 10_000,
    }
  );

  const roomManager = new RoomManager(io, options.timing);
  const limiter = new SlidingWindowLimiter();
  const startedAt = Date.now();

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      rooms: roomManager.getRoomCount(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  const clientDistDir = options.clientDistDir ?? DEFAULT_CLIENT_DIST;
  if (existsSync(join(clientDistDir, 'index.html'))) {
    app.use(express.static(clientDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/socket.io') || req.path === '/healthz') {
        next();
        return;
      }
      res.sendFile(join(clientDistDir, 'index.html'));
    });
  }

  function withRoomMember(
    socket: TypedSocket,
    cb: ((res: AckResult) => void) | undefined,
    handler: (room: Room, entityId: string) => AckResult
  ): void {
    const member = roomManager.getMembership(socket.id);
    if (!member) {
      cb?.({ ok: false, error: 'You are not in an active room.', code: 'NOT_IN_ROOM' });
      return;
    }
    const room = roomManager.getRoom(member.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'Room no longer exists.', code: 'ROOM_NOT_FOUND' });
      return;
    }
    cb?.(handler(room, member.entityId));
  }

  io.on('connection', (socket) => {
    socket.on('room:create', (payload, cb) => {
      if (!limiter.allow(`${socket.id}:create`, 5, 10_000)) {
        cb?.({ ok: false, error: 'Too many room creation attempts. Wait a moment.', code: 'RATE_LIMITED' });
        return;
      }
      cb?.(roomManager.createRoom(socket.id, payload));
    });

    socket.on('room:join', (payload, cb) => {
      if (!limiter.allow(`${socket.id}:join`, 10, 10_000)) {
        cb?.({ ok: false, error: 'Too many join attempts. Wait a moment.', code: 'RATE_LIMITED' });
        return;
      }
      cb?.(roomManager.joinRoom(socket.id, payload));
    });

    socket.on('room:reconnect', (payload, cb) => {
      cb?.(roomManager.reconnectRoom(socket.id, payload));
    });

    socket.on('room:leave', (cb) => {
      roomManager.leaveCurrentRoom(socket.id);
      cb?.({ ok: true });
    });

    socket.on('room:list_public', (cb) => {
      cb?.(roomManager.getPublicRooms());
    });

    socket.on('room:update_config', (payload, cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.updateConfig(entityId, payload));
    });

    socket.on('room:add_bot', (payload, cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.addBot(entityId, payload?.name));
    });

    socket.on('room:remove_player', (payload, cb) => {
      withRoomMember(socket, cb, (room, entityId) =>
        room.removePlayer(entityId, payload.targetPlayerId)
      );
    });

    socket.on('room:transfer_host', (payload, cb) => {
      withRoomMember(socket, cb, (room, entityId) =>
        room.transferHost(entityId, payload.targetPlayerId)
      );
    });

    socket.on('room:toggle_ready', (cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.toggleReady(entityId));
    });

    socket.on('room:start_match', (cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.startMatch(entityId));
    });

    socket.on('room:next_round', (cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.nextRound(entityId));
    });

    socket.on('room:rematch', (cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.rematch(entityId));
    });

    socket.on('room:return_to_lobby', (cb) => {
      withRoomMember(socket, cb, (room, entityId) => room.returnToLobby(entityId));
    });

    socket.on('game:action', (action, cb) => {
      if (!limiter.allow(`${socket.id}:action`, 15, 2000)) {
        cb?.({ ok: false, error: 'Actions sent too quickly.', code: 'RATE_LIMITED' });
        return;
      }
      withRoomMember(socket, cb, (room, entityId) => room.applyPlayerAction(entityId, action));
    });

    socket.on('chat:send', (payload, cb) => {
      if (!limiter.allow(`${socket.id}:chat`, 5, 5000)) {
        cb?.({ ok: false, error: 'Slow down chat messages.', code: 'RATE_LIMITED' });
        return;
      }
      withRoomMember(socket, cb, (room, entityId) => room.sendChat(entityId, payload?.text));
    });

    socket.on('reaction:send', (payload, cb) => {
      if (!limiter.allow(`${socket.id}:reaction`, 6, 4000)) {
        cb?.({ ok: false, error: 'Reaction cooldown active.', code: 'RATE_LIMITED' });
        return;
      }
      withRoomMember(socket, cb, (room, entityId) => room.sendReaction(entityId, payload?.emoji));
    });

    socket.on('disconnect', () => {
      limiter.clearPrefix(`${socket.id}:`);
      roomManager.handleDisconnect(socket.id);
    });
  });

  async function close(): Promise<void> {
    roomManager.dispose();
    await new Promise<void>((resolveClose) => {
      io.close(() => resolveClose());
    });
  }

  return { app, httpServer, io, roomManager, close };
}
