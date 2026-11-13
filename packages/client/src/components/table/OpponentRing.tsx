import type { ClientSeatPlayer, EmojiReaction, TableSide } from '@uno/shared';
import { SeatBadge } from './SeatBadge.js';

interface OpponentRingProps {
  players: readonly ClientSeatPlayer[];
  myPlayerId: string;
  hostId: string;
  currentPlayerId: string;
  unoVulnerablePlayerId: string | null;
  activeSide: TableSide;
  turnDeadlineAt: number | null;
  turnTimerSeconds: number;
  reactionsByPlayer: Record<string, EmojiReaction | undefined>;
  onCatchUno?: (playerId: string) => void;
}

/** Orders opponents clockwise starting from the seat immediately after `myPlayerId`. */
export function orderOpponentsClockwise(
  players: readonly ClientSeatPlayer[],
  myPlayerId: string
): ClientSeatPlayer[] {
  const myIndex = players.findIndex((p) => p.id === myPlayerId);
  if (myIndex === -1) return [...players];

  const ordered: ClientSeatPlayer[] = [];
  for (let offset = 1; offset < players.length; offset += 1) {
    ordered.push(players[(myIndex + offset) % players.length]);
  }
  return ordered;
}

/** Responsive 2-6 player opponent ring around the tabletop. */
export function OpponentRing({
  players,
  myPlayerId,
  hostId,
  currentPlayerId,
  unoVulnerablePlayerId,
  activeSide,
  turnDeadlineAt,
  turnTimerSeconds,
  reactionsByPlayer,
  onCatchUno,
}: OpponentRingProps) {
  const opponents = orderOpponentsClockwise(players, myPlayerId);
  const compact = opponents.length >= 4;

  return (
    <div className="w-full max-w-5xl mx-auto px-2 pt-1">
      <div className="flex flex-wrap items-start justify-center gap-2 sm:gap-4 md:gap-6">
        {opponents.map((opp) => (
          <SeatBadge
            key={opp.id}
            player={opp}
            isHost={opp.id === hostId}
            isCurrentTurn={opp.id === currentPlayerId}
            isUnoVulnerable={opp.id === unoVulnerablePlayerId}
            activeSide={activeSide}
            turnDeadlineAt={turnDeadlineAt}
            turnTimerSeconds={turnTimerSeconds}
            latestReaction={reactionsByPlayer[opp.id] ?? null}
            onCatchUno={onCatchUno}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
