import { useMemo, useState } from 'react';
import {
  AVATAR_IDS,
  createMatchState,
  getDefaultRoomConfig,
  sanitizeStateForPlayer,
  type ActiveColor,
  type Card,
  type EmojiReaction,
  type TableSide,
  type TurnDirection,
} from '@uno/shared';
import { CardBack, UnoCard } from './components/card/UnoCard.js';
import { CenterArena } from './components/table/CenterArena.js';
import { OpponentRing } from './components/table/OpponentRing.js';
import { TopBar } from './components/table/TopBar.js';
import { soundEngine } from './sound/soundEngine.js';
import { TABLE_THEMES, type TableThemeId } from './theme/tableThemes.js';

const THEME_STORAGE_KEY = 'multi_uno_theme';

function loadSavedTheme(): TableThemeId {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'emerald' || val === 'neon' || val === 'wood') return val;
  } catch {
    // Ignore storage access errors.
  }
  return 'emerald';
}

const SHOWCASE_CARDS: Card[] = [
  { id: 's1', light: { color: 'red', kind: 'number', value: 7, points: 7 }, dark: { color: 'pink', kind: 'number', value: 7, points: 7 } },
  { id: 's2', light: { color: 'blue', kind: 'skip', points: 20 }, dark: { color: 'teal', kind: 'skip_everyone', points: 30 } },
  { id: 's3', light: { color: 'green', kind: 'reverse', points: 20 }, dark: { color: 'orange', kind: 'draw_five', points: 30 } },
  { id: 's4', light: { color: 'yellow', kind: 'discard_all', points: 20 }, dark: { color: 'purple', kind: 'flip', points: 20 } },
  { id: 's5', light: { color: 'wild', kind: 'wild_draw_four', points: 50 }, dark: { color: 'wild', kind: 'wild_draw_color', points: 50 } },
  { id: 's6', light: { color: 'wild', kind: 'wild_draw_ten', points: 50 }, dark: { color: 'wild', kind: 'wild', points: 40 } },
];

export function App() {
  const [themeId, setThemeId] = useState<TableThemeId>(loadSavedTheme);
  const [muted, setMuted] = useState(() => soundEngine.isMuted());
  const [hapticsEnabled, setHapticsEnabled] = useState(() => soundEngine.isHapticsEnabled());
  const [side, setSide] = useState<TableSide>('light');
  const [direction, setDirection] = useState<TurnDirection>(1);
  const [topIdx, setTopIdx] = useState(0);
  const [reactions, setReactions] = useState<Record<string, EmojiReaction>>({});

  const previewGame = useMemo(() => {
    const players = AVATAR_IDS.slice(0, 6).map((av, idx) => ({
      id: `p${idx + 1}`,
      name: idx === 0 ? 'You' : av.charAt(0).toUpperCase() + av.slice(1),
      avatarId: av,
      isBot: idx >= 4,
    }));
    const raw = createMatchState(players, getDefaultRoomConfig('no-mercy'));
    raw.players[2].hand = raw.players[2].hand.slice(0, 1);
    raw.players[2].unoSafe = true;
    raw.players[4].hand = raw.players[4].hand.slice(0, 1);
    raw.unoVulnerablePlayerId = 'p5';
    return sanitizeStateForPlayer(raw, 'p1');
  }, []);

  const theme = TABLE_THEMES[themeId];
  const topCard = SHOWCASE_CARDS[topIdx];
  const topFace = side === 'dark' && topCard.dark ? topCard.dark : topCard.light;
  const activeColor: ActiveColor =
    topFace.color === 'wild' ? (side === 'dark' ? 'purple' : 'red') : topFace.color;

  const handleThemeChange = (next: TableThemeId) => {
    soundEngine.unlock();
    setThemeId(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors.
    }
  };

  const handleFlip = () => {
    soundEngine.unlock();
    soundEngine.playFlipTable();
    setSide((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleCycleCard = () => {
    soundEngine.unlock();
    soundEngine.playCardSnap();
    setTopIdx((prev) => (prev + 1) % SHOWCASE_CARDS.length);
  };

  const handleTriggerReaction = (playerId: string) => {
    soundEngine.unlock();
    soundEngine.playTurnChime();
    setReactions((prev) => ({
      ...prev,
      [playerId]: {
        id: String(Date.now()),
        senderId: playerId,
        emoji: '🔥',
        timestamp: Date.now(),
      },
    }));
  };

  return (
    <div
      className={`relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden bg-gradient-to-b ${theme.backdropClass}`}
      style={{ backgroundImage: theme.surfaceGradient }}
      onPointerDown={() => soundEngine.unlock()}
    >
      <div className="pointer-events-none absolute inset-0 felt-texture" />

      <TopBar
        title="Multi-UNO Arena"
        subtitle="Phase 3 Visual Studio · Themes, SVG Cards & Audio"
        themeId={themeId}
        onChangeTheme={handleThemeChange}
        muted={muted}
        onToggleMute={() => {
          const next = !muted;
          soundEngine.setMuted(next);
          setMuted(next);
        }}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={() => {
          const next = !hapticsEnabled;
          soundEngine.setHapticsEnabled(next);
          setHapticsEnabled(next);
        }}
      />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-between py-2 overflow-y-auto no-scrollbar">
        <OpponentRing
          players={previewGame.players}
          myPlayerId="p1"
          hostId="p2"
          currentPlayerId="p3"
          unoVulnerablePlayerId={previewGame.unoVulnerablePlayerId}
          activeSide={side}
          turnDeadlineAt={Date.now() + 22_000}
          turnTimerSeconds={30}
          reactionsByPlayer={reactions}
          onCatchUno={(id) => {
            soundEngine.playPenaltyAlert();
            handleTriggerReaction(id);
          }}
        />

        <CenterArena
          topCard={topCard}
          activeColor={activeColor}
          activeSide={side}
          direction={direction}
          drawPileCount={84}
          drawPenalty={{ amount: 10, minDrawValue: 4 }}
          canDraw
          highlightDrawHint={false}
          onDrawCard={() => soundEngine.playCardDraw()}
          onTapDiscard={handleCycleCard}
        />

        {/* Phase 3 Card Gallery & Audio Control Strip */}
        <section className="safe-pb w-full max-w-4xl px-3">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleCycleCard}
              className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95"
            >
              Next Card
            </button>
            <button
              type="button"
              onClick={handleFlip}
              className="rounded-xl bg-fuchsia-500/25 hover:bg-fuchsia-500/40 border border-fuchsia-300/35 px-3 py-1.5 text-xs font-bold text-fuchsia-100 transition active:scale-95"
            >
              Flip Side ({side.toUpperCase()})
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playCardSnap();
                setDirection((d) => (d === 1 ? -1 : 1));
              }}
              className="rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-300/35 px-3 py-1.5 text-xs font-bold text-amber-100 transition active:scale-95"
            >
              Reverse Orbit
            </button>
            <button
              type="button"
              onClick={() => soundEngine.playUnoShout()}
              className="rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-300/35 px-3 py-1.5 text-xs font-bold text-rose-100 transition active:scale-95"
            >
              UNO SFX
            </button>
            <button
              type="button"
              onClick={() => soundEngine.playVictoryFanfare()}
              className="rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-300/35 px-3 py-1.5 text-xs font-bold text-emerald-100 transition active:scale-95"
            >
              Win SFX
            </button>
          </div>

          <div className="flex items-end justify-center gap-2 overflow-x-auto no-scrollbar py-2 px-2">
            <CardBack side={side} size="sm" />
            {SHOWCASE_CARDS.map((card, i) => (
              <UnoCard
                key={card.id}
                card={card}
                side={side}
                size="sm"
                playable={i === topIdx}
                onClick={() => {
                  soundEngine.playCardSnap();
                  setTopIdx(i);
                }}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
export default App;
