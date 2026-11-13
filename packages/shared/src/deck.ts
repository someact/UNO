import { DARK_COLORS, LIGHT_COLORS } from './presets.js';
import type {
  ActiveColor,
  Card,
  CardFace,
  CardKind,
  RngFn,
  RoomConfig,
  SortMode,
  TableSide,
} from './types.js';

let cardIdCounter = 0;

function nextCardId(prefix = 'card'): string {
  cardIdCounter += 1;
  return `${prefix}_${cardIdCounter}`;
}

export function getCardPoints(kind: CardKind, value?: number): number {
  switch (kind) {
    case 'number':
      return value ?? 0;
    case 'draw_one':
      return 10;
    case 'skip':
    case 'reverse':
    case 'draw_two':
    case 'flip':
    case 'discard_all':
      return 20;
    case 'draw_five':
    case 'skip_everyone':
      return 30;
    case 'wild':
      return 40;
    case 'wild_draw_two':
    case 'wild_draw_four':
    case 'wild_draw_six':
    case 'wild_draw_ten':
    case 'wild_draw_color':
      return 50;
  }
}

function makeFace(color: CardFace['color'], kind: CardKind, value?: number): CardFace {
  return {
    color,
    kind,
    ...(value !== undefined ? { value } : {}),
    points: getCardPoints(kind, value),
  };
}

/** Returns the face currently visible for a card given the active table side. */
export function getActiveFace(card: Card, side: TableSide): CardFace {
  if (side === 'dark' && card.dark) {
    return card.dark;
  }
  return card.light;
}

/** Fisher-Yates shuffle returning a new array without mutating the input. */
export function shuffleCards<T>(items: readonly T[], rng: RngFn = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pushRepeated(target: CardFace[], face: CardFace, count: number): void {
  for (let i = 0; i < count; i += 1) {
    target.push({ ...face });
  }
}

function buildStandardLightFaces(config: RoomConfig): CardFace[] {
  const faces: CardFace[] = [];
  const zeroCopies = config.mode === 'no-mercy' ? 2 : 1;

  for (const color of LIGHT_COLORS) {
    pushRepeated(faces, makeFace(color, 'number', 0), zeroCopies);
    for (let n = 1; n <= 9; n += 1) {
      pushRepeated(faces, makeFace(color, 'number', n), 2);
    }
    pushRepeated(faces, makeFace(color, 'skip'), 2);
    pushRepeated(faces, makeFace(color, 'reverse'), 2);
    pushRepeated(faces, makeFace(color, 'draw_two'), 2);
    if (config.rules.allowDiscardAll) {
      pushRepeated(faces, makeFace(color, 'discard_all'), 2);
    }
  }

  pushRepeated(faces, makeFace('wild', 'wild'), 4);
  pushRepeated(faces, makeFace('wild', 'wild_draw_four'), 4);

  if (config.mode === 'no-mercy') {
    pushRepeated(faces, makeFace('wild', 'wild_draw_six'), 2);
    pushRepeated(faces, makeFace('wild', 'wild_draw_ten'), 2);
  }

  return faces;
}

function buildFlipDeck(rng: RngFn, prefix: string): Card[] {
  const lightFaces: CardFace[] = [];
  const darkFaces: CardFace[] = [];

  for (const color of LIGHT_COLORS) {
    for (let n = 1; n <= 9; n += 1) {
      pushRepeated(lightFaces, makeFace(color, 'number', n), 2);
    }
    pushRepeated(lightFaces, makeFace(color, 'draw_one'), 2);
    pushRepeated(lightFaces, makeFace(color, 'skip'), 2);
    pushRepeated(lightFaces, makeFace(color, 'reverse'), 2);
    pushRepeated(lightFaces, makeFace(color, 'flip'), 2);
  }
  pushRepeated(lightFaces, makeFace('wild', 'wild'), 4);
  pushRepeated(lightFaces, makeFace('wild', 'wild_draw_two'), 4);

  for (const color of DARK_COLORS) {
    for (let n = 1; n <= 9; n += 1) {
      pushRepeated(darkFaces, makeFace(color, 'number', n), 2);
    }
    pushRepeated(darkFaces, makeFace(color, 'draw_five'), 2);
    pushRepeated(darkFaces, makeFace(color, 'skip_everyone'), 2);
    pushRepeated(darkFaces, makeFace(color, 'reverse'), 2);
    pushRepeated(darkFaces, makeFace(color, 'flip'), 2);
  }
  pushRepeated(darkFaces, makeFace('wild', 'wild'), 4);
  pushRepeated(darkFaces, makeFace('wild', 'wild_draw_color'), 4);

  const shuffledDark = shuffleCards(darkFaces, rng);
  return lightFaces.map((light, idx) => ({
    id: nextCardId(prefix),
    light,
    dark: shuffledDark[idx],
  }));
}

/** Creates and shuffles a full deck matching the RoomConfig mode and house rules. */
export function createDeckForConfig(
  config: RoomConfig,
  rng: RngFn = Math.random,
  idPrefix = 'c'
): Card[] {
  if (config.mode === 'flip') {
    return shuffleCards(buildFlipDeck(rng, idPrefix), rng);
  }

  const lightFaces = buildStandardLightFaces(config);
  const cards: Card[] = lightFaces.map((light) => ({
    id: nextCardId(idPrefix),
    light,
  }));
  return shuffleCards(cards, rng);
}

/** Generates a fresh auxiliary deck if both draw and discard piles run dry. */
export function createAuxiliaryDeck(config: RoomConfig, rng: RngFn = Math.random): Card[] {
  return createDeckForConfig(config, rng, 'aux');
}

const COLOR_SORT_ORDER: Record<CardFace['color'], number> = {
  red: 0,
  yellow: 1,
  green: 2,
  blue: 3,
  pink: 4,
  teal: 5,
  orange: 6,
  purple: 7,
  wild: 8,
};

const KIND_SORT_ORDER: Record<CardKind, number> = {
  number: 0,
  draw_one: 1,
  draw_two: 2,
  draw_five: 3,
  skip: 4,
  skip_everyone: 5,
  reverse: 6,
  flip: 7,
  discard_all: 8,
  wild: 9,
  wild_draw_two: 10,
  wild_draw_four: 11,
  wild_draw_six: 12,
  wild_draw_ten: 13,
  wild_draw_color: 14,
};

/** Sorts a hand either by color+rank or placing playable cards first. */
export function sortHand(
  hand: readonly Card[],
  side: TableSide,
  mode: SortMode = 'color',
  playableIds?: ReadonlySet<string>
): Card[] {
  return [...hand].sort((a, b) => {
    if (mode === 'playable' && playableIds) {
      const aPlayable = playableIds.has(a.id) ? 0 : 1;
      const bPlayable = playableIds.has(b.id) ? 0 : 1;
      if (aPlayable !== bPlayable) return aPlayable - bPlayable;
    }

    const fa = getActiveFace(a, side);
    const fb = getActiveFace(b, side);

    const colorDiff = COLOR_SORT_ORDER[fa.color] - COLOR_SORT_ORDER[fb.color];
    if (colorDiff !== 0) return colorDiff;

    const kindDiff = KIND_SORT_ORDER[fa.kind] - KIND_SORT_ORDER[fb.kind];
    if (kindDiff !== 0) return kindDiff;

    return (fa.value ?? 0) - (fb.value ?? 0);
  });
}

/** Calculates total penalty points held in a hand on the current side. */
export function calculateHandPoints(hand: readonly Card[], side: TableSide): number {
  return hand.reduce((sum, card) => sum + getActiveFace(card, side).points, 0);
}

/** Human-readable display label for a card face. */
export function getCardLabel(face: CardFace): string {
  const colorPrefix = face.color === 'wild' ? '' : `${face.color.toUpperCase()} `;
  switch (face.kind) {
    case 'number':
      return `${colorPrefix}${face.value ?? 0}`;
    case 'skip':
      return `${colorPrefix}SKIP`;
    case 'reverse':
      return `${colorPrefix}REVERSE`;
    case 'draw_one':
      return `${colorPrefix}+1`;
    case 'draw_two':
      return `${colorPrefix}+2`;
    case 'draw_five':
      return `${colorPrefix}+5`;
    case 'skip_everyone':
      return `${colorPrefix}SKIP ALL`;
    case 'flip':
      return `${colorPrefix}FLIP`;
    case 'discard_all':
      return `${colorPrefix}DISCARD ALL`;
    case 'wild':
      return 'WILD';
    case 'wild_draw_two':
      return 'WILD +2';
    case 'wild_draw_four':
      return 'WILD +4';
    case 'wild_draw_six':
      return 'WILD +6';
    case 'wild_draw_ten':
      return 'WILD +10';
    case 'wild_draw_color':
      return 'WILD DRAW COLOR';
  }
}

/** Picks a default fallback color if a timeout occurs while choosing a wild color. */
export function pickFallbackColor(hand: readonly Card[], side: TableSide): ActiveColor {
  const counts = new Map<ActiveColor, number>();
  for (const card of hand) {
    const face = getActiveFace(card, side);
    if (face.color !== 'wild') {
      counts.set(face.color, (counts.get(face.color) ?? 0) + 1);
    }
  }

  let bestColor: ActiveColor = side === 'dark' ? 'pink' : 'red';
  let bestCount = -1;
  for (const [color, count] of counts.entries()) {
    if (count > bestCount) {
      bestColor = color;
      bestCount = count;
    }
  }
  return bestColor;
}
