import {
  findNextActiveIndex,
  getActiveFace,
  getDrawValue,
  getPlayableCardsForPlayer,
  getSideColors,
  isWildKind,
  pickFallbackColor,
  type ActiveColor,
  type Card,
  type GameAction,
  type GameState,
  type RngFn,
} from '@uno/shared';

export const BOT_NAMES = [
  'Byte',
  'Nova',
  'Pixel',
  'Echo',
  'Chip',
  'Spark',
  'Mochi',
  'Turbo',
] as const;

export interface BotDecisionPlan {
  preCallUno: boolean;
  action: GameAction;
}

function chooseColorForRemainingHand(
  hand: readonly Card[],
  excludeCardId: string,
  state: GameState,
  difficulty: 'casual' | 'smart',
  rng: RngFn
): ActiveColor {
  if (difficulty === 'casual') {
    const sideColors = getSideColors(state.activeSide);
    return sideColors[Math.floor(rng() * sideColors.length)];
  }
  const remaining = hand.filter((c) => c.id !== excludeCardId);
  return pickFallbackColor(remaining, state.activeSide);
}

function pickSwapTarget(
  state: GameState,
  botId: string,
  difficulty: 'casual' | 'smart',
  rng: RngFn
): string | undefined {
  const opponents = state.players.filter((p) => !p.eliminated && p.id !== botId);
  if (opponents.length === 0) return undefined;

  if (difficulty === 'casual') {
    return opponents[Math.floor(rng() * opponents.length)].id;
  }

  // Smart bot swaps with whichever active opponent holds the fewest cards.
  return opponents.reduce((best, p) => (p.hand.length < best.hand.length ? p : best)).id;
}

function scoreCandidateCard(
  card: Card,
  state: GameState,
  botIndex: number,
  nextOpponentCardCount: number
): number {
  const face = getActiveFace(card, state.activeSide);
  const botHand = state.players[botIndex].hand;
  const drawValue = getDrawValue(face.kind);

  // When defending against an active draw penalty stack, prefer the lowest valid draw card.
  if (state.drawPenalty && state.drawPenalty.amount > 0) {
    return 500 - drawValue * 10;
  }

  let score = face.points;

  if (face.kind === 'discard_all') {
    const extraMatches = botHand.filter(
      (c) => c.id !== card.id && getActiveFace(c, state.activeSide).color === face.color
    ).length;
    score += 120 + extraMatches * 60;
  }

  // Prioritize attack/skip cards when the next opponent is close to winning.
  if (nextOpponentCardCount <= 2) {
    if (drawValue > 0 || face.kind === 'wild_draw_color') {
      score += 140 + drawValue * 10;
    } else if (face.kind === 'skip' || face.kind === 'skip_everyone') {
      score += 110;
    } else if (face.kind === 'reverse' && state.players.filter((p) => !p.eliminated).length === 2) {
      score += 110;
    }
  }

  // Save wild cards for when colored options are unavailable.
  if (isWildKind(face.kind)) {
    score -= 45;
  }

  // In 7-0 mode, prefer 7 if an opponent holds significantly fewer cards.
  if (face.kind === 'number' && face.value === 7 && state.config.rules.sevenZero) {
    const minOpp = Math.min(
      ...state.players.filter((p) => !p.eliminated && p.id !== state.players[botIndex].id).map((p) => p.hand.length)
    );
    if (minOpp + 2 <= botHand.length - 1) {
      score += 95;
    } else {
      score -= 35;
    }
  }

  return score;
}

function shouldPreCallUnoAfterCard(
  hand: readonly Card[],
  playedCard: Card,
  state: GameState,
  difficulty: 'casual' | 'smart',
  rng: RngFn
): boolean {
  const face = getActiveFace(playedCard, state.activeSide);
  let remainingCount = hand.length - 1;
  if (face.kind === 'discard_all' && state.config.rules.allowDiscardAll) {
    remainingCount = hand.filter(
      (c) => c.id !== playedCard.id && getActiveFace(c, state.activeSide).color !== face.color
    ).length;
  }
  if (remainingCount !== 1) return false;

  const chance = difficulty === 'smart' ? 0.9 : 0.55;
  return rng() < chance;
}

/** Computes the next action (and optional UNO pre-call) for an AI bot or auto-piloted seat. */
export function decideBotAction(
  state: GameState,
  botId: string,
  difficulty: 'casual' | 'smart' = 'smart',
  rng: RngFn = Math.random
): BotDecisionPlan | null {
  if (state.phase !== 'playing') return null;

  const botIndex = state.players.findIndex((p) => p.id === botId && !p.eliminated);
  if (botIndex === -1) return null;
  const bot = state.players[botIndex];

  // 1. Handle pending mid-turn interactions first.
  const pending = state.pendingAction;
  if (pending) {
    if (pending.type === 'drawn_playable' && pending.playerId === botId) {
      const card = bot.hand.find((c) => c.id === pending.cardId);
      if (!card) return { preCallUno: false, action: { type: 'keep_drawn', playerId: botId } };
      const face = getActiveFace(card, state.activeSide);
      const chosenColor = isWildKind(face.kind)
        ? chooseColorForRemainingHand(bot.hand, card.id, state, difficulty, rng)
        : undefined;
      const swapTargetId =
        face.kind === 'number' && face.value === 7 && state.config.rules.sevenZero
          ? pickSwapTarget(state, botId, difficulty, rng)
          : undefined;
      return {
        preCallUno: shouldPreCallUnoAfterCard(bot.hand, card, state, difficulty, rng),
        action: {
          type: 'play_card',
          playerId: botId,
          cardId: card.id,
          ...(chosenColor ? { chosenColor } : {}),
          ...(swapTargetId ? { swapTargetId } : {}),
        },
      };
    }

    if (pending.type === 'choose_swap_target' && pending.playerId === botId) {
      const targetPlayerId = pickSwapTarget(state, botId, difficulty, rng);
      if (!targetPlayerId) return null;
      return {
        preCallUno: false,
        action: { type: 'choose_swap_target', playerId: botId, targetPlayerId },
      };
    }

    if (pending.type === 'wild_four_challenge' && pending.challengerId === botId) {
      const offender = state.players.find((p) => p.id === pending.offenderId);
      const challengeChance =
        difficulty === 'smart'
          ? offender && offender.hand.length >= 4
            ? 0.45
            : 0.25
          : 0.25;
      return {
        preCallUno: false,
        action: {
          type: 'respond_wild_four',
          playerId: botId,
          challenge: rng() < challengeChance,
        },
      };
    }

    return null;
  }

  // 2. Normal turn decision.
  if (state.currentPlayerIndex !== botIndex) return null;

  const { playableCardIds } = getPlayableCardsForPlayer(state, botId);
  if (playableCardIds.length === 0) {
    return {
      preCallUno: false,
      action: { type: 'draw_card', playerId: botId },
    };
  }

  const candidateCards = bot.hand.filter((c) => playableCardIds.includes(c.id));
  let chosenCard = candidateCards[0];

  if (difficulty === 'casual') {
    chosenCard = candidateCards[Math.floor(rng() * candidateCards.length)];
  } else {
    const nextIdx = findNextActiveIndex(state.players, botIndex, state.direction, 1);
    const nextOppCount = state.players[nextIdx]?.hand.length ?? 7;

    let bestScore = -Infinity;
    for (const card of candidateCards) {
      const s = scoreCandidateCard(card, state, botIndex, nextOppCount);
      if (s > bestScore) {
        bestScore = s;
        chosenCard = card;
      }
    }
  }

  const face = getActiveFace(chosenCard, state.activeSide);
  const chosenColor = isWildKind(face.kind)
    ? chooseColorForRemainingHand(bot.hand, chosenCard.id, state, difficulty, rng)
    : undefined;
  const swapTargetId =
    face.kind === 'number' && face.value === 7 && state.config.rules.sevenZero
      ? pickSwapTarget(state, botId, difficulty, rng)
      : undefined;

  return {
    preCallUno: shouldPreCallUnoAfterCard(bot.hand, chosenCard, state, difficulty, rng),
    action: {
      type: 'play_card',
      playerId: botId,
      cardId: chosenCard.id,
      ...(chosenColor ? { chosenColor } : {}),
      ...(swapTargetId ? { swapTargetId } : {}),
    },
  };
}
