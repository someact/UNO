import { getActiveFace } from './deck.js';
import type { Card, CardFace, CardKind, GameState, SeatPlayer, TurnDirection } from './types.js';

/** Returns the penalty draw count for a card kind (0 for non-draw cards). */
export function getDrawValue(kind: CardKind): number {
  switch (kind) {
    case 'draw_one':
      return 1;
    case 'draw_two':
    case 'wild_draw_two':
      return 2;
    case 'wild_draw_four':
      return 4;
    case 'draw_five':
      return 5;
    case 'wild_draw_six':
      return 6;
    case 'wild_draw_ten':
      return 10;
    default:
      return 0;
  }
}

/** Returns true for any wild card that lets the player choose the active color. */
export function isWildKind(kind: CardKind): boolean {
  return (
    kind === 'wild' ||
    kind === 'wild_draw_two' ||
    kind === 'wild_draw_four' ||
    kind === 'wild_draw_six' ||
    kind === 'wild_draw_ten' ||
    kind === 'wild_draw_color'
  );
}

/** Returns all non-eliminated players in seat order. */
export function getActivePlayers(players: readonly SeatPlayer[]): SeatPlayer[] {
  return players.filter((p) => !p.eliminated);
}

/** Advances index by `steps` active (non-eliminated) seats along `direction`. */
export function findNextActiveIndex(
  players: readonly SeatPlayer[],
  fromIndex: number,
  direction: TurnDirection,
  steps = 1
): number {
  const total = players.length;
  if (total === 0) return -1;

  let idx = fromIndex;
  let remaining = steps;
  let guard = 0;

  while (remaining > 0 && guard < total * (steps + 2)) {
    idx = (idx + direction + total) % total;
    if (!players[idx].eliminated) {
      remaining -= 1;
    }
    guard += 1;
  }

  return idx;
}

/** Checks whether a card face can legally be played on the current state during a turn. */
export function isFacePlayableOnState(face: CardFace, state: GameState): boolean {
  if (state.drawPenalty && state.drawPenalty.amount > 0) {
    if (state.config.rules.stacking !== 'same-or-higher') {
      return false;
    }
    const drawValue = getDrawValue(face.kind);
    return drawValue > 0 && drawValue >= state.drawPenalty.minDrawValue;
  }

  if (isWildKind(face.kind)) {
    return true;
  }

  if (face.color === state.activeColor) {
    return true;
  }

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard) return false;
  const topFace = getActiveFace(topCard, state.activeSide);

  if (face.kind === 'number' && topFace.kind === 'number') {
    return face.value === topFace.value;
  }

  return face.kind !== 'number' && face.kind === topFace.kind;
}

/** Checks whether a card face matches the top discard card identically for Blitz Jump-In. */
export function canJumpInWithFace(face: CardFace, state: GameState): boolean {
  if (!state.config.rules.jumpIn) return false;
  if (state.phase !== 'playing') return false;
  if (state.pendingAction !== null) return false;
  if (state.drawPenalty !== null) return false;
  if (face.color === 'wild') return false;

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard) return false;
  const topFace = getActiveFace(topCard, state.activeSide);

  if (face.color !== topFace.color || face.kind !== topFace.kind) {
    return false;
  }
  if (face.kind === 'number') {
    return face.value === topFace.value;
  }
  return true;
}

/** Checks whether `playerId` can legally play `card` right now (normal turn, drawn_playable, or Jump-In). */
export function canPlayerPlayCard(
  state: GameState,
  playerId: string,
  card: Card
): { playable: boolean; isJumpIn: boolean } {
  if (state.phase !== 'playing') {
    return { playable: false, isJumpIn: false };
  }

  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1 || state.players[playerIndex].eliminated) {
    return { playable: false, isJumpIn: false };
  }

  const face = getActiveFace(card, state.activeSide);

  if (state.pendingAction) {
    if (
      state.pendingAction.type === 'drawn_playable' &&
      state.pendingAction.playerId === playerId &&
      state.pendingAction.cardId === card.id
    ) {
      return { playable: isFacePlayableOnState(face, state), isJumpIn: false };
    }
    return { playable: false, isJumpIn: false };
  }

  const isCurrentTurn = playerIndex === state.currentPlayerIndex;
  if (isCurrentTurn) {
    return { playable: isFacePlayableOnState(face, state), isJumpIn: false };
  }

  if (canJumpInWithFace(face, state)) {
    return { playable: true, isJumpIn: true };
  }

  return { playable: false, isJumpIn: false };
}

/** Returns IDs of cards in `playerId`'s hand playable on their turn vs via Jump-In. */
export function getPlayableCardsForPlayer(
  state: GameState,
  playerId: string
): { playableCardIds: string[]; jumpInCardIds: string[] } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.eliminated || state.phase !== 'playing') {
    return { playableCardIds: [], jumpInCardIds: [] };
  }

  const playableCardIds: string[] = [];
  const jumpInCardIds: string[] = [];

  for (const card of player.hand) {
    const check = canPlayerPlayCard(state, playerId, card);
    if (check.playable) {
      if (check.isJumpIn) {
        jumpInCardIds.push(card.id);
      } else {
        playableCardIds.push(card.id);
      }
    }
  }

  return { playableCardIds, jumpInCardIds };
}
