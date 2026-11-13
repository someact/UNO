import type {
  ActiveColor,
  CardColor,
  DarkColor,
  GameMode,
  HouseRules,
  LightColor,
  RoomConfig,
  TableSide,
} from './types.js';

export const LIGHT_COLORS: readonly LightColor[] = ['red', 'yellow', 'green', 'blue'] as const;
export const DARK_COLORS: readonly DarkColor[] = ['pink', 'teal', 'orange', 'purple'] as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface ModeMetadata {
  mode: GameMode;
  label: string;
  tagline: string;
  defaultConfig: Omit<RoomConfig, 'mode'>;
}

const CLASSIC_BASE: Omit<RoomConfig, 'mode'> = {
  maxPlayers: 6,
  turnTimerSeconds: 30,
  startingHandSize: 7,
  winTargetScore: 500,
  botDifficulty: 'smart',
  allowSpectators: true,
  isPublic: false,
  rules: {
    stacking: 'off',
    sevenZero: false,
    jumpIn: false,
    drawUntilPlayable: false,
    playDrawnCard: true,
    wildFourChallenge: true,
    mercyLimit: 0,
    allowDiscardAll: false,
  },
};

export const MODE_PRESETS: Record<GameMode, ModeMetadata> = {
  classic: {
    mode: 'classic',
    label: 'Classic UNO',
    tagline: 'Official rules with Wild +4 bluff challenges and Draw-1 play-or-keep.',
    defaultConfig: CLASSIC_BASE,
  },
  'no-mercy': {
    mode: 'no-mercy',
    label: 'UNO No Mercy',
    tagline: 'Stack +2/+4/+6/+10, 7-0 swaps, Discard All, and 25-card elimination.',
    defaultConfig: {
      ...CLASSIC_BASE,
      turnTimerSeconds: 30,
      winTargetScore: 0,
      rules: {
        stacking: 'same-or-higher',
        sevenZero: true,
        jumpIn: false,
        drawUntilPlayable: false,
        playDrawnCard: true,
        wildFourChallenge: false,
        mercyLimit: 25,
        allowDiscardAll: true,
      },
    },
  },
  flip: {
    mode: 'flip',
    label: 'UNO Flip!',
    tagline: 'Two-sided Light & Dark cards. Flip the whole table for +5 and Skip Everyone.',
    defaultConfig: {
      ...CLASSIC_BASE,
      turnTimerSeconds: 30,
      winTargetScore: 500,
      rules: {
        stacking: 'off',
        sevenZero: false,
        jumpIn: false,
        drawUntilPlayable: false,
        playDrawnCard: true,
        wildFourChallenge: false,
        mercyLimit: 0,
        allowDiscardAll: false,
      },
    },
  },
  blitz: {
    mode: 'blitz',
    label: 'Blitz / Speed UNO',
    tagline: 'Out-of-turn Jump-In matches, Draw Until Playable, and 15s turn clock.',
    defaultConfig: {
      ...CLASSIC_BASE,
      turnTimerSeconds: 15,
      winTargetScore: 0,
      rules: {
        stacking: 'same-or-higher',
        sevenZero: false,
        jumpIn: true,
        drawUntilPlayable: true,
        playDrawnCard: true,
        wildFourChallenge: false,
        mercyLimit: 0,
        allowDiscardAll: false,
      },
    },
  },
  custom: {
    mode: 'custom',
    label: 'Custom House Rules',
    tagline: 'Mix stacking, 7-0, Jump-In, Draw Until Playable, and starting hand sizes.',
    defaultConfig: {
      ...CLASSIC_BASE,
      rules: { ...CLASSIC_BASE.rules },
    },
  },
};

/** Returns a fresh deep-cloned RoomConfig with sensible defaults for the given mode. */
export function getDefaultRoomConfig(mode: GameMode): RoomConfig {
  const preset = MODE_PRESETS[mode].defaultConfig;
  return {
    mode,
    ...preset,
    rules: { ...preset.rules },
  };
}

/** Merges partial config overrides onto a mode's defaults and clamps bounds safely. */
export function resolveRoomConfig(
  mode: GameMode,
  overrides?: Partial<Omit<RoomConfig, 'mode' | 'rules'>> & { rules?: Partial<HouseRules> }
): RoomConfig {
  const base = getDefaultRoomConfig(mode);
  if (!overrides) return base;

  const clampedMaxPlayers = Math.max(
    MIN_PLAYERS,
    Math.min(MAX_PLAYERS, overrides.maxPlayers ?? base.maxPlayers)
  );

  const rawMercy = overrides.rules?.mercyLimit ?? base.rules.mercyLimit;
  const mercyLimit = rawMercy > 0 ? Math.max(10, Math.min(50, rawMercy)) : 0;

  return {
    ...base,
    ...overrides,
    mode,
    maxPlayers: clampedMaxPlayers,
    rules: {
      ...base.rules,
      ...overrides.rules,
      mercyLimit,
    },
  };
}

/** Returns the 4 valid non-wild colors for the active table side. */
export function getSideColors(side: TableSide): readonly ActiveColor[] {
  return side === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

/** Checks whether a color belongs to the given table side (non-wild). */
export function isValidColorForSide(color: CardColor | undefined, side: TableSide): color is ActiveColor {
  if (!color || color === 'wild') return false;
  return (getSideColors(side) as readonly string[]).includes(color);
}
