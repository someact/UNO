import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  AVATAR_IDS,
  type AckResult,
  type ChatMessage,
  type ClientGameAction,
  type ClientGameState,
  type ClientToServerEvents,
  type CreateRoomPayload,
  type EmojiReaction,
  type GameEvent,
  type JoinRoomPayload,
  type LobbyRoomState,
  type PublicRoomSummary,
  type RoomJoinSuccess,
  type ServerToClientEvents,
  type UpdateConfigPayload,
} from '@uno/shared';
import { soundEngine } from '../sound/soundEngine.js';

const STORAGE_NAME = 'multi_uno_name';
const STORAGE_AVATAR = 'multi_uno_avatar';
const STORAGE_SESSION = 'multi_uno_session';

export interface StoredSession {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

export interface ActionBanner {
  id: string;
  text: string;
  tone: 'info' | 'warn' | 'uno' | 'flip';
}

function readLocalString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocalString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore private mode / quota errors.
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed.roomId && parsed.playerId && parsed.sessionToken) {
      return parsed as StoredSession;
    }
  } catch {
    // Ignore malformed JSON.
  }
  return null;
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_SESSION);
    } else {
      localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
    }
  } catch {
    // Ignore private mode / quota errors.
  }
}

export function getRoomCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const code = new URLSearchParams(window.location.search).get('room') ?? '';
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function setRoomCodeInUrl(roomId: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set('room', roomId);
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

function summarizeEventsForBanner(events: readonly GameEvent[]): ActionBanner | null {
  for (const ev of events) {
    if (ev.type === 'table_flipped') {
      return {
        id: `${Date.now()}_flip`,
        text: ev.activeSide === 'dark' ? 'FLIPPED TO DARK SIDE!' : 'FLIPPED TO LIGHT SIDE!',
        tone: 'flip',
      };
    }
    if (ev.type === 'uno_called') {
      return { id: `${Date.now()}_uno`, text: 'UNO!', tone: 'uno' };
    }
    if (ev.type === 'uno_caught') {
      return { id: `${Date.now()}_catch`, text: `CAUGHT! +${ev.penalty} CARDS`, tone: 'warn' };
    }
    if (ev.type === 'player_eliminated') {
      return { id: `${Date.now()}_mercy`, text: 'MERCY ELIMINATION (25+ CARDS)!', tone: 'warn' };
    }
    if (ev.type === 'wild_four_challenged') {
      return {
        id: `${Date.now()}_w4`,
        text: ev.guilty ? 'BLUFF CAUGHT! +4 TO OFFENDER' : 'CHALLENGE FAILED! +6 PENALTY',
        tone: 'warn',
      };
    }
    if (ev.type === 'hands_rotated') {
      return { id: `${Date.now()}_rot`, text: '0 PLAYED — HANDS ROTATED!', tone: 'info' };
    }
    if (ev.type === 'hands_swapped') {
      return { id: `${Date.now()}_swap`, text: '7 PLAYED — HANDS SWAPPED!', tone: 'info' };
    }
    if (ev.type === 'card_played' && ev.isJumpIn) {
      return { id: `${Date.now()}_jump`, text: 'LIGHTNING JUMP-IN!', tone: 'flip' };
    }
  }
  return null;
}

type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Manages live Socket.IO connection, session reconnection, room/game state, chat, and reactions. */
export function useUnoClient() {
  const socketRef = useRef<TypedClientSocket | null>(null);
  const myPlayerIdRef = useRef<string>('');
  const prevTurnPlayerRef = useRef<string>('');
  const bannerTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [myName, setMyNameState] = useState(() => readLocalString(STORAGE_NAME, ''));
  const [myAvatarId, setMyAvatarIdState] = useState(() => {
    const saved = readLocalString(STORAGE_AVATAR, '');
    return (AVATAR_IDS as readonly string[]).includes(saved) ? saved : AVATAR_IDS[0];
  });

  const [roomState, setRoomState] = useState<LobbyRoomState | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactionsByPlayer, setReactionsByPlayer] = useState<Record<string, EmojiReaction>>({});
  const [actionBanner, setActionBanner] = useState<ActionBanner | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const showError = useCallback((message: string) => {
    soundEngine.playErrorThud();
    setErrorToast(message);
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setErrorToast(null), 3600);
  }, []);

  const showBanner = useCallback((banner: ActionBanner) => {
    setActionBanner(banner);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setActionBanner(null), 2200);
  }, []);

  const setMyName = useCallback((name: string) => {
    setMyNameState(name);
    writeLocalString(STORAGE_NAME, name);
  }, []);

  const setMyAvatarId = useCallback((avatarId: string) => {
    setMyAvatarIdState(avatarId);
    writeLocalString(STORAGE_AVATAR, avatarId);
  }, []);

  const clearRoomSession = useCallback(() => {
    myPlayerIdRef.current = '';
    prevTurnPlayerRef.current = '';
    setMyPlayerId('');
    setRoomState(null);
    setGameState(null);
    setChatMessages([]);
    writeStoredSession(null);
    setRoomCodeInUrl(null);
  }, []);

  useEffect(() => {
    const socket: TypedClientSocket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const saved = readStoredSession();
      const urlRoom = getRoomCodeFromUrl();
      // Auto-restore session when URL matches or no different room link was opened.
      if (saved && (!urlRoom || urlRoom === saved.roomId)) {
        setReconnecting(true);
        socket.emit(
          'room:reconnect',
          { roomId: saved.roomId, sessionToken: saved.sessionToken },
          (res) => {
            setReconnecting(false);
            if (res.ok) {
              myPlayerIdRef.current = res.playerId;
              setMyPlayerId(res.playerId);
              setRoomCodeInUrl(res.roomId);
            } else {
              writeStoredSession(null);
            }
          }
        );
      } else {
        socket.emit('room:list_public', (list) => setPublicRooms(list));
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('room:state', (nextRoom) => {
      setRoomState(nextRoom);
      if (nextRoom.status === 'lobby') {
        setGameState(null);
        prevTurnPlayerRef.current = '';
      }
    });

    socket.on('game:state', (nextGame) => {
      setGameState(nextGame);
      if (
        nextGame.phase === 'playing' &&
        nextGame.currentPlayerId === myPlayerIdRef.current &&
        prevTurnPlayerRef.current !== myPlayerIdRef.current
      ) {
        soundEngine.playTurnChime();
      }
      prevTurnPlayerRef.current = nextGame.currentPlayerId;
    });

    socket.on('game:events', (events) => {
      soundEngine.playEvents(events);
      const banner = summarizeEventsForBanner(events);
      if (banner) showBanner(banner);
    });

    socket.on('chat:message', (msg) => {
      setChatMessages((prev) => [...prev.slice(-79), msg]);
    });

    socket.on('reaction:burst', (reaction) => {
      setReactionsByPlayer((prev) => ({ ...prev, [reaction.senderId]: reaction }));
      window.setTimeout(() => {
        setReactionsByPlayer((prev) => {
          if (prev[reaction.senderId]?.id !== reaction.id) return prev;
          const copy = { ...prev };
          delete copy[reaction.senderId];
          return copy;
        });
      }, 2400);
    });

    socket.on('room:kicked', ({ reason }) => {
      clearRoomSession();
      showError(reason || 'You were removed from the room.');
    });

    socket.on('room:closed', ({ reason }) => {
      clearRoomSession();
      showError(reason || 'Room closed.');
    });

    return () => {
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [clearRoomSession, showBanner, showError]);

  const applyJoinSuccess = useCallback((res: RoomJoinSuccess) => {
    myPlayerIdRef.current = res.playerId;
    setMyPlayerId(res.playerId);
    writeStoredSession({
      roomId: res.roomId,
      playerId: res.playerId,
      sessionToken: res.sessionToken,
    });
    setRoomCodeInUrl(res.roomId);
  }, []);

  const createRoom = useCallback(
    (payload: Omit<CreateRoomPayload, 'playerName' | 'avatarId'> & { playerName?: string }) =>
      new Promise<AckResult<RoomJoinSuccess>>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'Not connected to server.' });
          return;
        }
        const nameToUse = (payload.playerName ?? myName).trim();
        setMyName(nameToUse);
        socket.emit(
          'room:create',
          { ...payload, playerName: nameToUse, avatarId: myAvatarId },
          (res) => {
            if (res.ok) applyJoinSuccess(res);
            else showError(res.error);
            resolve(res);
          }
        );
      }),
    [applyJoinSuccess, myAvatarId, myName, setMyName, showError]
  );

  const joinRoom = useCallback(
    (payload: Omit<JoinRoomPayload, 'playerName' | 'avatarId'> & { playerName?: string }) =>
      new Promise<AckResult<RoomJoinSuccess>>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'Not connected to server.' });
          return;
        }
        const nameToUse = (payload.playerName ?? myName).trim();
        setMyName(nameToUse);
        const saved = readStoredSession();
        const matchingToken =
          saved && saved.roomId === payload.roomId.toUpperCase() ? saved.sessionToken : undefined;
        socket.emit(
          'room:join',
          {
            roomId: payload.roomId,
            playerName: nameToUse,
            avatarId: myAvatarId,
            sessionToken: payload.sessionToken ?? matchingToken,
          },
          (res) => {
            if (res.ok) applyJoinSuccess(res);
            else showError(res.error);
            resolve(res);
          }
        );
      }),
    [applyJoinSuccess, myAvatarId, myName, setMyName, showError]
  );

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave', () => {});
    clearRoomSession();
    socketRef.current?.emit('room:list_public', (list) => setPublicRooms(list));
  }, [clearRoomSession]);

  const refreshPublicRooms = useCallback(() => {
    socketRef.current?.emit('room:list_public', (list) => setPublicRooms(list));
  }, []);

  const emitRoomAck = useCallback(
    (emitFn: (socket: TypedClientSocket, cb: (res: AckResult) => void) => void) =>
      new Promise<AckResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: 'Disconnected from server.' });
          return;
        }
        emitFn(socket, (res) => {
          if (!res.ok) showError(res.error);
          resolve(res);
        });
      }),
    [showError]
  );

  const updateConfig = useCallback(
    (payload: UpdateConfigPayload) =>
      emitRoomAck((s, cb) => s.emit('room:update_config', payload, cb)),
    [emitRoomAck]
  );

  const addBot = useCallback(
    (name?: string) => emitRoomAck((s, cb) => s.emit('room:add_bot', { name }, cb)),
    [emitRoomAck]
  );

  const removePlayer = useCallback(
    (targetPlayerId: string) =>
      emitRoomAck((s, cb) => s.emit('room:remove_player', { targetPlayerId }, cb)),
    [emitRoomAck]
  );

  const transferHost = useCallback(
    (targetPlayerId: string) =>
      emitRoomAck((s, cb) => s.emit('room:transfer_host', { targetPlayerId }, cb)),
    [emitRoomAck]
  );

  const toggleReady = useCallback(
    () => emitRoomAck((s, cb) => s.emit('room:toggle_ready', cb)),
    [emitRoomAck]
  );

  const startMatch = useCallback(
    () => emitRoomAck((s, cb) => s.emit('room:start_match', cb)),
    [emitRoomAck]
  );

  const nextRound = useCallback(
    () => emitRoomAck((s, cb) => s.emit('room:next_round', cb)),
    [emitRoomAck]
  );

  const rematch = useCallback(
    () => emitRoomAck((s, cb) => s.emit('room:rematch', cb)),
    [emitRoomAck]
  );

  const returnToLobby = useCallback(
    () => emitRoomAck((s, cb) => s.emit('room:return_to_lobby', cb)),
    [emitRoomAck]
  );

  const sendGameAction = useCallback(
    (action: ClientGameAction) => emitRoomAck((s, cb) => s.emit('game:action', action, cb)),
    [emitRoomAck]
  );

  const sendChat = useCallback(
    (text: string) => emitRoomAck((s, cb) => s.emit('chat:send', { text }, cb)),
    [emitRoomAck]
  );

  const sendReaction = useCallback(
    (emoji: string) => emitRoomAck((s, cb) => s.emit('reaction:send', { emoji }, cb)),
    [emitRoomAck]
  );

  return {
    connected,
    reconnecting,
    myPlayerId,
    myName,
    setMyName,
    myAvatarId,
    setMyAvatarId,
    roomState,
    gameState,
    publicRooms,
    chatMessages,
    reactionsByPlayer,
    actionBanner,
    errorToast,
    clearError: () => setErrorToast(null),
    createRoom,
    joinRoom,
    leaveRoom,
    refreshPublicRooms,
    updateConfig,
    addBot,
    removePlayer,
    transferHost,
    toggleReady,
    startMatch,
    nextRound,
    rematch,
    returnToLobby,
    sendGameAction,
    sendChat,
    sendReaction,
  };
}
