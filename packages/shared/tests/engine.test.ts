import { describe, expect, it } from 'vitest';
import {
  applyGameAction,
  calculateHandPoints,
  createDeckForConfig,
  createMatchState,
  DARK_COLORS,
  getActiveFace,
  getDefaultRoomConfig,
  LIGHT_COLORS,
  resolveRoomConfig,
  sanitizeStateForPlayer,
  sortHand,
  startNextRound,
  type Card,
  type CardFace,
  type GameState,
  type MatchPlayerInput,
} from '../src/index.js';

function makePlayers(count: number): MatchPlayerInput[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    avatarId: `av_${idx + 1}`,
    isBot: idx > 0,
  }));
}

function makeCard(id: string, light: CardFace, dark?: CardFace): Card {
  return dark ? { id, light, dark } : { id, light };
}

function face(color: CardFace['color'], kind: CardFace['kind'], value?: number): CardFace {
  return {
    color,
    kind,
    ...(value !== undefined ? { value } : {}),
    points: kind === 'number' ? (value ?? 0) : 20,
  };
}

function seededRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('@uno/shared presets & decks', () => {
  it('resolves mode presets and clamps invalid player/mercy limits', () => {
    const classic = getDefaultRoomConfig('classic');
    expect(classic.rules.wildFourChallenge).toBe(true);
    expect(classic.rules.stacking).toBe('off');

    const noMercy = getDefaultRoomConfig('no-mercy');
    expect(noMercy.rules.stacking).toBe('same-or-higher');
    expect(noMercy.rules.sevenZero).toBe(true);
    expect(noMercy.rules.mercyLimit).toBe(25);
    expect(noMercy.rules.allowDiscardAll).toBe(true);

    const clamped = resolveRoomConfig('custom', {
      maxPlayers: 12,
      rules: { mercyLimit: 3 },
    });
    expect(clamped.maxPlayers).toBe(6);
    expect(clamped.rules.mercyLimit).toBe(10);
  });

  it('builds expected deck sizes for Classic (108), No Mercy, and UNO Flip (112 dual-sided)', () => {
    const rng = seededRng(1);
    const classicDeck = createDeckForConfig(getDefaultRoomConfig('classic'), rng);
    expect(classicDeck).toHaveLength(108);

    const noMercyDeck = createDeckForConfig(getDefaultRoomConfig('no-mercy'), rng);
    expect(noMercyDeck.some((c) => c.light.kind === 'wild_draw_ten')).toBe(true);
    expect(noMercyDeck.some((c) => c.light.kind === 'discard_all')).toBe(true);

    const flipDeck = createDeckForConfig(getDefaultRoomConfig('flip'), rng);
    expect(flipDeck).toHaveLength(112);
    for (const card of flipDeck) {
      expect(card.dark).toBeDefined();
      expect(['red', 'yellow', 'green', 'blue', 'wild']).toContain(card.light.color);
      expect(['pink', 'teal', 'orange', 'purple', 'wild']).toContain(card.dark!.color);
    }
  });

  it('sorts hands by color or playable-first and calculates points accurately', () => {
    const hand: Card[] = [
      makeCard('c1', face('blue', 'number', 9)),
      makeCard('c2', face('wild', 'wild_draw_four')),
      makeCard('c3', face('red', 'number', 2)),
    ];
    const byColor = sortHand(hand, 'light', 'color');
    expect(byColor.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);

    const byPlayable = sortHand(hand, 'light', 'playable', new Set(['c2']));
    expect(byPlayable[0].id).toBe('c2');
    expect(calculateHandPoints(hand, 'light')).toBe(31);
  });

  it('initializes 6-player matches across all 5 modes and rejects <2 or >6 players', () => {
    const rng = seededRng(9);
    const players6 = makePlayers(6);
    for (const mode of ['classic', 'no-mercy', 'flip', 'blitz', 'custom'] as const) {
      const state = createMatchState(players6, getDefaultRoomConfig(mode), rng);
      expect(state.players).toHaveLength(6);
      expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
      const topFace = getActiveFace(state.discardPile[0], state.activeSide);
      expect(topFace.kind).toBe('number');
    }

    expect(() => createMatchState(makePlayers(1), getDefaultRoomConfig('classic'))).toThrow();
    expect(() => createMatchState(makePlayers(7), getDefaultRoomConfig('classic'))).toThrow();
  });
});

describe('@uno/shared Classic UNO rules', () => {
  it('enforces turn order, validates plays cleanly, and does not mutate input state', () => {
    const config = getDefaultRoomConfig('classic');
    const state = createMatchState(makePlayers(4), config, seededRng(7));
    const snapshot = JSON.stringify(state);

    // Wrong player cannot draw.
    const wrongTurn = applyGameAction(state, { type: 'draw_card', playerId: 'p2' });
    expect(wrongTurn.ok).toBe(false);
    if (!wrongTurn.ok) expect(wrongTurn.code).toBe('NOT_YOUR_TURN');

    // Original state remains untouched.
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('handles 2-player Reverse as Skip and 3+ player Reverse as direction toggle', () => {
    const config = getDefaultRoomConfig('classic');
    const twoP = createMatchState(makePlayers(2), config, seededRng(10));
    twoP.discardPile = [makeCard('top', face('red', 'number', 5))];
    twoP.activeColor = 'red';
    twoP.players[0].hand = [
      makeCard('r1', face('red', 'reverse')),
      makeCard('r2', face('red', 'number', 3)),
    ];

    const res2P = applyGameAction(twoP, { type: 'play_card', playerId: 'p1', cardId: 'r1' });
    expect(res2P.ok).toBe(true);
    if (res2P.ok) {
      expect(res2P.state.currentPlayerIndex).toBe(0);
      expect(res2P.events.some((e) => e.type === 'turn_skipped')).toBe(true);
    }

    const fourP = createMatchState(makePlayers(4), config, seededRng(11));
    fourP.discardPile = [makeCard('top', face('blue', 'number', 4))];
    fourP.activeColor = 'blue';
    fourP.players[0].hand = [
      makeCard('r1', face('blue', 'reverse')),
      makeCard('r2', face('blue', 'number', 9)),
    ];

    const res4P = applyGameAction(fourP, { type: 'play_card', playerId: 'p1', cardId: 'r1' });
    expect(res4P.ok).toBe(true);
    if (res4P.ok) {
      expect(res4P.state.direction).toBe(-1);
      expect(res4P.state.currentPlayerIndex).toBe(3);
    }
  });

  it('supports Draw-1 Play-or-Keep and auxiliary deck replenishment when draw & discard empty', () => {
    const config = getDefaultRoomConfig('classic');
    const state = createMatchState(makePlayers(2), config, seededRng(15));
    state.discardPile = [makeCard('top', face('green', 'number', 6))];
    state.activeColor = 'green';
    state.drawPile = [makeCard('d1', face('green', 'number', 8))];
    state.players[0].hand = [makeCard('h1', face('red', 'number', 1))];

    const drawn = applyGameAction(state, { type: 'draw_card', playerId: 'p1' });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.state.pendingAction).toEqual({
      type: 'drawn_playable',
      playerId: 'p1',
      cardId: 'd1',
    });

    // Player keeps the card instead of playing it -> turn advances.
    const kept = applyGameAction(drawn.state, { type: 'keep_drawn', playerId: 'p1' });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.state.currentPlayerIndex).toBe(1);
    expect(kept.state.pendingAction).toBeNull();

    // Next draw with empty drawPile & 1-card discardPile triggers auxiliary deck generation.
    expect(kept.state.drawPile).toHaveLength(0);
    const auxDraw = applyGameAction(kept.state, { type: 'draw_card', playerId: 'p2' });
    expect(auxDraw.ok).toBe(true);
    if (auxDraw.ok) {
      expect(auxDraw.state.players[1].hand.length).toBeGreaterThan(kept.state.players[1].hand.length);
      expect(auxDraw.state.drawPile.length).toBeGreaterThan(50);
    }
  });

  it('resolves Wild +4 Bluff Challenge for both guilty (+4 offender) and innocent (+6 challenger)', () => {
    const config = getDefaultRoomConfig('classic');
    const base = createMatchState(makePlayers(3), config, seededRng(21));
    base.discardPile = [makeCard('top', face('red', 'number', 2))];
    base.activeColor = 'red';

    // Case 1: Guilty bluff (p1 holds another red card)
    const guiltyState: GameState = {
      ...base,
      players: base.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              hand: [
                makeCard('w4', face('wild', 'wild_draw_four')),
                makeCard('red5', face('red', 'number', 5)),
              ],
            }
          : p
      ),
    };

    const playedGuilty = applyGameAction(guiltyState, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'w4',
      chosenColor: 'blue',
    });
    expect(playedGuilty.ok).toBe(true);
    if (!playedGuilty.ok) return;
    expect(playedGuilty.state.pendingAction?.type).toBe('wild_four_challenge');

    const challengedGuilty = applyGameAction(playedGuilty.state, {
      type: 'respond_wild_four',
      playerId: 'p2',
      challenge: true,
    });
    expect(challengedGuilty.ok).toBe(true);
    if (!challengedGuilty.ok) return;
    expect(challengedGuilty.state.players[0].hand).toHaveLength(5); // 1 remaining + 4 penalty
    expect(challengedGuilty.state.currentPlayerIndex).toBe(1); // p2 keeps turn

    // Case 2: Innocent play (p1 holds NO red cards)
    const innocentState: GameState = {
      ...base,
      players: base.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              hand: [
                makeCard('w4', face('wild', 'wild_draw_four')),
                makeCard('blue5', face('blue', 'number', 5)),
              ],
            }
          : p
      ),
    };

    const playedInnocent = applyGameAction(innocentState, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'w4',
      chosenColor: 'green',
    });
    expect(playedInnocent.ok).toBe(true);
    if (!playedInnocent.ok) return;

    const p2StartCount = playedInnocent.state.players[1].hand.length;
    const challengedInnocent = applyGameAction(playedInnocent.state, {
      type: 'respond_wild_four',
      playerId: 'p2',
      challenge: true,
    });
    expect(challengedInnocent.ok).toBe(true);
    if (challengedInnocent.ok) {
      expect(challengedInnocent.state.players[1].hand).toHaveLength(p2StartCount + 6);
      expect(challengedInnocent.state.currentPlayerIndex).toBe(2); // p2 loses turn
    }
  });

  it('tracks UNO call safety, CATCH! +2 penalty, last-card draw scoring, and multi-round matches', () => {
    const config = resolveRoomConfig('classic', { winTargetScore: 20 });
    const state = createMatchState(makePlayers(2), config, seededRng(30));
    state.discardPile = [makeCard('top', face('yellow', 'number', 4))];
    state.activeColor = 'yellow';
    state.players[0].hand = [
      makeCard('a1', face('yellow', 'number', 7)),
      makeCard('a2', face('yellow', 'draw_two')),
    ];
    state.players[1].hand = [makeCard('b1', face('blue', 'number', 9))];

    // Play down to 1 without calling UNO -> p2 catches p1 for +2 cards.
    const dropToOne = applyGameAction(state, { type: 'play_card', playerId: 'p1', cardId: 'a1' });
    expect(dropToOne.ok).toBe(true);
    if (!dropToOne.ok) return;
    expect(dropToOne.state.unoVulnerablePlayerId).toBe('p1');

    const caught = applyGameAction(dropToOne.state, {
      type: 'catch_uno',
      playerId: 'p2',
      targetPlayerId: 'p1',
    });
    expect(caught.ok).toBe(true);
    if (!caught.ok) return;
    expect(caught.state.players[0].hand).toHaveLength(3);
    expect(caught.state.unoVulnerablePlayerId).toBeNull();

    // Pre-calling UNO protects p1; playing +2 as final card forces victim draw before scoring.
    const preCall = applyGameAction(state, { type: 'call_uno', playerId: 'p1' });
    expect(preCall.ok).toBe(true);
    if (!preCall.ok) return;
    const safeDrop = applyGameAction(preCall.state, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'a1',
    });
    expect(safeDrop.ok).toBe(true);
    if (!safeDrop.ok) return;
    expect(safeDrop.state.unoVulnerablePlayerId).toBeNull();

    // Move back to p1 by having p2 draw/pass, then p1 finishes on +2.
    safeDrop.state.currentPlayerIndex = 0;
    const winOnDrawTwo = applyGameAction(safeDrop.state, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'a2',
    });
    expect(winOnDrawTwo.ok).toBe(true);
    if (!winOnDrawTwo.ok) return;
    expect(winOnDrawTwo.state.players[1].hand).toHaveLength(3); // 1 + 2 last-card penalty
    expect(winOnDrawTwo.state.roundWinnerId).toBe('p1');
    expect(winOnDrawTwo.state.lastRoundPoints).toBeGreaterThanOrEqual(9);

    if (winOnDrawTwo.state.phase === 'round_over') {
      const nextRound = startNextRound(winOnDrawTwo.state, seededRng(31));
      expect(nextRound.ok).toBe(true);
      if (nextRound.ok) {
        expect(nextRound.state.roundNumber).toBe(2);
        expect(nextRound.state.players[0].score).toBe(winOnDrawTwo.state.players[0].score);
      }
    }
  });
});

describe('@uno/shared UNO No Mercy rules', () => {
  it('supports progressive draw stacking (+2 -> +4 -> +10) and blocks lower draw cards', () => {
    const config = getDefaultRoomConfig('no-mercy');
    const state = createMatchState(makePlayers(3), config, seededRng(40));
    state.discardPile = [makeCard('top', face('red', 'number', 3))];
    state.activeColor = 'red';
    state.players[0].hand = [
      makeCard('p1_d2', face('red', 'draw_two')),
      makeCard('p1_x', face('red', 'number', 9)),
    ];
    state.players[1].hand = [
      makeCard('p2_w4', face('wild', 'wild_draw_four')),
      makeCard('p2_x', face('blue', 'number', 4)),
    ];
    state.players[2].hand = [
      makeCard('p3_d2', face('blue', 'draw_two')),
      makeCard('p3_w10', face('wild', 'wild_draw_ten')),
    ];

    const r1 = applyGameAction(state, { type: 'play_card', playerId: 'p1', cardId: 'p1_d2' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.drawPenalty).toEqual({ amount: 2, minDrawValue: 2 });

    const r2 = applyGameAction(r1.state, {
      type: 'play_card',
      playerId: 'p2',
      cardId: 'p2_w4',
      chosenColor: 'blue',
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.drawPenalty).toEqual({ amount: 6, minDrawValue: 4 });

    // p3 cannot stack +2 onto +4.
    const invalidLowStack = applyGameAction(r2.state, {
      type: 'play_card',
      playerId: 'p3',
      cardId: 'p3_d2',
    });
    expect(invalidLowStack.ok).toBe(false);

    // p3 CAN stack +10 onto +4 -> stack reaches 16.
    const r3 = applyGameAction(r2.state, {
      type: 'play_card',
      playerId: 'p3',
      cardId: 'p3_w10',
      chosenColor: 'green',
    });
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.state.drawPenalty).toEqual({ amount: 16, minDrawValue: 10 });

    // p1 accepts penalty draw -> receives 16 cards and turn advances.
    const p1Before = r3.state.players[0].hand.length;
    const drawStack = applyGameAction(r3.state, { type: 'draw_card', playerId: 'p1' });
    expect(drawStack.ok).toBe(true);
    if (drawStack.ok) {
      expect(drawStack.state.players[0].hand).toHaveLength(p1Before + 16);
      expect(drawStack.state.drawPenalty).toBeNull();
      expect(drawStack.state.currentPlayerIndex).toBe(1);
    }
  });

  it('implements 7-swap, 0-rotate, Discard All, and 25-card Mercy elimination', () => {
    const config = getDefaultRoomConfig('no-mercy');
    const state = createMatchState(makePlayers(3), config, seededRng(50));
    state.discardPile = [makeCard('top', face('green', 'number', 7))];
    state.activeColor = 'green';
    state.players[0].hand = [
      makeCard('s7', face('blue', 'number', 7)),
      makeCard('keep1', face('red', 'number', 1)),
    ];
    state.players[1].hand = [makeCard('p2c1', face('yellow', 'number', 8))];
    state.players[2].hand = [
      makeCard('p3c1', face('green', 'number', 2)),
      makeCard('p3c2', face('red', 'number', 5)),
    ];

    // Play 7 without swapTargetId -> enters choose_swap_target pending state.
    const play7 = applyGameAction(state, { type: 'play_card', playerId: 'p1', cardId: 's7' });
    expect(play7.ok).toBe(true);
    if (!play7.ok) return;
    expect(play7.state.pendingAction).toEqual({ type: 'choose_swap_target', playerId: 'p1' });

    const swapped = applyGameAction(play7.state, {
      type: 'choose_swap_target',
      playerId: 'p1',
      targetPlayerId: 'p2',
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.state.players[0].hand.map((c) => c.id)).toEqual(['p2c1']);
    expect(swapped.state.players[1].hand.map((c) => c.id)).toEqual(['keep1']);

    // Test Discard All drops every matching-color card at once.
    swapped.state.currentPlayerIndex = 2;
    swapped.state.discardPile = [makeCard('top2', face('red', 'number', 4))];
    swapped.state.activeColor = 'red';
    swapped.state.players[2].hand = [
      makeCard('da', face('red', 'discard_all')),
      makeCard('r1', face('red', 'number', 3)),
      makeCard('r2', face('red', 'skip')),
      makeCard('b1', face('blue', 'number', 9)),
    ];

    const discAll = applyGameAction(swapped.state, {
      type: 'play_card',
      playerId: 'p3',
      cardId: 'da',
    });
    expect(discAll.ok).toBe(true);
    if (!discAll.ok) return;
    expect(discAll.state.players[2].hand.map((c) => c.id)).toEqual(['b1']);

    // Test 25-card Mercy elimination & last-player-standing win.
    const mercyState = createMatchState(makePlayers(2), config, seededRng(51));
    mercyState.discardPile = [makeCard('top3', face('red', 'number', 1))];
    mercyState.activeColor = 'red';
    mercyState.drawPenalty = { amount: 20, minDrawValue: 10 };
    mercyState.players[0].hand = Array.from({ length: 6 }, (_, i) =>
      makeCard(`x${i}`, face('blue', 'number', (i % 9) + 1))
    );
    const mercyRes = applyGameAction(mercyState, { type: 'draw_card', playerId: 'p1' });
    expect(mercyRes.ok).toBe(true);
    if (mercyRes.ok) {
      expect(mercyRes.state.players[0].eliminated).toBe(true);
      expect(mercyRes.state.phase).toBe('match_over');
      expect(mercyRes.state.matchWinnerId).toBe('p2');
    }
  });

  it('rotates all active hands in turn direction when 0 is played under 7-0 rule', () => {
    const config = getDefaultRoomConfig('no-mercy');
    const state = createMatchState(makePlayers(3), config, seededRng(52));
    state.discardPile = [makeCard('top', face('yellow', 'number', 5))];
    state.activeColor = 'yellow';
    state.players[0].hand = [
      makeCard('z0', face('yellow', 'number', 0)),
      makeCard('h0', face('red', 'number', 2)),
    ];
    state.players[1].hand = [makeCard('h1', face('blue', 'number', 4))];
    state.players[2].hand = [makeCard('h2', face('green', 'number', 6))];

    const res = applyGameAction(state, { type: 'play_card', playerId: 'p1', cardId: 'z0' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players[0].hand.map((c) => c.id)).toEqual(['h2']);
      expect(res.state.players[1].hand.map((c) => c.id)).toEqual(['h0']);
      expect(res.state.players[2].hand.map((c) => c.id)).toEqual(['h1']);
    }
  });
});

describe('@uno/shared UNO Flip rules', () => {
  it('flips table between Light and Dark sides, enforces Dark colors, Skip Everyone, and Wild Draw Color', () => {
    const config = getDefaultRoomConfig('flip');
    const state = createMatchState(makePlayers(3), config, seededRng(60));
    state.discardPile = [makeCard('top', face('blue', 'number', 3), face('teal', 'number', 3))];
    state.activeColor = 'blue';

    const flipCard = makeCard('flp', face('blue', 'flip'), face('purple', 'flip'));
    const darkSkipAll = makeCard('dsa', face('red', 'number', 4), face('purple', 'skip_everyone'));
    const darkDrawColor = makeCard('wdc', face('green', 'number', 2), face('wild', 'wild_draw_color'));
    const darkExtra = makeCard('ext', face('yellow', 'number', 9), face('teal', 'number', 9));

    state.players[0].hand = [flipCard, darkSkipAll, darkDrawColor, darkExtra];
    state.players[1].hand = [makeCard('p2_1', face('yellow', 'number', 5), face('teal', 'number', 5))];
    state.players[2].hand = [makeCard('p3_1', face('red', 'number', 6), face('orange', 'number', 6))];

    // Play Flip -> activeSide becomes dark and activeColor becomes purple.
    const flipped = applyGameAction(state, { type: 'play_card', playerId: 'p1', cardId: 'flp' });
    expect(flipped.ok).toBe(true);
    if (!flipped.ok) return;
    expect(flipped.state.activeSide).toBe('dark');
    expect(flipped.state.activeColor).toBe('purple');
    expect(DARK_COLORS).toContain(flipped.state.activeColor);
    expect(flipped.state.currentPlayerIndex).toBe(1);

    // Reject Light color on Wild Draw Color while on Dark side.
    flipped.state.currentPlayerIndex = 0;
    const badColor = applyGameAction(flipped.state, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'wdc',
      chosenColor: LIGHT_COLORS[0],
    });
    expect(badColor.ok).toBe(false);
    if (!badColor.ok) expect(badColor.code).toBe('INVALID_COLOR');

    // Skip Everyone keeps turn on p1.
    const skipAll = applyGameAction(flipped.state, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'dsa',
    });
    expect(skipAll.ok).toBe(true);
    if (!skipAll.ok) return;
    expect(skipAll.state.currentPlayerIndex).toBe(0);

    // Wild Draw Color makes p2 draw until drawing an orange card, then skips p2 to p3!
    skipAll.state.drawPile = [
      makeCard('match_orange', face('red', 'number', 1), face('orange', 'number', 7)),
      makeCard('miss_teal', face('blue', 'number', 2), face('teal', 'number', 8)),
    ];
    const p2Start = skipAll.state.players[1].hand.length;
    const drawColorRes = applyGameAction(skipAll.state, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'wdc',
      chosenColor: 'orange',
    });
    expect(drawColorRes.ok).toBe(true);
    if (drawColorRes.ok) {
      expect(drawColorRes.state.players[1].hand).toHaveLength(p2Start + 2);
      expect(drawColorRes.state.currentPlayerIndex).toBe(2);
    }
  });

  it('flips activeSide before tallying round points when winning on a Flip card', () => {
    const config = getDefaultRoomConfig('flip');
    const state = createMatchState(makePlayers(2), config, seededRng(61));
    state.discardPile = [makeCard('top', face('red', 'number', 1), face('pink', 'number', 1))];
    state.activeColor = 'red';
    state.players[0].hand = [makeCard('win_flip', face('red', 'flip'), face('teal', 'flip'))];
    state.players[1].hand = [
      makeCard('opp1', face('blue', 'number', 1), { color: 'wild', kind: 'wild_draw_color', points: 50 }),
    ];

    const res = applyGameAction(state, { type: 'play_card', playerId: 'p1', cardId: 'win_flip' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.activeSide).toBe('dark');
      expect(res.state.phase).toBe('round_over');
      expect(res.state.lastRoundPoints).toBe(50);
    }
  });
});

describe('@uno/shared Blitz Jump-In, Draw-Until-Playable, Timeout & Sanitization', () => {
  it('allows out-of-turn Jump-In for identical cards and Draw-Until-Playable loops', () => {
    const config = getDefaultRoomConfig('blitz');
    const state = createMatchState(makePlayers(4), config, seededRng(70));
    state.discardPile = [makeCard('top', face('red', 'number', 5))];
    state.activeColor = 'red';
    state.currentPlayerIndex = 0;

    state.players[2].hand = [
      makeCard('exact', face('red', 'number', 5)),
      makeCard('other', face('blue', 'number', 1)),
    ];

    // Check sanitized view exposes jumpInCardIds to p3 without exposing p1's hand.
    const p3View = sanitizeStateForPlayer(state, 'p3');
    expect(p3View.jumpInCardIds).toEqual(['exact']);
    expect(p3View.playableCardIds).toEqual([]);
    expect('hand' in p3View.players[0]).toBe(false);

    // p3 jumps in out of turn! Turn advances from p3 -> p4 (index 3).
    const jumped = applyGameAction(state, {
      type: 'play_card',
      playerId: 'p3',
      cardId: 'exact',
    });
    expect(jumped.ok).toBe(true);
    if (!jumped.ok) return;
    expect(jumped.state.currentPlayerIndex).toBe(3);

    // p4 has no playable cards; drawPile has 2 non-matching then 1 matching -> draws 3 cards.
    jumped.state.players[3].hand = [makeCard('p4_bad', face('yellow', 'number', 9))];
    jumped.state.drawPile = [
      makeCard('match_blue5', face('blue', 'number', 5)),
      makeCard('miss1', face('green', 'number', 2)),
      makeCard('miss2', face('yellow', 'number', 3)),
    ];
    const drawLoop = applyGameAction(jumped.state, { type: 'draw_card', playerId: 'p4' });
    expect(drawLoop.ok).toBe(true);
    if (drawLoop.ok) {
      expect(drawLoop.state.players[3].hand).toHaveLength(4);
      expect(drawLoop.state.pendingAction).toEqual({
        type: 'drawn_playable',
        playerId: 'p4',
        cardId: 'match_blue5',
      });
    }
  });

  it('sanitizes Wild +4 secret flag and resolves timeouts safely', () => {
    const config = getDefaultRoomConfig('classic');
    const state = createMatchState(makePlayers(3), config, seededRng(80));
    state.discardPile = [makeCard('top', face('red', 'number', 4))];
    state.activeColor = 'red';
    state.players[0].hand = [
      makeCard('w4', face('wild', 'wild_draw_four')),
      makeCard('r8', face('red', 'number', 8)),
    ];

    const played = applyGameAction(state, {
      type: 'play_card',
      playerId: 'p1',
      cardId: 'w4',
      chosenColor: 'green',
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;

    const p2View = sanitizeStateForPlayer(played.state, 'p2');
    expect(p2View.pendingAction?.type).toBe('wild_four_challenge');
    if (p2View.pendingAction?.type === 'wild_four_challenge') {
      expect('offenderHadMatchingColor' in p2View.pendingAction).toBe(false);
    }

    // Timeout on Wild +4 challenge defaults to declining (draw 4 + skip).
    const timedOut = applyGameAction(played.state, { type: 'timeout_turn' });
    expect(timedOut.ok).toBe(true);
    if (timedOut.ok) {
      expect(timedOut.state.pendingAction).toBeNull();
      expect(timedOut.state.currentPlayerIndex).toBe(2);
    }
  });
});
