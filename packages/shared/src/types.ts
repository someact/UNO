/** Supported game modes in Multi-UNO. */
export type GameMode = 'classic' | 'no-mercy' | 'flip' | 'blitz' | 'custom';

/** Active deck side (only switches in UNO Flip mode). */
export type TableSide = 'light' | 'dark';

/** Standard Light / Classic card colors. */
export type LightColor = 'red' | 'yellow' | 'green' | 'blue';

/** UNO Flip Dark-side card colors. */
export type DarkColor = 'pink' | 'teal' | 'orange' | 'purple';

/** Any non-wild playable color on the table. */
export type ActiveColor = LightColor | DarkColor;

/** Any card color including wild. */
export type CardColor = ActiveColor | 'wild';

/** All supported card kinds across Classic, No Mercy, Flip, and Blitz. */
export type CardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw_one'
  | 'draw_two'
  | 'draw_five'
  | 'skip_everyone'
  | 'flip'
  | 'discard_all'
  | 'wild'
  | 'wild_draw_two'
  | 'wild_draw_four'
  | 'wild_draw_six'
  | 'wild_draw_ten'
  | 'wild_draw_color';

/** Single playable face of a card. */
export interface CardFace {
  color: CardColor;
  kind: CardKind;
  /** Digit 0-9 when kind === 'number'. */
  value?: number;
  /** Scoring value when remaining in an opponent's hand at round end. */
  points: number;
}

/** Card entity. Dual-sided cards populate both `light` and `dark`. */
export interface Card {
  id: string;
  light: CardFace;
  dark?: CardFace;
}

/** Toggleable house rules governing gameplay behavior. */
export interface HouseRules {
  /** 'off' = no stacking, 'same-or-higher' = stack draw cards with equal or larger draw value. */
  stacking: 'off' | 'same-or-higher';
  /** 7 swaps hands with a chosen opponent; 0 rotates all active hands in turn direction. */
  sevenZero: boolean;
  /** Out-of-turn play when holding an identical color + kind/value card. */
  jumpIn: boolean;
  /** Keep drawing until drawing a playable card when choosing to draw. */
  drawUntilPlayable: boolean;
  /** After drawing 1 card, allow playing it immediately or keeping it. */
  playDrawnCard: boolean;
  /** Official Wild +4 bluff challenge by the next active player. */
  wildFourChallenge: boolean;
  /** Eliminate a player whose hand reaches >= mercyLimit (0 disables). */
  mercyLimit: number;
  /** Enable Discard All cards (used in No Mercy). */
  allowDiscardAll: boolean;
}

/** Room-level configuration set by the host. */
export interface RoomConfig {
  mode: GameMode;
  maxPlayers: number;
  turnTimerSeconds: 0 | 15 | 30 | 45;
  startingHandSize: 5 | 7 | 10;
  winTargetScore: 0 | 250 | 500;
  botDifficulty: 'casual' | 'smart';
  allowSpectators: boolean;
  isPublic: boolean;
  rules: HouseRules;
}

/** Input descriptor when initializing a match. */
export interface MatchPlayerInput {
  id: string;
  name: string;
  avatarId: string;
  isBot: boolean;
}

/** Full server-side seat representation (includes secret hand). */
export interface SeatPlayer extends MatchPlayerInput {
  hand: Card[];
  score: number;
  eliminated: boolean;
  connected: boolean;
  /** True when the player pre-called or confirmed UNO for their current 1-card state. */
  unoSafe: boolean;
}

/** Public spectator info for late joiners watching a round in progress. */
export interface Spectator {
  id: string;
  name: string;
  avatarId: string;
  connected: boolean;
}

/** Accumulated draw-card stack waiting on the current player. */
export interface DrawPenaltyState {
  amount: number;
  minDrawValue: number;
}

/** Mid-turn interactive decision that blocks normal turn progression. */
export type PendingAction =
  | {
      type: 'drawn_playable';
      playerId: string;
      cardId: string;
    }
  | {
      type: 'choose_swap_target';
      playerId: string;
    }
  | {
      type: 'wild_four_challenge';
      offenderId: string;
      challengerId: string;
      previousActiveColor: ActiveColor;
      offenderHadMatchingColor: boolean;
    };

/** Sanitized pending action exposed to clients (strips hidden truth flags). */
export type ClientPendingAction =
  | {
      type: 'drawn_playable';
      playerId: string;
      cardId: string;
    }
  | {
      type: 'choose_swap_target';
      playerId: string;
    }
  | {
      type: 'wild_four_challenge';
      offenderId: string;
      challengerId: string;
      previousActiveColor: ActiveColor;
    };

export type GamePhase = 'playing' | 'round_over' | 'match_over';

export type TurnDirection = 1 | -1;

/** Authoritative server-side game state for a match. */
export interface GameState {
  roundNumber: number;
  phase: GamePhase;
  config: RoomConfig;
  players: SeatPlayer[];
  currentPlayerIndex: number;
  direction: TurnDirection;
  activeSide: TableSide;
  activeColor: ActiveColor;
  drawPile: Card[];
  discardPile: Card[];
  drawPenalty: DrawPenaltyState | null;
  pendingAction: PendingAction | null;
  /** Player currently vulnerable to an opponent pressing CATCH! for +2 penalty. */
  unoVulnerablePlayerId: string | null;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  lastRoundPoints: number;
  turnCounter: number;
}

/** Public opponent summary sent to clients (never exposes opponent cards). */
export interface ClientSeatPlayer {
  id: string;
  name: string;
  avatarId: string;
  isBot: boolean;
  handCount: number;
  score: number;
  eliminated: boolean;
  connected: boolean;
  unoSafe: boolean;
}

/** Sanitized per-viewer game state safe to broadcast over sockets. */
export interface ClientGameState {
  roundNumber: number;
  phase: GamePhase;
  config: RoomConfig;
  players: ClientSeatPlayer[];
  myPlayerId: string;
  myHand: Card[];
  playableCardIds: string[];
  jumpInCardIds: string[];
  currentPlayerId: string;
  direction: TurnDirection;
  activeSide: TableSide;
  activeColor: ActiveColor;
  topCard: Card;
  drawPileCount: number;
  discardPileCount: number;
  drawPenalty: DrawPenaltyState | null;
  pendingAction: ClientPendingAction | null;
  unoVulnerablePlayerId: string | null;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  lastRoundPoints: number;
  turnCounter: number;
}

/** Supported sorting modes for a player's hand. */
export type SortMode = 'color' | 'playable';

/** Player or server-timeout actions accepted by the engine. */
export type GameAction =
  | {
      type: 'play_card';
      playerId: string;
      cardId: string;
      chosenColor?: ActiveColor;
      swapTargetId?: string;
    }
  | {
      type: 'draw_card';
      playerId: string;
    }
  | {
      type: 'keep_drawn';
      playerId: string;
    }
  | {
      type: 'choose_swap_target';
      playerId: string;
      targetPlayerId: string;
    }
  | {
      type: 'respond_wild_four';
      playerId: string;
      challenge: boolean;
    }
  | {
      type: 'call_uno';
      playerId: string;
    }
  | {
      type: 'catch_uno';
      playerId: string;
      targetPlayerId: string;
    }
  | {
      type: 'timeout_turn';
    };

/** Structured events emitted by engine transitions for animations, SFX, and logs. */
export type GameEvent =
  | { type: 'round_started'; roundNumber: number; activeColor: ActiveColor }
  | {
      type: 'card_played';
      playerId: string;
      faces: CardFace[];
      isJumpIn: boolean;
      chosenColor?: ActiveColor;
    }
  | {
      type: 'cards_drawn';
      playerId: string;
      count: number;
      reason: 'turn' | 'penalty' | 'challenge' | 'uno_catch' | 'draw_color';
    }
  | {
      type: 'turn_skipped';
      playerId: string;
      byPlayerId: string;
      reason: 'skip' | 'skip_everyone' | 'penalty';
    }
  | { type: 'direction_reversed'; direction: TurnDirection }
  | { type: 'table_flipped'; activeSide: TableSide }
  | { type: 'hands_swapped'; fromPlayerId: string; toPlayerId: string }
  | { type: 'hands_rotated'; direction: TurnDirection }
  | { type: 'uno_called'; playerId: string }
  | { type: 'uno_caught'; offenderId: string; catcherId: string; penalty: number }
  | {
      type: 'wild_four_challenged';
      offenderId: string;
      challengerId: string;
      guilty: boolean;
      penalty: number;
    }
  | { type: 'player_eliminated'; playerId: string; reason: 'mercy_limit' }
  | {
      type: 'round_ended';
      winnerId: string;
      pointsEarned: number;
      scores: Record<string, number>;
    }
  | {
      type: 'match_ended';
      winnerId: string;
      scores: Record<string, number>;
    };

export type ActionErrorCode =
  | 'MATCH_OVER'
  | 'INVALID_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'PENDING_ACTION'
  | 'INVALID_CARD'
  | 'UNPLAYABLE_CARD'
  | 'COLOR_REQUIRED'
  | 'INVALID_COLOR'
  | 'INVALID_TARGET'
  | 'INVALID_ACTION';

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string; code: ActionErrorCode };

/** Deterministic PRNG signature for testable shuffling/fallback color picks. */
export type RngFn = () => number;
