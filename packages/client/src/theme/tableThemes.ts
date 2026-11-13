import type { ActiveColor, CardColor, TableSide } from '@uno/shared';

export type TableThemeId = 'emerald' | 'neon' | 'wood';

export interface TableTheme {
  id: TableThemeId;
  name: string;
  tagline: string;
  backdropClass: string;
  surfaceGradient: string;
  rimBorder: string;
  panelBg: string;
  accentHex: string;
}

export const TABLE_THEMES: Record<TableThemeId, TableTheme> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald Felt',
    tagline: 'Classic tournament felt with warm gold trim',
    backdropClass: 'from-emerald-950 via-[#07261d] to-slate-950',
    surfaceGradient: 'radial-gradient(ellipse at 50% 44%, #115e46 0%, #093729 55%, #041d15 100%)',
    rimBorder: 'border-amber-400/25',
    panelBg: 'bg-emerald-950/75 border-emerald-400/20',
    accentHex: '#fbbf24',
  },
  neon: {
    id: 'neon',
    name: 'Neon Lounge',
    tagline: 'Electric midnight arcade arena',
    backdropClass: 'from-indigo-950 via-[#0b1029] to-slate-950',
    surfaceGradient: 'radial-gradient(ellipse at 50% 44%, #1e1b4b 0%, #0f172a 58%, #020617 100%)',
    rimBorder: 'border-cyan-400/30',
    panelBg: 'bg-slate-900/80 border-cyan-400/25',
    accentHex: '#22d3ee',
  },
  wood: {
    id: 'wood',
    name: 'Cozy Wood Café',
    tagline: 'Warm walnut tabletop & amber spotlight',
    backdropClass: 'from-stone-900 via-[#2a1a12] to-stone-950',
    surfaceGradient: 'radial-gradient(ellipse at 50% 44%, #5c3724 0%, #382015 56%, #190d08 100%)',
    rimBorder: 'border-amber-300/25',
    panelBg: 'bg-stone-900/80 border-amber-400/20',
    accentHex: '#f59e0b',
  },
};

export interface CardColorToken {
  label: string;
  hex: string;
  deepHex: string;
  glowRgba: string;
  ringClass: string;
  bgGradient: string;
  /** Distinct geometric shape for colorblind readability. */
  shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'star' | 'hex' | 'bolt' | 'clover' | 'prism';
}

export const CARD_PALETTE: Record<CardColor, CardColorToken> = {
  red: {
    label: 'Red',
    hex: '#ef4444',
    deepHex: '#991b1b',
    glowRgba: 'rgba(239, 68, 68, 0.55)',
    ringClass: 'ring-red-400',
    bgGradient: 'linear-gradient(145deg, #f87171 0%, #dc2626 52%, #991b1b 100%)',
    shape: 'circle',
  },
  yellow: {
    label: 'Yellow',
    hex: '#facc15',
    deepHex: '#b45309',
    glowRgba: 'rgba(250, 204, 21, 0.55)',
    ringClass: 'ring-yellow-300',
    bgGradient: 'linear-gradient(145deg, #fde047 0%, #eab308 55%, #b45309 100%)',
    shape: 'triangle',
  },
  green: {
    label: 'Green',
    hex: '#22c55e',
    deepHex: '#15803d',
    glowRgba: 'rgba(34, 197, 94, 0.55)',
    ringClass: 'ring-emerald-400',
    bgGradient: 'linear-gradient(145deg, #4ade80 0%, #16a34a 52%, #14532d 100%)',
    shape: 'square',
  },
  blue: {
    label: 'Blue',
    hex: '#3b82f6',
    deepHex: '#1d4ed8',
    glowRgba: 'rgba(59, 130, 246, 0.55)',
    ringClass: 'ring-blue-400',
    bgGradient: 'linear-gradient(145deg, #60a5fa 0%, #2563eb 52%, #1e3a8a 100%)',
    shape: 'diamond',
  },
  pink: {
    label: 'Pink',
    hex: '#ec4899',
    deepHex: '#9d174d',
    glowRgba: 'rgba(236, 72, 153, 0.6)',
    ringClass: 'ring-pink-400',
    bgGradient: 'linear-gradient(145deg, #f472b6 0%, #db2777 52%, #831843 100%)',
    shape: 'star',
  },
  teal: {
    label: 'Teal',
    hex: '#14b8a6',
    deepHex: '#0f766e',
    glowRgba: 'rgba(20, 184, 166, 0.6)',
    ringClass: 'ring-teal-300',
    bgGradient: 'linear-gradient(145deg, #2dd4bf 0%, #0d9488 52%, #134e4a 100%)',
    shape: 'hex',
  },
  orange: {
    label: 'Orange',
    hex: '#f97316',
    deepHex: '#9a3412',
    glowRgba: 'rgba(249, 115, 22, 0.6)',
    ringClass: 'ring-orange-400',
    bgGradient: 'linear-gradient(145deg, #fb923c 0%, #ea580c 52%, #7c2d12 100%)',
    shape: 'bolt',
  },
  purple: {
    label: 'Purple',
    hex: '#a855f7',
    deepHex: '#6b21a8',
    glowRgba: 'rgba(168, 85, 247, 0.6)',
    ringClass: 'ring-purple-400',
    bgGradient: 'linear-gradient(145deg, #c084fc 0%, #9333ea 52%, #4c1d95 100%)',
    shape: 'clover',
  },
  wild: {
    label: 'Wild',
    hex: '#1e293b',
    deepHex: '#0f172a',
    glowRgba: 'rgba(255, 255, 255, 0.4)',
    ringClass: 'ring-white',
    bgGradient: 'linear-gradient(145deg, #334155 0%, #0f172a 60%, #020617 100%)',
    shape: 'prism',
  },
};

/** Returns dynamic ambient glow styling for the center arena based on activeColor and side. */
export function getActiveTableGlowStyle(activeColor: ActiveColor, activeSide: TableSide) {
  const token = CARD_PALETTE[activeColor];
  return {
    boxShadow:
      activeSide === 'dark'
        ? `0 0 80px 10px ${token.glowRgba}, inset 0 0 60px rgba(15, 23, 42, 0.85)`
        : `0 0 65px 4px ${token.glowRgba}`,
    borderColor: token.hex,
  };
}
