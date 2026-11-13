import { describe, expect, it } from 'vitest';
import { AVATAR_IDS, DARK_COLORS, LIGHT_COLORS, type ClientSeatPlayer } from '@uno/shared';
import { orderOpponentsClockwise } from '../src/components/table/OpponentRing.js';
import { getCornerText } from '../src/components/card/CardArtwork.js';
import { soundEngine } from '../src/sound/soundEngine.js';
import {
  CARD_PALETTE,
  getActiveTableGlowStyle,
  TABLE_THEMES,
} from '../src/theme/tableThemes.js';

describe('@uno/client visual system & audio', () => {
  it('defines distinct colorblind shapes and palette tokens for all Light, Dark, and Wild colors', () => {
    expect(Object.keys(TABLE_THEMES)).toEqual(['emerald', 'neon', 'wood']);
    for (const color of [...LIGHT_COLORS, ...DARK_COLORS, 'wild'] as const) {
      expect(CARD_PALETTE[color]).toBeDefined();
      expect(CARD_PALETTE[color].hex).toMatch(/^#/);
    }

    const lightShapes = new Set(LIGHT_COLORS.map((c) => CARD_PALETTE[c].shape));
    const darkShapes = new Set(DARK_COLORS.map((c) => CARD_PALETTE[c].shape));
    expect(lightShapes.size).toBe(4);
    expect(darkShapes.size).toBe(4);

    const glow = getActiveTableGlowStyle('purple', 'dark');
    expect(glow.borderColor).toBe(CARD_PALETTE.purple.hex);
    expect(glow.boxShadow).toContain('inset');
  });

  it('orders 2-6 player opponents clockwise starting after myPlayerId', () => {
    const seats: ClientSeatPlayer[] = AVATAR_IDS.slice(0, 6).map((av, idx) => ({
      id: `p${idx + 1}`,
      name: `Player ${idx + 1}`,
      avatarId: av,
      isBot: false,
      handCount: 7,
      score: 0,
      eliminated: false,
      connected: true,
      unoSafe: false,
    }));

    const ordered = orderOpponentsClockwise(seats, 'p3');
    expect(ordered.map((p) => p.id)).toEqual(['p4', 'p5', 'p6', 'p1', 'p2']);
  });

  it('formats corner labels for all special cards and runs soundEngine safely in headless Node', () => {
    expect(getCornerText({ color: 'wild', kind: 'wild_draw_ten', points: 50 })).toBe('+10');
    expect(getCornerText({ color: 'purple', kind: 'skip_everyone', points: 30 })).toBe('⊘⊘');
    expect(getCornerText({ color: 'red', kind: 'discard_all', points: 20 })).toBe('ALL');

    soundEngine.setMuted(true);
    expect(soundEngine.isMuted()).toBe(true);
    soundEngine.playEvents([
      { type: 'round_started', roundNumber: 1, activeColor: 'red' },
      { type: 'table_flipped', activeSide: 'dark' },
      { type: 'uno_called', playerId: 'p1' },
      { type: 'match_ended', winnerId: 'p1', scores: { p1: 500 } },
    ]);
    soundEngine.setMuted(false);
  });
});
