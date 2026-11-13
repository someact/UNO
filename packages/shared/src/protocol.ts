import type {
  ActiveColor,
  ClientGameState,
  GameAction,
  GameEvent,
  GameMode,
  HouseRules,
  RoomConfig,
} from './types.js';

export const AVATAR_IDS = [
  'fox',
  'cat',
  'panda',
  'owl',
  'frog',
  'koala',
  'tiger',
  'rabbit',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const REACTION_EMOJIS = ['🔥', '😂', '😱', '👏', '💀', '⚡', '🎉', '😤'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface LobbyPlayer {
  id: string;
  name: string;
  avatarId: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

export interface LobbySpectator {
  id: string;
  name: string;
  avatarId: string;
  connected: boolean;
}

export type RoomStatus = 'lobby' | 'in_game';

export interface LobbyRoomState {
  roomId: string;
  hostId: string;
  status: RoomStatus;
  config: RoomConfig;
  players: LobbyPlayer[];
  spectators: LobbySpectator[];
  turnDeadlineAt: number | null;
  createdAt: number;
}

export interface PublicRoomSummary {
  roomId: string;
  hostName: string;
  mode: GameMode;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  avatarId: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface EmojiReaction {
  id: string;
  senderId: string;
  emoji: string;
  timestamp: number;
}

/** Game actions sent by a client (server injects verified playerId). */
export type ClientGameAction =
  | {
      type: 'play_card';
      cardId: string;
      chosenColor?: ActiveColor;
      swapTargetId?: string;
    }
  | { type: 'draw_card' }
  | { type: 'keep_drawn' }
  | { type: 'choose_swap_target'; targetPlayerId: string }
  | { type: 'respond_wild_four'; challenge: boolean }
  | { type: 'call_uno' }
  | { type: 'catch_uno'; targetPlayerId: string };

export type ConfigOverrides = Partial<Omit<RoomConfig, 'mode' | 'rules'>> & {
  rules?: Partial<HouseRules>;
};

export interface CreateRoomPayload {
  playerName: string;
  avatarId?: string;
  mode?: GameMode;
  configOverrides?: ConfigOverrides;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
  avatarId?: string;
  sessionToken?: string;
}

export interface ReconnectRoomPayload {
  roomId: string;
  sessionToken: string;
}

export interface UpdateConfigPayload {
  mode?: GameMode;
  configOverrides?: ConfigOverrides;
}

export type AckResult<T = undefined> =
  | ([T] extends [undefined] ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string; code?: string };

export interface RoomJoinSuccess {
  roomId: string;
  playerId: string;
  sessionToken: string;
  role: 'player' | 'spectator';
}

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, cb: (res: AckResult<RoomJoinSuccess>) => void) => void;
  'room:join': (payload: JoinRoomPayload, cb: (res: AckResult<RoomJoinSuccess>) => void) => void;
  'room:reconnect': (
    payload: ReconnectRoomPayload,
    cb: (res: AckResult<RoomJoinSuccess>) => void
  ) => void;
  'room:leave': (cb?: (res: AckResult) => void) => void;
  'room:list_public': (cb: (rooms: PublicRoomSummary[]) => void) => void;
  'room:update_config': (payload: UpdateConfigPayload, cb?: (res: AckResult) => void) => void;
  'room:add_bot': (payload?: { name?: string }, cb?: (res: AckResult) => void) => void;
  'room:remove_player': (
    payload: { targetPlayerId: string },
    cb?: (res: AckResult) => void
  ) => void;
  'room:transfer_host': (
    payload: { targetPlayerId: string },
    cb?: (res: AckResult) => void
  ) => void;
  'room:toggle_ready': (cb?: (res: AckResult) => void) => void;
  'room:start_match': (cb?: (res: AckResult) => void) => void;
  'room:next_round': (cb?: (res: AckResult) => void) => void;
  'room:rematch': (cb?: (res: AckResult) => void) => void;
  'room:return_to_lobby': (cb?: (res: AckResult) => void) => void;
  'game:action': (action: ClientGameAction, cb?: (res: AckResult) => void) => void;
  'chat:send': (payload: { text: string }, cb?: (res: AckResult) => void) => void;
  'reaction:send': (payload: { emoji: string }, cb?: (res: AckResult) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: LobbyRoomState) => void;
  'game:state': (state: ClientGameState) => void;
  'game:events': (events: GameEvent[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'reaction:burst': (reaction: EmojiReaction) => void;
  'room:kicked': (payload: { reason: string }) => void;
  'room:closed': (payload: { reason: string }) => void;
}

/** Converts a client action plus verified playerId into an authoritative GameAction. */
export function toAuthoritativeAction(action: ClientGameAction, playerId: string): GameAction {
  switch (action.type) {
    case 'play_card':
      return { ...action, playerId };
    case 'draw_card':
      return { type: 'draw_card', playerId };
    case 'keep_drawn':
      return { type: 'keep_drawn', playerId };
    case 'choose_swap_target':
      return { type: 'choose_swap_target', playerId, targetPlayerId: action.targetPlayerId };
    case 'respond_wild_four':
      return { type: 'respond_wild_four', playerId, challenge: action.challenge };
    case 'call_uno':
      return { type: 'call_uno', playerId };
    case 'catch_uno':
      return { type: 'catch_uno', playerId, targetPlayerId: action.targetPlayerId };
  }
}
