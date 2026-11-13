import { motion } from 'framer-motion';
import { getActiveFace, type Card, type TableSide } from '@uno/shared';
import { CARD_PALETTE } from '../../theme/tableThemes.js';
import { CardArtwork, getCornerText } from './CardArtwork.js';
import { ColorGlyph } from './ColorGlyph.js';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<CardSize, { box: string; corner: string; glyph: string }> = {
  xs: { box: 'w-11 h-16 rounded-lg', corner: 'text-[10px]', glyph: 'w-2 h-2' },
  sm: { box: 'w-14 h-20 rounded-xl', corner: 'text-[11px]', glyph: 'w-2.5 h-2.5' },
  md: { box: 'w-[74px] h-[108px] sm:w-[84px] sm:h-[122px] rounded-2xl', corner: 'text-xs sm:text-sm', glyph: 'w-2.5 h-2.5' },
  lg: { box: 'w-[86px] h-[126px] sm:w-[100px] sm:h-[146px] rounded-2xl', corner: 'text-sm sm:text-base', glyph: 'w-3 h-3' },
};

interface CardBackProps {
  side?: TableSide;
  size?: CardSize;
  className?: string;
}

/** Illustrated Multi-UNO card back adapting between Light Mode and Dark Flip Mode. */
export function CardBack({ side = 'light', size = 'md', className = '' }: CardBackProps) {
  const dims = SIZE_CLASSES[size];
  const isDark = side === 'dark';

  return (
    <div
      className={`relative overflow-hidden select-none border-[3px] shadow-card ${dims.box} ${
        isDark
          ? 'border-fuchsia-300/80 bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950'
          : 'border-white/95 bg-gradient-to-br from-slate-800 via-slate-900 to-black'
      } ${className}`}
    >
      <div
        className={`absolute inset-1 rounded-[10px] border ${
          isDark ? 'border-cyan-400/40' : 'border-red-500/35'
        }`}
      />
      <div
        className={`absolute inset-0 flex items-center justify-center`}
      >
        <div
          className={`w-[86%] h-[56%] rounded-[50%] -rotate-12 flex items-center justify-center shadow-inner ${
            isDark
              ? 'bg-gradient-to-br from-fuchsia-600 via-purple-700 to-cyan-600'
              : 'bg-gradient-to-br from-red-500 via-red-600 to-rose-700'
          }`}
        >
          <span
            className="font-display font-bold tracking-tight text-amber-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.65)]"
            style={{ fontSize: size === 'xs' ? '0.62rem' : size === 'sm' ? '0.8rem' : '1.15rem' }}
          >
            {isDark ? 'FLIP' : 'UNO'}
          </span>
        </div>
      </div>
    </div>
  );
}

interface UnoCardProps {
  card: Card;
  side: TableSide;
  size?: CardSize;
  playable?: boolean;
  jumpIn?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
}

/** Illustrated interactive Multi-UNO playing card with Light/Dark flip support and colorblind glyphs. */
export function UnoCard({
  card,
  side,
  size = 'md',
  playable = false,
  jumpIn = false,
  dimmed = false,
  selected = false,
  className = '',
  onClick,
}: UnoCardProps) {
  const face = getActiveFace(card, side);
  const token = CARD_PALETTE[face.color];
  const dims = SIZE_CLASSES[size];
  const cornerText = getCornerText(face);
  const isDarkSide = side === 'dark';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={playable || jumpIn ? { y: -8, scale: 1.04 } : undefined}
      whileTap={onClick ? { scale: 0.96 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={`group relative flex flex-col items-center justify-center overflow-hidden select-none text-left shadow-card transition-shadow ${
        dims.box
      } ${
        isDarkSide ? 'border-[3px] border-slate-950 ring-1 ring-white/25' : 'border-[3px] border-white'
      } ${
        selected ? 'ring-4 ring-amber-300 shadow-card-lift -translate-y-3' : ''
      } ${
        playable ? 'ring-2 ring-white/95 shadow-[0_0_20px_rgba(255,255,255,0.45)] cursor-pointer' : ''
      } ${
        jumpIn ? 'ring-2 ring-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.65)] cursor-pointer' : ''
      } ${dimmed ? 'opacity-55 saturate-[0.7]' : ''} ${className}`}
      style={{ background: token.bgGradient }}
      aria-label={`${token.label} ${cornerText}`}
    >
      {/* Subtle glossy highlight */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/30" />

      {/* Center slanted oval arena */}
      <div
        className={`pointer-events-none absolute w-[88%] h-[68%] -rotate-12 rounded-[50%] border-2 ${
          isDarkSide
            ? 'border-white/50 bg-slate-950/35'
            : 'border-white/75 bg-white/15'
        }`}
      />

      {/* Top-left corner index & colorblind shape */}
      <div
        className={`pointer-events-none absolute top-1 left-1.5 flex flex-col items-center leading-none font-display font-bold text-white drop-shadow-[0_1.5px_0_rgba(0,0,0,0.6)] ${dims.corner}`}
      >
        <span>{cornerText}</span>
        <ColorGlyph shape={token.shape} className={`${dims.glyph} mt-0.5 text-white/90`} />
      </div>

      {/* Bottom-right corner index & colorblind shape (inverted) */}
      <div
        className={`pointer-events-none absolute bottom-1 right-1.5 flex flex-col items-center leading-none font-display font-bold text-white drop-shadow-[0_1.5px_0_rgba(0,0,0,0.6)] rotate-180 ${dims.corner}`}
      >
        <span>{cornerText}</span>
        <ColorGlyph shape={token.shape} className={`${dims.glyph} mt-0.5 text-white/90`} />
      </div>

      {/* Center vector artwork */}
      <div className="relative z-10 flex items-center justify-center w-[66%] h-[58%]">
        <CardArtwork face={face} side={side} />
      </div>

      {/* Jump-In lightning badge */}
      {jumpIn && (
        <span className="pointer-events-none absolute top-1 right-1 rounded-full bg-cyan-400 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-950 shadow">
          Jump
        </span>
      )}
    </motion.button>
  );
}
