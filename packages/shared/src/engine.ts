import {
  calculateHandPoints,
  createAuxiliaryDeck,
  createDeckForConfig,
  getActiveFace,
  pickFallbackColor,
  shuffleCards,
} from './deck.js';
import { isValidColorForSide, MAX_PLAYERS, MIN_PLAYERS } from './presets.js';
import {
  canPlayerPlayCard,
  findNextActiveIndex,
  getActivePlayers,
  getDrawValue,
  getPlayableCardsForPlayer,
  isFacePlayableOnState,
  isWildKind,
} from './rules.js';
import type {
  ActionErrorCode,
  ActionResult,
  ActiveColor,
  Card,
  CardFace,
  ClientGameState,
  ClientPendingAction,
  GameAction,
  GameEvent,
  GameState,
  MatchPlayerInput,
  RngFn,
  RoomConfig,
  SeatPlayer,
  TurnDirection,
} from './types.js';

function fail(code: ActionErrorCode, error: string): ActionResult {
  return { ok: false, code, error };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: {
      ...state.config,
      rules: { ...state.config.rules },
    },
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
    })),
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    drawPenalty: state.drawPenalty ? { ...state.drawPenalty } : null,
    pendingAction: state.pendingAction ? { ...state.pendingAction } : null,
  };
}

function buildScoresMap(players: readonly SeatPlayer[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const p of players) {
    scores[p.id] = p.score;
  }
  return scores;
}

function ensureDrawSupply(state: GameState, rng: RngFn): void {
  if (state.drawPile.length > 0) return;

  if (state.discardPile.length > 1) {
    const topCard = state.discardPile[state.discardPile.length - 1];
    const recyclable = state.discardPile.slice(0, -1);
    state.drawPile = shuffleCards(recyclable, rng);
    state.discardPile = [topCard];
    return;
  }

  state.drawPile = createAuxiliaryDeck(state.config, rng);
}

function drawFromPile(state: GameState, count: number, rng: RngFn): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i += 1) {
    ensureDrawSupply(state, rng);
    const card = state.drawPile.pop();
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}

function drawUntilColorMatch(state: GameState, targetColor: ActiveColor, rng: RngFn): Card[] {
  const drawn: Card[] = [];
  const safetyCap = 200;
  for (let i = 0; i < safetyCap; i += 1) {
    ensureDrawSupply(state, rng);
    const card = state.drawPile.pop();
    if (!card) break;
    drawn.push(card);
    if (getActiveFace(card, state.activeSide).color === targetColor) {
      break;
    }
  }
  return drawn;
}

function finishRound(state: GameState, winnerId: string, events: GameEvent[]): void {
  const winner = state.players.find((p) => p.id === winnerId);
  if (!winner) return;

  let pointsEarned = 0;
  for (const p of state.players) {
    if (p.id !== winnerId) {
      pointsEarned += calculateHandPoints(p.hand, state.activeSide);
    }
  }

  winner.score += pointsEarned;
  state.lastRoundPoints = pointsEarned;
  state.roundWinnerId = winnerId;
  state.pendingAction = null;
  state.drawPenalty = null;
  state.unoVulnerablePlayerId = null;

  const scores = buildScoresMap(state.players);
  events.push({
    type: 'round_ended',
    winnerId,
    pointsEarned,
    scores,
  });

  if (state.config.winTargetScore === 0 || winner.score >= state.config.winTargetScore) {
    state.phase = 'match_over';
    state.matchWinnerId = winnerId;
    events.push({
      type: 'match_ended',
      winnerId,
      scores,
    });
  } else {
    state.phase = 'round_over';
  }
}

function applyMercyCheck(
  state: GameState,
  playerIndex: number,
  events: GameEvent[]
): boolean {
  const limit = state.config.rules.mercyLimit;
  if (limit <= 0) return false;

  const player = state.players[playerIndex];
  if (!player || player.eliminated || player.hand.length < limit) {
    return false;
  }

  player.eliminated = true;
  player.unoSafe = false;
  state.discardPile = [...player.hand, ...state.discardPile];
  player.hand = [];

  if (state.unoVulnerablePlayerId === player.id) {
    state.unoVulnerablePlayerId = null;
  }

  events.push({
    type: 'player_eliminated',
    playerId: player.id,
    reason: 'mercy_limit',
  });

  const remaining = getActivePlayers(state.players);
  if (remaining.length === 1) {
    finishRound(state, remaining[0].id, events);
    return true;
  }

  return false;
}

function swapPlayerHands(
  state: GameState,
  fromIndex: number,
  toIndex: number,
  events: GameEvent[]
): void {
  const fromPlayer = state.players[fromIndex];
  const toPlayer = state.players[toIndex];
  const temp = fromPlayer.hand;
  fromPlayer.hand = toPlayer.hand;
  toPlayer.hand = temp;
  fromPlayer.unoSafe = false;
  toPlayer.unoSafe = false;
  state.unoVulnerablePlayerId = null;

  events.push({
    type: 'hands_swapped',
    fromPlayerId: fromPlayer.id,
    toPlayerId: toPlayer.id,
  });
}

function rotateAllActiveHands(state: GameState, events: GameEvent[]): void {
  const activeIndices: number[] = [];
  for (let i = 0; i < state.players.length; i += 1) {
    if (!state.players[i].eliminated) {
      activeIndices.push(i);
    }
  }
  if (activeIndices.length <= 1) return;

  const snapshots = activeIndices.map((idx) => state.players[idx].hand);
  const count = activeIndices.length;

  for (let i = 0; i < count; i += 1) {
    const targetPos = state.direction === 1 ? (i + 1) % count : (i - 1 + count) % count;
    const targetIdx = activeIndices[targetPos];
    state.players[targetIdx].hand = snapshots[i];
    state.players[targetIdx].unoSafe = false;
  }

  state.unoVulnerablePlayerId = null;
  events.push({
    type: 'hands_rotated',
    direction: state.direction,
  });
}

function initRound(
  basePlayers: SeatPlayer[],
  roundNumber: number,
  config: RoomConfig,
  rng: RngFn
): GameState {
  const deck = createDeckForConfig(config, rng);
  const players: SeatPlayer[] = basePlayers.map((p) => ({
    ...p,
    hand: [],
    eliminated: false,
    unoSafe: false,
  }));

  for (let c = 0; c < config.startingHandSize; c += 1) {
    for (const player of players) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  // Pick a clean number card from remaining deck to open the discard pile.
  let startIdx = deck.findIndex((card) => card.light.kind === 'number');
  if (startIdx === -1) startIdx = deck.length - 1;
  const [starterCard] = deck.splice(startIdx, 1);

  const activeColor = (
    starterCard.light.color === 'wild' ? 'red' : starterCard.light.color
  ) as ActiveColor;

  return {
    roundNumber,
    phase: 'playing',
    config: {
      ...config,
      rules: { ...config.rules },
    },
    players,
    currentPlayerIndex: (roundNumber - 1) % players.length,
    direction: 1,
    activeSide: 'light',
    activeColor,
    drawPile: deck,
    discardPile: [starterCard],
    drawPenalty: null,
    pendingAction: null,
    unoVulnerablePlayerId: null,
    roundWinnerId: null,
    matchWinnerId: null,
    lastRoundPoints: 0,
    turnCounter: 0,
  };
}

/** Creates a brand-new GameState for 2 to 6 players. */
export function createMatchState(
  playerInputs: readonly MatchPlayerInput[],
  config: RoomConfig,
  rng: RngFn = Math.random
): GameState {
  if (playerInputs.length < MIN_PLAYERS || playerInputs.length > MAX_PLAYERS) {
    throw new Error(`Multi-UNO requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
  }

  const players: SeatPlayer[] = playerInputs.map((input) => ({
    ...input,
    hand: [],
    score: 0,
    eliminated: false,
    connected: true,
    unoSafe: false,
  }));

  return initRound(players, 1, config, rng);
}

/** Starts the next round while preserving cumulative match scores and seats. */
export function startNextRound(prevState: GameState, rng: RngFn = Math.random): ActionResult {
  if (prevState.phase !== 'round_over') {
    return fail('INVALID_ACTION', 'Can only start next round when phase is round_over.');
  }

  const nextState = initRound(prevState.players, prevState.roundNumber + 1, prevState.config, rng);
  return {
    ok: true,
    state: nextState,
    events: [
      {
        type: 'round_started',
        roundNumber: nextState.roundNumber,
        activeColor: nextState.activeColor,
      },
    ],
  };
}

function handlePlayCard(
  state: GameState,
  action: Extract<GameAction, { type: 'play_card' }>,
  rng: RngFn
): ActionResult {
  const playerIndex = state.players.findIndex((p) => p.id === action.playerId);
  if (playerIndex === -1 || state.players[playerIndex].eliminated) {
    return fail('INVALID_PLAYER', 'Player is not active in this match.');
  }

  const player = state.players[playerIndex];
  const cardIndex = player.hand.findIndex((c) => c.id === action.cardId);
  if (cardIndex === -1) {
    return fail('INVALID_CARD', 'Card not found in player hand.');
  }

  const card = player.hand[cardIndex];
  const check = canPlayerPlayCard(state, player.id, card);
  if (!check.playable) {
    return fail('UNPLAYABLE_CARD', 'Card cannot be played right now.');
  }

  const face = getActiveFace(card, state.activeSide);
  const previousActiveColor = state.activeColor;

  if (isWildKind(face.kind)) {
    if (!action.chosenColor) {
      return fail('COLOR_REQUIRED', 'Wild cards require choosing an active color.');
    }
    if (!isValidColorForSide(action.chosenColor, state.activeSide)) {
      return fail('INVALID_COLOR', 'Chosen color is invalid for the current side.');
    }
  }

  let validatedSwapIdx: number | undefined;
  if (face.kind === 'number' && face.value === 7 && state.config.rules.sevenZero && action.swapTargetId) {
    const targetIdx = state.players.findIndex(
      (p) => p.id === action.swapTargetId && !p.eliminated && p.id !== player.id
    );
    if (targetIdx === -1) {
      return fail('INVALID_TARGET', 'Invalid 7-swap target player.');
    }
    validatedSwapIdx = targetIdx;
  }

  // Check bluff eligibility before removing card from hand.
  const offenderHadMatchingColor = player.hand.some(
    (c, idx) => idx !== cardIndex && getActiveFace(c, state.activeSide).color === previousActiveColor
  );

  // Clear previous turn UNO catch window and drawn_playable state.
  state.unoVulnerablePlayerId = null;
  if (state.pendingAction?.type === 'drawn_playable') {
    state.pendingAction = null;
  }

  // Remove played card and push onto discard pile.
  player.hand.splice(cardIndex, 1);
  const playedFaces: CardFace[] = [face];

  if (face.kind === 'discard_all' && state.config.rules.allowDiscardAll) {
    const matchingExtras: Card[] = [];
    const remaining: Card[] = [];
    for (const c of player.hand) {
      if (getActiveFace(c, state.activeSide).color === face.color) {
        matchingExtras.push(c);
        playedFaces.push(getActiveFace(c, state.activeSide));
      } else {
        remaining.push(c);
      }
    }
    player.hand = remaining;
    // Place extra matching cards just beneath Discard All so top card stays consistent.
    state.discardPile.push(...matchingExtras, card);
  } else {
    state.discardPile.push(card);
  }

  const events: GameEvent[] = [
    {
      type: 'card_played',
      playerId: player.id,
      faces: playedFaces,
      isJumpIn: check.isJumpIn,
      ...(action.chosenColor ? { chosenColor: action.chosenColor } : {}),
    },
  ];

  // Update active color (Flip handles side & color separately below).
  if (isWildKind(face.kind) && action.chosenColor) {
    state.activeColor = action.chosenColor;
  } else if (face.kind !== 'flip') {
    state.activeColor = face.color as ActiveColor;
  }

  // Track UNO vulnerability when dropping to 1 card.
  if (player.hand.length === 1) {
    if (!player.unoSafe) {
      state.unoVulnerablePlayerId = player.id;
    }
  } else {
    player.unoSafe = false;
  }

  // Immediate round victory if player emptied their hand.
  if (player.hand.length === 0) {
    const lastDrawValue = getDrawValue(face.kind);
    if (lastDrawValue > 0) {
      const victimIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
      const totalPenalty = (state.drawPenalty?.amount ?? 0) + lastDrawValue;
      const drawn = drawFromPile(state, totalPenalty, rng);
      state.players[victimIdx].hand.push(...drawn);
      events.push({
        type: 'cards_drawn',
        playerId: state.players[victimIdx].id,
        count: drawn.length,
        reason: 'penalty',
      });
    } else if (face.kind === 'wild_draw_color' && action.chosenColor) {
      const victimIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
      const drawn = drawUntilColorMatch(state, action.chosenColor, rng);
      state.players[victimIdx].hand.push(...drawn);
      events.push({
        type: 'cards_drawn',
        playerId: state.players[victimIdx].id,
        count: drawn.length,
        reason: 'draw_color',
      });
    } else if (face.kind === 'flip') {
      state.activeSide = state.activeSide === 'light' ? 'dark' : 'light';
      events.push({ type: 'table_flipped', activeSide: state.activeSide });
    }

    finishRound(state, player.id, events);
    return { ok: true, state, events };
  }

  state.turnCounter += 1;
  const activeCount = getActivePlayers(state.players).length;
  const drawVal = getDrawValue(face.kind);

  if (face.kind === 'reverse') {
    state.direction = (state.direction * -1) as TurnDirection;
    events.push({ type: 'direction_reversed', direction: state.direction });
    if (activeCount === 2) {
      const skippedIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
      events.push({
        type: 'turn_skipped',
        playerId: state.players[skippedIdx].id,
        byPlayerId: player.id,
        reason: 'skip',
      });
      state.currentPlayerIndex = playerIndex;
    } else {
      state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    }
    return { ok: true, state, events };
  }

  if (face.kind === 'skip') {
    const skippedIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    events.push({
      type: 'turn_skipped',
      playerId: state.players[skippedIdx].id,
      byPlayerId: player.id,
      reason: 'skip',
    });
    state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 2);
    return { ok: true, state, events };
  }

  if (face.kind === 'skip_everyone') {
    for (const other of state.players) {
      if (!other.eliminated && other.id !== player.id) {
        events.push({
          type: 'turn_skipped',
          playerId: other.id,
          byPlayerId: player.id,
          reason: 'skip_everyone',
        });
      }
    }
    state.currentPlayerIndex = playerIndex;
    return { ok: true, state, events };
  }

  if (face.kind === 'flip') {
    state.activeSide = state.activeSide === 'light' ? 'dark' : 'light';
    state.drawPile.reverse();
    const flippedTopFace = getActiveFace(card, state.activeSide);
    state.activeColor =
      flippedTopFace.color === 'wild'
        ? pickFallbackColor(player.hand, state.activeSide)
        : flippedTopFace.color;
    events.push({ type: 'table_flipped', activeSide: state.activeSide });
    state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    return { ok: true, state, events };
  }

  if (face.kind === 'wild_draw_color' && action.chosenColor) {
    const victimIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    const drawn = drawUntilColorMatch(state, action.chosenColor, rng);
    state.players[victimIdx].hand.push(...drawn);
    state.players[victimIdx].unoSafe = false;
    events.push({
      type: 'cards_drawn',
      playerId: state.players[victimIdx].id,
      count: drawn.length,
      reason: 'draw_color',
    });
    const roundFinished = applyMercyCheck(state, victimIdx, events);
    if (roundFinished) return { ok: true, state, events };

    if (!state.players[victimIdx].eliminated) {
      events.push({
        type: 'turn_skipped',
        playerId: state.players[victimIdx].id,
        byPlayerId: player.id,
        reason: 'penalty',
      });
      state.currentPlayerIndex = findNextActiveIndex(state.players, victimIdx, state.direction, 1);
    } else {
      state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    }
    return { ok: true, state, events };
  }

  // Wild +4 Bluff Challenge takes precedence when stacking is disabled and no stack is active.
  if (
    face.kind === 'wild_draw_four' &&
    state.config.rules.wildFourChallenge &&
    state.config.rules.stacking === 'off' &&
    state.drawPenalty === null
  ) {
    const challengerIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    state.currentPlayerIndex = challengerIdx;
    state.pendingAction = {
      type: 'wild_four_challenge',
      offenderId: player.id,
      challengerId: state.players[challengerIdx].id,
      previousActiveColor,
      offenderHadMatchingColor,
    };
    return { ok: true, state, events };
  }

  if (drawVal > 0) {
    if (state.config.rules.stacking === 'same-or-higher') {
      state.drawPenalty = {
        amount: (state.drawPenalty?.amount ?? 0) + drawVal,
        minDrawValue: Math.max(state.drawPenalty?.minDrawValue ?? 0, drawVal),
      };
      state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
      return { ok: true, state, events };
    }

    const victimIdx = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    const drawn = drawFromPile(state, drawVal, rng);
    state.players[victimIdx].hand.push(...drawn);
    state.players[victimIdx].unoSafe = false;
    events.push({
      type: 'cards_drawn',
      playerId: state.players[victimIdx].id,
      count: drawn.length,
      reason: 'penalty',
    });

    const roundFinished = applyMercyCheck(state, victimIdx, events);
    if (roundFinished) return { ok: true, state, events };

    if (!state.players[victimIdx].eliminated) {
      events.push({
        type: 'turn_skipped',
        playerId: state.players[victimIdx].id,
        byPlayerId: player.id,
        reason: 'penalty',
      });
      state.currentPlayerIndex = findNextActiveIndex(state.players, victimIdx, state.direction, 1);
    } else {
      state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
    }
    return { ok: true, state, events };
  }

  if (face.kind === 'number' && state.config.rules.sevenZero) {
    if (face.value === 7) {
      const activeOpponents = state.players.filter((p) => !p.eliminated && p.id !== player.id);
      if (validatedSwapIdx !== undefined) {
        swapPlayerHands(state, playerIndex, validatedSwapIdx, events);
        state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
        return { ok: true, state, events };
      }
      if (activeOpponents.length === 1) {
        const onlyOpponentIdx = state.players.findIndex((p) => p.id === activeOpponents[0].id);
        swapPlayerHands(state, playerIndex, onlyOpponentIdx, events);
        state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
        return { ok: true, state, events };
      }
      state.currentPlayerIndex = playerIndex;
      state.pendingAction = { type: 'choose_swap_target', playerId: player.id };
      return { ok: true, state, events };
    }

    if (face.value === 0) {
      rotateAllActiveHands(state, events);
      state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
      return { ok: true, state, events };
    }
  }

  state.currentPlayerIndex = findNextActiveIndex(state.players, playerIndex, state.direction, 1);
  return { ok: true, state, events };
}

function handleDrawCard(
  state: GameState,
  playerId: string,
  rng: RngFn
): ActionResult {
  if (state.pendingAction) {
    return fail('PENDING_ACTION', 'Resolve the current pending action before drawing.');
  }

  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    return fail('NOT_YOUR_TURN', 'It is not your turn to draw.');
  }

  state.unoVulnerablePlayerId = null;
  const events: GameEvent[] = [];

  // Accepting an active draw penalty stack ends the player's turn after drawing.
  if (state.drawPenalty && state.drawPenalty.amount > 0) {
    const amount = state.drawPenalty.amount;
    state.drawPenalty = null;
    const drawn = drawFromPile(state, amount, rng);
    current.hand.push(...drawn);
    current.unoSafe = false;
    events.push({
      type: 'cards_drawn',
      playerId: current.id,
      count: drawn.length,
      reason: 'penalty',
    });

    const roundFinished = applyMercyCheck(state, state.currentPlayerIndex, events);
    if (roundFinished) return { ok: true, state, events };

    state.turnCounter += 1;
    state.currentPlayerIndex = findNextActiveIndex(
      state.players,
      state.currentPlayerIndex,
      state.direction,
      1
    );
    return { ok: true, state, events };
  }

  if (state.config.rules.drawUntilPlayable) {
    const drawn: Card[] = [];
    const safetyCap = 120;
    let lastPlayableCard: Card | null = null;

    for (let i = 0; i < safetyCap; i += 1) {
      const [card] = drawFromPile(state, 1, rng);
      if (!card) break;
      drawn.push(card);
      current.hand.push(card);
      if (isFacePlayableOnState(getActiveFace(card, state.activeSide), state)) {
        lastPlayableCard = card;
        break;
      }
    }

    current.unoSafe = false;
    events.push({
      type: 'cards_drawn',
      playerId: current.id,
      count: drawn.length,
      reason: 'turn',
    });

    const roundFinished = applyMercyCheck(state, state.currentPlayerIndex, events);
    if (roundFinished) return { ok: true, state, events };

    if (!current.eliminated && lastPlayableCard && state.config.rules.playDrawnCard) {
      state.pendingAction = {
        type: 'drawn_playable',
        playerId: current.id,
        cardId: lastPlayableCard.id,
      };
      return { ok: true, state, events };
    }

    state.turnCounter += 1;
    state.currentPlayerIndex = findNextActiveIndex(
      state.players,
      state.currentPlayerIndex,
      state.direction,
      1
    );
    return { ok: true, state, events };
  }

  // Standard Draw-1 flow.
  const [drawnCard] = drawFromPile(state, 1, rng);
  if (drawnCard) {
    current.hand.push(drawnCard);
  }
  current.unoSafe = false;
  events.push({
    type: 'cards_drawn',
    playerId: current.id,
    count: drawnCard ? 1 : 0,
    reason: 'turn',
  });

  const roundFinished = applyMercyCheck(state, state.currentPlayerIndex, events);
  if (roundFinished) return { ok: true, state, events };

  if (
    !current.eliminated &&
    drawnCard &&
    state.config.rules.playDrawnCard &&
    isFacePlayableOnState(getActiveFace(drawnCard, state.activeSide), state)
  ) {
    state.pendingAction = {
      type: 'drawn_playable',
      playerId: current.id,
      cardId: drawnCard.id,
    };
    return { ok: true, state, events };
  }

  state.turnCounter += 1;
  state.currentPlayerIndex = findNextActiveIndex(
    state.players,
    state.currentPlayerIndex,
    state.direction,
    1
  );
  return { ok: true, state, events };
}

function handleKeepDrawn(state: GameState, playerId: string): ActionResult {
  if (!state.pendingAction || state.pendingAction.type !== 'drawn_playable') {
    return fail('INVALID_ACTION', 'No drawn card choice is pending.');
  }
  if (state.pendingAction.playerId !== playerId) {
    return fail('NOT_YOUR_TURN', 'Only the drawing player can keep the drawn card.');
  }

  state.pendingAction = null;
  state.turnCounter += 1;
  state.currentPlayerIndex = findNextActiveIndex(
    state.players,
    state.currentPlayerIndex,
    state.direction,
    1
  );
  return { ok: true, state, events: [] };
}

function handleChooseSwapTarget(
  state: GameState,
  playerId: string,
  targetPlayerId: string
): ActionResult {
  if (!state.pendingAction || state.pendingAction.type !== 'choose_swap_target') {
    return fail('INVALID_ACTION', 'No 7-swap target selection is pending.');
  }
  if (state.pendingAction.playerId !== playerId) {
    return fail('NOT_YOUR_TURN', 'Only the player who played 7 can pick a swap target.');
  }

  const fromIdx = state.players.findIndex((p) => p.id === playerId && !p.eliminated);
  const targetIdx = state.players.findIndex(
    (p) => p.id === targetPlayerId && !p.eliminated && p.id !== playerId
  );
  if (fromIdx === -1 || targetIdx === -1) {
    return fail('INVALID_TARGET', 'Target player is invalid or eliminated.');
  }

  const events: GameEvent[] = [];
  swapPlayerHands(state, fromIdx, targetIdx, events);
  state.pendingAction = null;
  state.currentPlayerIndex = findNextActiveIndex(state.players, fromIdx, state.direction, 1);

  return { ok: true, state, events };
}

function handleRespondWildFour(
  state: GameState,
  playerId: string,
  challenge: boolean,
  rng: RngFn
): ActionResult {
  if (!state.pendingAction || state.pendingAction.type !== 'wild_four_challenge') {
    return fail('INVALID_ACTION', 'No Wild +4 challenge is pending.');
  }

  const pending = state.pendingAction;
  if (pending.challengerId !== playerId) {
    return fail('NOT_YOUR_TURN', 'Only the challenged player can respond.');
  }

  const offenderIdx = state.players.findIndex((p) => p.id === pending.offenderId);
  const challengerIdx = state.players.findIndex((p) => p.id === pending.challengerId);
  if (offenderIdx === -1 || challengerIdx === -1) {
    return fail('INVALID_PLAYER', 'Challenge participant no longer exists.');
  }

  const events: GameEvent[] = [];
  state.pendingAction = null;

  if (!challenge) {
    const drawn = drawFromPile(state, 4, rng);
    state.players[challengerIdx].hand.push(...drawn);
    state.players[challengerIdx].unoSafe = false;
    events.push({
      type: 'cards_drawn',
      playerId: pending.challengerId,
      count: drawn.length,
      reason: 'penalty',
    });

    const roundFinished = applyMercyCheck(state, challengerIdx, events);
    if (roundFinished) return { ok: true, state, events };

    events.push({
      type: 'turn_skipped',
      playerId: pending.challengerId,
      byPlayerId: pending.offenderId,
      reason: 'penalty',
    });
    state.currentPlayerIndex = findNextActiveIndex(
      state.players,
      challengerIdx,
      state.direction,
      1
    );
    return { ok: true, state, events };
  }

  if (pending.offenderHadMatchingColor) {
    const drawn = drawFromPile(state, 4, rng);
    state.players[offenderIdx].hand.push(...drawn);
    state.players[offenderIdx].unoSafe = false;
    events.push({
      type: 'wild_four_challenged',
      offenderId: pending.offenderId,
      challengerId: pending.challengerId,
      guilty: true,
      penalty: 4,
    });
    events.push({
      type: 'cards_drawn',
      playerId: pending.offenderId,
      count: drawn.length,
      reason: 'challenge',
    });

    const roundFinished = applyMercyCheck(state, offenderIdx, events);
    if (roundFinished) return { ok: true, state, events };

    // Innocent challenger keeps their turn!
    state.currentPlayerIndex = challengerIdx;
    return { ok: true, state, events };
  }

  const drawn = drawFromPile(state, 6, rng);
  state.players[challengerIdx].hand.push(...drawn);
  state.players[challengerIdx].unoSafe = false;
  events.push({
    type: 'wild_four_challenged',
    offenderId: pending.offenderId,
    challengerId: pending.challengerId,
    guilty: false,
    penalty: 6,
  });
  events.push({
    type: 'cards_drawn',
    playerId: pending.challengerId,
    count: drawn.length,
    reason: 'challenge',
  });

  const roundFinished = applyMercyCheck(state, challengerIdx, events);
  if (roundFinished) return { ok: true, state, events };

  events.push({
    type: 'turn_skipped',
    playerId: pending.challengerId,
    byPlayerId: pending.offenderId,
    reason: 'penalty',
  });
  state.currentPlayerIndex = findNextActiveIndex(
    state.players,
    challengerIdx,
    state.direction,
    1
  );
  return { ok: true, state, events };
}

function handleCallUno(state: GameState, playerId: string): ActionResult {
  const player = state.players.find((p) => p.id === playerId && !p.eliminated);
  if (!player) {
    return fail('INVALID_PLAYER', 'Player is not active.');
  }

  const isCurrent = state.players[state.currentPlayerIndex]?.id === playerId;
  const hasDiscardAll =
    state.config.rules.allowDiscardAll &&
    player.hand.some((c) => getActiveFace(c, state.activeSide).kind === 'discard_all');
  const canPreCall = isCurrent && (player.hand.length === 2 || (hasDiscardAll && player.hand.length >= 2));
  const canConfirmSingle = player.hand.length === 1;

  if (!canPreCall && !canConfirmSingle) {
    return fail('INVALID_ACTION', 'You can only call UNO with 1 card or right before playing down to 1.');
  }

  player.unoSafe = true;
  if (state.unoVulnerablePlayerId === playerId) {
    state.unoVulnerablePlayerId = null;
  }

  return {
    ok: true,
    state,
    events: [{ type: 'uno_called', playerId }],
  };
}

function handleCatchUno(
  state: GameState,
  catcherId: string,
  targetPlayerId: string,
  rng: RngFn
): ActionResult {
  const catcher = state.players.find((p) => p.id === catcherId && !p.eliminated);
  if (!catcher) {
    return fail('INVALID_PLAYER', 'Catcher must be an active player.');
  }
  if (catcherId === targetPlayerId) {
    return fail('INVALID_TARGET', 'You cannot catch yourself.');
  }
  if (state.unoVulnerablePlayerId !== targetPlayerId) {
    return fail('INVALID_TARGET', 'That player is not currently catchable for UNO.');
  }

  const offenderIdx = state.players.findIndex((p) => p.id === targetPlayerId && !p.eliminated);
  if (offenderIdx === -1) {
    return fail('INVALID_TARGET', 'Target player is not active.');
  }

  const offender = state.players[offenderIdx];
  const drawn = drawFromPile(state, 2, rng);
  offender.hand.push(...drawn);
  offender.unoSafe = false;
  state.unoVulnerablePlayerId = null;

  const events: GameEvent[] = [
    {
      type: 'uno_caught',
      offenderId: targetPlayerId,
      catcherId,
      penalty: drawn.length,
    },
    {
      type: 'cards_drawn',
      playerId: targetPlayerId,
      count: drawn.length,
      reason: 'uno_catch',
    },
  ];

  applyMercyCheck(state, offenderIdx, events);
  return { ok: true, state, events };
}

function handleTimeoutTurn(state: GameState, rng: RngFn): ActionResult {
  if (state.pendingAction) {
    switch (state.pendingAction.type) {
      case 'drawn_playable':
        return handleKeepDrawn(state, state.pendingAction.playerId);
      case 'wild_four_challenge':
        return handleRespondWildFour(state, state.pendingAction.challengerId, false, rng);
      case 'choose_swap_target': {
        const actorId = state.pendingAction.playerId;
        const opponents = state.players.filter((p) => !p.eliminated && p.id !== actorId);
        if (opponents.length === 0) {
          state.pendingAction = null;
          return { ok: true, state, events: [] };
        }
        // Pick opponent with fewest cards on timeout.
        const bestTarget = opponents.reduce((min, p) => (p.hand.length < min.hand.length ? p : min));
        return handleChooseSwapTarget(state, actorId, bestTarget.id);
      }
    }
  }

  const current = state.players[state.currentPlayerIndex];
  if (!current) return fail('INVALID_PLAYER', 'No active current player.');

  const drawnResult = handleDrawCard(state, current.id, rng);
  if (!drawnResult.ok) return drawnResult;

  // On timeout, if the drawn card happens to trigger drawn_playable, automatically keep it so turn moves on.
  if (drawnResult.state.pendingAction?.type === 'drawn_playable') {
    const keepResult = handleKeepDrawn(drawnResult.state, current.id);
    if (!keepResult.ok) return keepResult;
    return {
      ok: true,
      state: keepResult.state,
      events: [...drawnResult.events, ...keepResult.events],
    };
  }

  return drawnResult;
}

/** Applies a player or server-timeout action to `prevState` cleanly without mutating inputs. */
export function applyGameAction(
  prevState: GameState,
  action: GameAction,
  rng: RngFn = Math.random
): ActionResult {
  if (prevState.phase !== 'playing') {
    return fail('MATCH_OVER', 'The current round or match is not in playing phase.');
  }

  const state = cloneState(prevState);

  switch (action.type) {
    case 'play_card':
      return handlePlayCard(state, action, rng);
    case 'draw_card':
      return handleDrawCard(state, action.playerId, rng);
    case 'keep_drawn':
      return handleKeepDrawn(state, action.playerId);
    case 'choose_swap_target':
      return handleChooseSwapTarget(state, action.playerId, action.targetPlayerId);
    case 'respond_wild_four':
      return handleRespondWildFour(state, action.playerId, action.challenge, rng);
    case 'call_uno':
      return handleCallUno(state, action.playerId);
    case 'catch_uno':
      return handleCatchUno(state, action.playerId, action.targetPlayerId, rng);
    case 'timeout_turn':
      return handleTimeoutTurn(state, rng);
  }
}

function sanitizePendingAction(pending: GameState['pendingAction']): ClientPendingAction | null {
  if (!pending) return null;
  if (pending.type === 'wild_four_challenge') {
    return {
      type: 'wild_four_challenge',
      offenderId: pending.offenderId,
      challengerId: pending.challengerId,
      previousActiveColor: pending.previousActiveColor,
    };
  }
  return { ...pending };
}

/** Projects authoritative GameState into a safe per-viewer ClientGameState (no opponent hand leaks). */
export function sanitizeStateForPlayer(state: GameState, viewerId: string): ClientGameState {
  const viewer = state.players.find((p) => p.id === viewerId);
  const { playableCardIds, jumpInCardIds } = viewer
    ? getPlayableCardsForPlayer(state, viewerId)
    : { playableCardIds: [], jumpInCardIds: [] };

  const currentPlayer = state.players[state.currentPlayerIndex];
  const topCard = state.discardPile[state.discardPile.length - 1];

  return {
    roundNumber: state.roundNumber,
    phase: state.phase,
    config: {
      ...state.config,
      rules: { ...state.config.rules },
    },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarId: p.avatarId,
      isBot: p.isBot,
      handCount: p.hand.length,
      score: p.score,
      eliminated: p.eliminated,
      connected: p.connected,
      unoSafe: p.unoSafe,
    })),
    myPlayerId: viewerId,
    myHand: viewer ? viewer.hand.map((c) => ({ ...c })) : [],
    playableCardIds,
    jumpInCardIds,
    currentPlayerId: currentPlayer?.id ?? '',
    direction: state.direction,
    activeSide: state.activeSide,
    activeColor: state.activeColor,
    topCard,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    drawPenalty: state.drawPenalty ? { ...state.drawPenalty } : null,
    pendingAction: sanitizePendingAction(state.pendingAction),
    unoVulnerablePlayerId: state.unoVulnerablePlayerId,
    roundWinnerId: state.roundWinnerId,
    matchWinnerId: state.matchWinnerId,
    lastRoundPoints: state.lastRoundPoints,
    turnCounter: state.turnCounter,
  };
}
