import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Flame, Hand, Keyboard, Layers, Shuffle, X, Zap } from 'lucide-react';
import { MODE_PRESETS, type GameMode } from '@uno/shared';

interface ModeRulesModalProps {
  open: boolean;
  activeMode?: GameMode;
  onClose: () => void;
}

const MODE_ORDER: GameMode[] = ['classic', 'no-mercy', 'flip', 'blitz', 'custom'];

const MODE_HIGHLIGHTS: Record<GameMode, string[]> = {
  classic: [
    'Match the top card by color, number, or symbol.',
    'Draw 1 lets you immediately play the drawn card or keep it.',
    'Wild +4 Bluff Challenge: next player can challenge! Guilty = +4 to player; Innocent = +6 to challenger.',
    'Press UNO! at 2 cards or immediately at 1 card before rivals hit Catch +2!',
  ],
  'no-mercy': [
    'Progressive Stacking: stack +2, +4, +6, or +10 with an equal or higher draw card.',
    '7-0 Rule: play 7 to swap hands with any rival; play 0 to rotate everyone’s hands.',
    'Discard All: drop every card in your hand matching that color at once.',
    'Mercy Rule: holding 25+ cards eliminates you immediately! Last standing or first to 0 wins.',
  ],
  flip: [
    'Two-sided Light & Dark deck—starts on Light Side.',
    'Play a Flip card to flip the entire table, deck, and every player’s hand!',
    'Dark Side cards: Draw +5, Skip Everyone (play again!), and Wild Draw Color (draw until color matches).',
  ],
  blitz: [
    'Jump-In: hold an exact color + value match? Play it out of turn anytime to steal momentum!',
    'Draw Until Playable: drawing pulls until you hit a usable card.',
    'Fast 15-second turn clock keeps every table moving.',
  ],
  custom: [
    'Host mixes and matches stacking, 7-0 swaps, Jump-In, Draw Until Playable, and Wild +4 Challenge.',
    'Customize starting hands (5, 7, or 10 cards) and round vs 250/500 point matches.',
  ],
};

/** 1-tap visual Mode Rules Cheat Sheet & Controls guide accessible from Lobby or Table. */
export function ModeRulesModal({ open, activeMode, onClose }: ModeRulesModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-5 h-5 text-amber-300" />
                <h2 className="font-display text-lg font-bold text-white">Game Modes & Controls</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
                aria-label="Close rules"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Controls Quick Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300 mb-1">
                    <Hand className="w-4 h-4" /> Phone & Tablet Touch
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Swipe <strong>left/right</strong> to scroll large hands, <strong>swipe up</strong> or{' '}
                    <strong>drag & drop</strong> onto the center pile to play, or <strong>tap once to preview</strong>{' '}
                    and tap again to confirm.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-cyan-300 mb-1">
                    <Keyboard className="w-4 h-4" /> Desktop Shortcuts
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Drag cards or double-click, or use <kbd className="rounded bg-white/15 px-1">←/→</kbd> /{' '}
                    <kbd className="rounded bg-white/15 px-1">1–9</kbd> +{' '}
                    <kbd className="rounded bg-white/15 px-1">Enter</kbd> to play,{' '}
                    <kbd className="rounded bg-white/15 px-1">Space</kbd> to draw,{' '}
                    <kbd className="rounded bg-white/15 px-1">U</kbd> for UNO!
                  </p>
                </div>
              </div>

              {/* Mode Cards */}
              <div className="space-y-3">
                {MODE_ORDER.map((mode) => {
                  const meta = MODE_PRESETS[mode];
                  const isCurrent = activeMode === mode;
                  const icon =
                    mode === 'no-mercy' ? (
                      <Flame className="w-4 h-4 text-rose-400" />
                    ) : mode === 'flip' ? (
                      <Shuffle className="w-4 h-4 text-fuchsia-400" />
                    ) : mode === 'blitz' ? (
                      <Zap className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Layers className="w-4 h-4 text-amber-300" />
                    );

                  return (
                    <div
                      key={mode}
                      className={`rounded-2xl border p-4 transition ${
                        isCurrent
                          ? 'border-amber-400/70 bg-amber-400/10'
                          : 'border-white/10 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {icon}
                          <h3 className="font-display text-sm font-bold text-white">{meta.label}</h3>
                        </div>
                        {isCurrent && (
                          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">
                            Active Mode
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                        {MODE_HIGHLIGHTS[mode].map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
