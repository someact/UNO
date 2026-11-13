import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Crown,
  Flame,
  Gavel,
  Home,
  Play,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react';
import {
  getSideColors,
  type ActiveColor,
  type Card,
  type ClientGameState,
  type ClientSeatPlayer,
  type TableSide,
} from '@uno/shared';
import { CARD_PALETTE } from '../../theme/tableThemes.js';
import { AvatarIllustration } from '../avatars/AvatarIllustration.js';
import { ColorGlyph } from '../card/ColorGlyph.js';
import { UnoCard } from '../card/UnoCard.js';

interface WildColorWheelModalProps {
  open: boolean;
  card: Card | null;
  activeSide: TableSide;
  onSelectColor: (color: ActiveColor) => void;
  onCancel: () => void;
}

/** Radial 4-quadrant Wild Color Wheel with colorblind-friendly glyphs adapting to Light vs Dark side. */
export function WildColorWheelModal({
  open,
  card,
  activeSide,
  onSelectColor,
  onCancel,
}: WildColorWheelModalProps) {
  const colors = getSideColors(activeSide);

  return (
    <AnimatePresence>
      {open && card && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.86, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.86, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl"
          >
            <h2 className="font-display text-lg font-extrabold text-white">Choose Active Color</h2>
            <p className="mt-0.5 text-xs text-white/65 mb-5">
              Tap a quadrant to set the wild color on the table.
            </p>

            {/* Radial 2x2 Circular UNO Disc */}
            <div className="relative h-60 w-60 rounded-full p-1.5 bg-slate-950 border-4 border-white/20 shadow-2xl">
              <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-1.5 overflow-hidden rounded-full">
                {colors.map((color, idx) => {
                  const token = CARD_PALETTE[color];
                  const quadrantAlign =
                    idx === 0
                      ? 'items-end justify-end pr-6 pb-6'
                      : idx === 1
                        ? 'items-end justify-start pl-6 pb-6'
                        : idx === 2
                          ? 'items-start justify-end pr-6 pt-6'
                          : 'items-start justify-start pl-6 pt-6';
                  return (
                    <motion.button
                      key={color}
                      type="button"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => onSelectColor(color)}
                      className={`relative flex flex-col gap-1 text-white shadow-inner transition focus:outline-none focus:ring-2 focus:ring-white ${quadrantAlign}`}
                      style={{ background: token.bgGradient }}
                      aria-label={`Choose ${token.label}`}
                    >
                      <ColorGlyph shape={token.shape} className="w-6 h-6 drop-shadow" />
                      <span className="font-display text-xs font-black uppercase tracking-wider drop-shadow">
                        {token.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Centered preview card / Wild medallion */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl border-2 border-white/90 bg-slate-950 p-1 shadow-2xl">
                  <UnoCard card={card} side={activeSide} size="xs" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2 text-xs font-bold text-white/85 transition"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SwapTargetModalProps {
  open: boolean;
  opponents: readonly ClientSeatPlayer[];
  onChooseTarget: (targetPlayerId: string) => void;
}

/** 7-Swap Target Picker modal shown after playing a 7 when the 7-0 rule is enabled. */
export function SwapTargetModal({ open, opponents, onChooseTarget }: SwapTargetModalProps) {
  const eligible = opponents.filter((p) => !p.eliminated);
  const minCards = eligible.reduce((min, p) => Math.min(min, p.handCount), Infinity);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 12 }}
            className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900/95 p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-extrabold text-white">
                  Lucky 7 &mdash; Swap Hands!
                </h2>
                <p className="text-xs text-white/65">
                  Pick a player to trade your entire hand with.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {eligible.map((opp) => {
                const isBest = opp.handCount === minCards;
                return (
                  <button
                    key={opp.id}
                    type="button"
                    onClick={() => onChooseTarget(opp.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                      isBest
                        ? 'border-emerald-300/50 bg-emerald-500/15 hover:bg-emerald-500/25'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarIllustration avatarId={opp.avatarId} isBot={opp.isBot} sizeClass="w-10 h-10" />
                      <div className="min-w-0">
                        <div className="truncate font-bold text-sm text-white">{opp.name}</div>
                        <div className="text-[11px] text-white/65">
                          {opp.handCount} {opp.handCount === 1 ? 'card' : 'cards'} remaining
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isBest && (
                        <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">
                          Fewest!
                        </span>
                      )}
                      <span className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-extrabold text-white">
                        Swap
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface WildFourChallengeModalProps {
  open: boolean;
  offender: ClientSeatPlayer | undefined;
  previousActiveColor: ActiveColor;
  onRespond: (challenge: boolean) => void;
}

/** Official Wild +4 Bluff Challenge prompt shown to the targeted player. */
export function WildFourChallengeModal({
  open,
  offender,
  previousActiveColor,
  onRespond,
}: WildFourChallengeModalProps) {
  const prevToken = CARD_PALETTE[previousActiveColor];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 12 }}
            className="w-full max-w-md rounded-3xl border border-rose-400/30 bg-slate-900/95 p-5 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-300">
                <Gavel className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-extrabold text-white">
                  Wild +4 Challenge?
                </h2>
                <p className="text-xs text-white/70">
                  {offender?.name ?? 'Opponent'} dropped a Wild Draw Four on you!
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs text-white/80 space-y-2">
              <div className="flex items-center gap-2">
                <span>Previous table color was</span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-extrabold text-white shadow"
                  style={{ background: prevToken.bgGradient }}
                >
                  <ColorGlyph shape={prevToken.shape} className="w-3 h-3" />
                  {prevToken.label}
                </span>
              </div>
              <p className="leading-relaxed text-white/70">
                If they were bluffing and already held a <strong>{prevToken.label}</strong> card,
                catching them makes <strong>them draw 4 cards</strong>! If innocent,{' '}
                <strong>you draw 6 cards</strong> and lose your turn.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onRespond(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/20 px-4 py-3 text-xs sm:text-sm font-extrabold text-white transition active:scale-95"
              >
                <Check className="w-4 h-4 text-emerald-300" />
                Accept (+4)
              </button>
              <button
                type="button"
                onClick={() => onRespond(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-3 text-xs sm:text-sm font-black text-white shadow-lg hover:brightness-110 transition active:scale-95"
              >
                <AlertTriangle className="w-4 h-4" />
                Challenge Bluff!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface DrawnPlayableBannerProps {
  card: Card | undefined;
  activeSide: TableSide;
  onPlayDrawn: (card: Card) => void;
  onKeepDrawn: () => void;
}

/** Compact floating choice strip when the player draws 1 card that can be played right away. */
export function DrawnPlayableBanner({
  card,
  activeSide,
  onPlayDrawn,
  onKeepDrawn,
}: DrawnPlayableBannerProps) {
  if (!card) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mx-auto flex items-center gap-3 rounded-2xl border border-emerald-300/40 bg-slate-950/90 px-3.5 py-2 shadow-2xl backdrop-blur-xl"
    >
      <UnoCard card={card} side={activeSide} size="xs" playable />
      <div className="text-left">
        <div className="text-xs font-extrabold text-emerald-200">Playable Draw!</div>
        <div className="text-[11px] text-white/70">Play it now or keep it.</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPlayDrawn(card)}
          className="rounded-xl bg-emerald-400 hover:bg-emerald-300 px-3 py-1.5 text-xs font-black text-slate-950 transition active:scale-95"
        >
          Play Card
        </button>
        <button
          type="button"
          onClick={onKeepDrawn}
          className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95"
        >
          Keep
        </button>
      </div>
    </motion.div>
  );
}

interface ScorePodiumModalProps {
  gameState: ClientGameState;
  isHost: boolean;
  onNextRound: () => Promise<unknown>;
  onRematch: () => Promise<unknown>;
  onReturnToLobby: () => Promise<unknown>;
  onLeave: () => void;
}

/** Round Over & Match Over celebratory podium with points breakdown and Host Rematch/Next Round actions. */
export function ScorePodiumModal({
  gameState,
  isHost,
  onNextRound,
  onRematch,
  onReturnToLobby,
  onLeave,
}: ScorePodiumModalProps) {
  const [busy, setBusy] = useState(false);

  const isMatchOver = gameState.phase === 'match_over';
  const isRoundOver = gameState.phase === 'round_over';
  if (!isMatchOver && !isRoundOver) return null;

  const winnerId = isMatchOver
    ? gameState.matchWinnerId ?? gameState.roundWinnerId
    : gameState.roundWinnerId;
  const winner = gameState.players.find((p) => p.id === winnerId);
  const ranked = [...gameState.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.handCount - b.handCount;
  });

  const runAction = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-amber-300/30 bg-slate-900/95 shadow-2xl"
      >
        {/* Celebration Banner */}
        <div className="bg-gradient-to-r from-amber-500/25 via-orange-500/20 to-amber-500/25 border-b border-white/10 p-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg">
            {isMatchOver ? <Trophy className="w-6 h-6" /> : <Crown className="w-6 h-6" />}
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-black text-white">
            {isMatchOver ? 'Match Champion!' : `Round ${gameState.roundNumber} Complete!`}
          </h2>
          {winner && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-950/70 border border-amber-300/35 px-3.5 py-1">
              <AvatarIllustration avatarId={winner.avatarId} isBot={winner.isBot} sizeClass="w-6 h-6" />
              <span className="text-sm font-extrabold text-amber-200">{winner.name}</span>
              <span className="text-xs font-bold text-emerald-300">
                +{gameState.lastRoundPoints} pts
              </span>
            </div>
          )}
          <div className="mt-1.5 text-[11px] font-semibold text-white/60">
            {gameState.config.winTargetScore === 0
              ? 'Single-round match'
              : `Target score: ${gameState.config.winTargetScore} pts`}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="p-5 space-y-2 max-h-[42dvh] overflow-y-auto">
          {ranked.map((player, rankIdx) => {
            const isRoundWinner = player.id === gameState.roundWinnerId;
            return (
              <div
                key={player.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 ${
                  rankIdx === 0
                    ? 'border-amber-300/50 bg-amber-400/15'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      rankIdx === 0
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/10 text-white/75'
                    }`}
                  >
                    {rankIdx + 1}
                  </span>
                  <AvatarIllustration
                    avatarId={player.avatarId}
                    isBot={player.isBot}
                    sizeClass="w-8 h-8"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">
                      {player.name}
                      {player.id === gameState.myPlayerId ? ' (You)' : ''}
                    </div>
                    <div className="text-[11px] text-white/60">
                      {player.eliminated ? (
                        <span className="inline-flex items-center gap-1 text-rose-300 font-semibold">
                          <Flame className="w-3 h-3" /> Knocked out
                        </span>
                      ) : isRoundWinner ? (
                        <span className="text-emerald-300 font-semibold">Round winner (0 cards)</span>
                      ) : (
                        `${player.handCount} cards left`
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-display text-base font-black text-white">
                    {player.score}
                  </div>
                  <div className="text-[10px] font-bold uppercase text-white/50">pts</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Controls */}
        <div className="border-t border-white/10 bg-slate-950/60 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
          {isHost ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction(onReturnToLobby)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3.5 py-2.5 text-xs font-bold text-white transition"
              >
                <Home className="w-4 h-4" />
                Back to Lobby
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction(isMatchOver ? onRematch : onNextRound)}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-105 disabled:opacity-50"
              >
                {isMatchOver ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {busy ? 'Loading...' : isMatchOver ? 'Play Rematch' : 'Next Round'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onLeave}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3.5 py-2 text-xs font-bold text-white transition"
              >
                Leave Table
              </button>
              <span className="text-xs font-semibold text-white/65">
                Waiting for host to continue...
              </span>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
