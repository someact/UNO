import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, WifiOff } from 'lucide-react';
import type { ClientSeatPlayer, EmojiReaction, TableSide } from '@uno/shared';
import { AvatarIllustration } from '../avatars/AvatarIllustration.js';

interface SeatBadgeProps {
  player: ClientSeatPlayer;
  isHost: boolean;
  isCurrentTurn: boolean;
  isUnoVulnerable: boolean;
  activeSide: TableSide;
  turnDeadlineAt: number | null;
  turnTimerSeconds: number;
  latestReaction?: EmojiReaction | null;
  onCatchUno?: (playerId: string) => void;
  compact?: boolean;
}

/** Opponent seat badge with SVG turn countdown ring, mini card stack, UNO/CATCH badge, and floating reactions. */
export function SeatBadge({
  player,
  isHost,
  isCurrentTurn,
  isUnoVulnerable,
  activeSide,
  turnDeadlineAt,
  turnTimerSeconds,
  latestReaction,
  onCatchUno,
  compact = false,
}: SeatBadgeProps) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!isCurrentTurn || !turnDeadlineAt || turnTimerSeconds <= 0) {
      setProgress(1);
      return;
    }

    const totalMs = turnTimerSeconds * 1000;
    const update = () => {
      const remaining = Math.max(0, turnDeadlineAt - Date.now());
      setProgress(Math.min(1, remaining / totalMs));
    };
    update();
    const id = window.setInterval(update, 100);
    return () => window.clearInterval(id);
  }, [isCurrentTurn, turnDeadlineAt, turnTimerSeconds]);

  const radius = compact ? 22 : 26;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - progress);
  const ringUrgent = isCurrentTurn && progress < 0.28;
  const fanCount = Math.min(player.handCount, 4);

  return (
    <motion.div
      layout
      animate={{
        scale: isCurrentTurn ? 1.05 : 1,
        opacity: player.eliminated ? 0.45 : 1,
      }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className={`relative flex flex-col items-center gap-1 rounded-2xl px-2.5 py-2 backdrop-blur-md border transition-colors ${
        isCurrentTurn
          ? 'bg-slate-900/90 border-amber-300/80 shadow-[0_0_24px_rgba(251,191,36,0.35)]'
          : 'bg-slate-950/70 border-white/10'
      }`}
    >
      {/* Floating emoji reaction bubble */}
      <AnimatePresence>
        {latestReaction && (
          <motion.div
            key={latestReaction.id}
            initial={{ opacity: 0, y: 8, scale: 0.5 }}
            animate={{ opacity: 1, y: -28, scale: 1.2 }}
            exit={{ opacity: 0, y: -48, scale: 0.8 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none absolute -top-2 z-30 rounded-full bg-slate-900/90 px-2 py-0.5 text-lg shadow-lg border border-white/15"
          >
            {latestReaction.emoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar + Circular Turn Progress Ring */}
      <div className="relative flex items-center justify-center">
        <svg
          className={`-rotate-90 ${compact ? 'w-12 h-12' : 'w-14 h-14'}`}
          viewBox="0 0 60 60"
          aria-hidden="true"
        >
          <circle
            cx="30"
            cy="30"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="3.5"
          />
          {isCurrentTurn && (
            <circle
              cx="30"
              cy="30"
              r={radius}
              fill="none"
              stroke={ringUrgent ? '#fb7185' : '#fbbf24'}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <AvatarIllustration
            avatarId={player.avatarId}
            isBot={player.isBot}
            sizeClass={compact ? 'w-9 h-9' : 'w-11 h-11'}
          />
        </div>

        {isHost && (
          <span
            title="Room Host"
            className="absolute -top-1 -left-1 rounded-full bg-amber-400 p-0.5 text-slate-950 shadow"
          >
            <Crown className="w-2.5 h-2.5" />
          </span>
        )}

        {!player.connected && !player.isBot && (
          <span
            title="Disconnected"
            className="absolute -top-1 -right-1 rounded-full bg-rose-600 p-1 text-white shadow"
          >
            <WifiOff className="w-2.5 h-2.5" />
          </span>
        )}
      </div>

      {/* Player name + score */}
      <div className="flex items-center gap-1 max-w-[92px] sm:max-w-[112px]">
        <span className="truncate text-xs font-bold text-white">{player.name}</span>
      </div>

      {/* Mini fanned card backs + count pill */}
      {player.eliminated ? (
        <span className="rounded-full bg-rose-950/90 border border-rose-500/40 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
          Eliminated
        </span>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center h-5" style={{ width: `${Math.max(14, fanCount * 6 + 10)}px` }}>
            {Array.from({ length: fanCount }).map((_, idx) => (
              <span
                key={idx}
                className={`absolute top-0 h-5 w-3.5 rounded-[3px] border shadow-sm ${
                  activeSide === 'dark'
                    ? 'bg-purple-800 border-fuchsia-300/70'
                    : 'bg-slate-800 border-white/80'
                }`}
                style={{
                  left: `${idx * 5}px`,
                  transform: `rotate(${(idx - (fanCount - 1) / 2) * 8}deg)`,
                }}
              />
            ))}
          </div>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
              player.handCount === 1
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-white/15 text-slate-100'
            }`}
          >
            {player.handCount}
          </span>
        </div>
      )}

      {/* UNO Safe vs Catchable button */}
      {player.handCount === 1 && !player.eliminated && player.unoSafe && (
        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black tracking-wider text-slate-950 shadow">
          UNO!
        </span>
      )}

      {isUnoVulnerable && onCatchUno && (
        <button
          type="button"
          onClick={() => onCatchUno(player.id)}
          className="rounded-full bg-rose-500 hover:bg-rose-400 active:scale-95 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg animate-bounce"
        >
          Catch +2!
        </button>
      )}
    </motion.div>
  );
}
