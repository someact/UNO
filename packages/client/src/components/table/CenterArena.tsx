import { AnimatePresence, motion } from 'framer-motion';
import type { ActiveColor, Card, DrawPenaltyState, TableSide, TurnDirection } from '@uno/shared';
import { CARD_PALETTE, getActiveTableGlowStyle } from '../../theme/tableThemes.js';
import { ColorGlyph } from '../card/ColorGlyph.js';
import { CardBack, UnoCard } from '../card/UnoCard.js';

interface CenterArenaProps {
  topCard: Card;
  activeColor: ActiveColor;
  activeSide: TableSide;
  direction: TurnDirection;
  drawPileCount: number;
  drawPenalty: DrawPenaltyState | null;
  canDraw: boolean;
  highlightDrawHint: boolean;
  dropTargetActive?: boolean;
  onDrawCard?: () => void;
  onTapDiscard?: () => void;
  discardRef?: React.RefObject<HTMLDivElement | null>;
}

/** Animated center tabletop with Draw Deck, Discard Pile, spinning Direction Orbit, and Stack Penalty badge. */
export function CenterArena({
  topCard,
  activeColor,
  activeSide,
  direction,
  drawPileCount,
  drawPenalty,
  canDraw,
  highlightDrawHint,
  dropTargetActive = false,
  onDrawCard,
  onTapDiscard,
  discardRef,
}: CenterArenaProps) {
  const colorToken = CARD_PALETTE[activeColor];
  const glowStyle = getActiveTableGlowStyle(activeColor, activeSide);

  return (
    <div className="relative flex flex-col items-center justify-center py-2 sm:py-4">
      {/* Ambient oval table arena halo + spinning direction orbit */}
      <div
        className="relative flex items-center justify-center gap-5 sm:gap-9 rounded-[48px] border-2 px-6 py-5 sm:px-11 sm:py-7 backdrop-blur-sm transition-all duration-500"
        style={{
          ...glowStyle,
          backgroundColor:
            activeSide === 'dark' ? 'rgba(15, 10, 35, 0.72)' : 'rgba(2, 6, 23, 0.35)',
        }}
      >
        {/* Spinning directional arc SVG behind piles */}
        <motion.svg
          viewBox="0 0 280 170"
          className="pointer-events-none absolute inset-0 w-full h-full opacity-35"
          animate={{ rotate: direction === 1 ? [0, 360] : [360, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          aria-hidden="true"
        >
          <ellipse
            cx="140"
            cy="85"
            rx="126"
            ry="70"
            fill="none"
            stroke={colorToken.hex}
            strokeWidth="2.5"
            strokeDasharray="14 10"
          />
        </motion.svg>

        {/* Draw Pile Stack */}
        <div className="relative z-10 flex flex-col items-center gap-1.5">
          <div className="relative">
            {/* Layered deck shadow cards */}
            <div className="absolute top-1.5 left-1.5 opacity-60 pointer-events-none">
              <CardBack side={activeSide} size="md" />
            </div>
            <div className="absolute top-0.5 left-0.5 opacity-80 pointer-events-none">
              <CardBack side={activeSide} size="md" />
            </div>

            <motion.button
              type="button"
              onClick={onDrawCard}
              disabled={!canDraw}
              whileHover={canDraw ? { y: -4, scale: 1.03 } : undefined}
              whileTap={canDraw ? { scale: 0.96 } : undefined}
              animate={
                highlightDrawHint
                  ? { y: [0, -5, 0], boxShadow: ['0 0 0 rgba(251,191,36,0)', '0 0 26px rgba(251,191,36,0.75)', '0 0 0 rgba(251,191,36,0)'] }
                  : undefined
              }
              transition={highlightDrawHint ? { duration: 1.4, repeat: Infinity } : undefined}
              className={`relative rounded-2xl focus:outline-none ${
                canDraw ? 'cursor-pointer' : 'cursor-default opacity-90'
              }`}
              aria-label={`Draw card (${drawPileCount} left)`}
            >
              <CardBack side={activeSide} size="md" />
            </motion.button>
          </div>
          <span className="rounded-full bg-slate-950/80 border border-white/15 px-2 py-0.5 text-[10px] font-bold text-slate-300 tabular-nums">
            Deck · {drawPileCount}
          </span>
        </div>

        {/* Discard Pile */}
        <div ref={discardRef} className="relative z-10 flex flex-col items-center gap-1.5">
          <div
            className={`relative rounded-2xl transition-transform duration-150 ${
              dropTargetActive ? 'scale-110 ring-4 ring-amber-300 shadow-[0_0_32px_rgba(251,191,36,0.8)]' : ''
            }`}
          >
            {/* Under-card hints for physical stack depth */}
            <div className="pointer-events-none absolute inset-0 -rotate-6 opacity-45 scale-[0.96]">
              <CardBack side={activeSide} size="md" />
            </div>

            <AnimatePresence mode="popLayout">
              <motion.div
                key={`${topCard.id}-${activeSide}`}
                initial={{ scale: 0.72, y: 28, rotate: -14, opacity: 0.4 }}
                animate={{ scale: 1, y: 0, rotate: 3, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                <UnoCard card={topCard} side={activeSide} size="md" onClick={onTapDiscard} />
              </motion.div>
            </AnimatePresence>

            {/* Stacked Draw Penalty Banner */}
            <AnimatePresence>
              {drawPenalty && drawPenalty.amount > 0 && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="pointer-events-none absolute -top-3 -right-3 z-20 rounded-full bg-rose-600 border-2 border-white px-2.5 py-1 text-xs font-black text-white shadow-xl animate-pulse"
                >
                  +{drawPenalty.amount}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active Color & Direction Pill */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-950/85 border border-white/15 px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shadow-inner"
              style={{ backgroundColor: colorToken.hex }}
            >
              <ColorGlyph shape={colorToken.shape} className="w-2.5 h-2.5" />
            </span>
            <span>{colorToken.label}</span>
            <span className="text-white/40">•</span>
            <span className="text-amber-300" title={direction === 1 ? 'Clockwise' : 'Counter-clockwise'}>
              {direction === 1 ? '↻ CW' : '↺ CCW'}
            </span>
          </div>
        </div>
      </div>

      {/* UNO Flip Dark Side status ribbon */}
      <AnimatePresence>
        {activeSide === 'dark' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-2 rounded-full bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg"
          >
            Dark Side Active
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
