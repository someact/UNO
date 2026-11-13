import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Eye, Flame, LogOut, Megaphone, ShieldAlert, Timer } from 'lucide-react';
import {
  MODE_PRESETS,
  getActiveFace,
  isWildKind,
  type ActiveColor,
  type Card,
  type ChatMessage,
  type ClientGameAction,
  type ClientGameState,
  type EmojiReaction,
  type GameMode,
  type LobbyRoomState,
  type SortMode,
} from '@uno/shared';
import type { ActionBanner } from '../../hooks/useUnoClient.js';
import { soundEngine } from '../../sound/soundEngine.js';
import type { TableThemeId } from '../../theme/tableThemes.js';
import { AvatarIllustration } from '../avatars/AvatarIllustration.js';
import { SocialPanel } from '../chat/SocialPanel.js';
import { PlayerHand } from '../hand/PlayerHand.js';
import {
  DrawnPlayableBanner,
  ScorePodiumModal,
  SwapTargetModal,
  WildColorWheelModal,
  WildFourChallengeModal,
} from '../modals/GameModals.js';
import { CenterArena } from './CenterArena.js';
import { OpponentRing } from './OpponentRing.js';
import { TopBar } from './TopBar.js';

interface GameTableProps {
  room: LobbyRoomState;
  gameState: ClientGameState;
  myPlayerId: string;
  chatMessages: readonly ChatMessage[];
  reactionsByPlayer: Record<string, EmojiReaction | undefined>;
  actionBanner: ActionBanner | null;
  themeId: TableThemeId;
  onChangeTheme: (id: TableThemeId) => void;
  muted: boolean;
  onToggleMute: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  onSendGameAction: (action: ClientGameAction) => Promise<unknown>;
  onNextRound: () => Promise<unknown>;
  onRematch: () => Promise<unknown>;
  onReturnToLobby: () => Promise<unknown>;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  onOpenRules: (mode: GameMode) => void;
}

/** Live multiplayer UNO tabletop with OpponentRing, animated CenterArena, gesture PlayerHand, and modals. */
export function GameTable({
  room,
  gameState,
  myPlayerId,
  chatMessages,
  reactionsByPlayer,
  actionBanner,
  themeId,
  onChangeTheme,
  muted,
  onToggleMute,
  hapticsEnabled,
  onToggleHaptics,
  onSendGameAction,
  onNextRound,
  onRematch,
  onReturnToLobby,
  onLeaveRoom,
  onSendChat,
  onSendReaction,
  onOpenRules,
}: GameTableProps) {
  const [sortMode, setSortMode] = useState<SortMode>('color');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [dropTargetActive, setDropTargetActive] = useState(false);
  const [wildChoiceCard, setWildChoiceCard] = useState<Card | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const discardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!room.turnDeadlineAt || gameState.phase !== 'playing') return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [room.turnDeadlineAt, gameState.phase]);

  const mePlayer = useMemo(
    () => gameState.players.find((p) => p.id === myPlayerId),
    [gameState.players, myPlayerId]
  );
  const isSpectator = !mePlayer;
  const isHost = room.hostId === myPlayerId;
  const isPlaying = gameState.phase === 'playing';
  const isMyTurn = isPlaying && gameState.currentPlayerId === myPlayerId;

  const myDrawnPlayableCard = useMemo(() => {
    const pa = gameState.pendingAction;
    if (!pa || pa.type !== 'drawn_playable' || pa.playerId !== myPlayerId) return undefined;
    return gameState.myHand.find((c) => c.id === pa.cardId);
  }, [gameState.myHand, gameState.pendingAction, myPlayerId]);

  const showSwapModal =
    isPlaying &&
    gameState.pendingAction?.type === 'choose_swap_target' &&
    gameState.pendingAction.playerId === myPlayerId;

  const challengePending =
    isPlaying &&
    gameState.pendingAction?.type === 'wild_four_challenge' &&
    gameState.pendingAction.challengerId === myPlayerId
      ? gameState.pendingAction
      : null;

  const canDraw =
    !isSpectator &&
    isMyTurn &&
    !mePlayer.eliminated &&
    gameState.pendingAction === null &&
    !wildChoiceCard;

  const hasEligibleCard =
    gameState.playableCardIds.length > 0 || gameState.jumpInCardIds.length > 0;
  const highlightDrawHint = canDraw && !hasEligibleCard;

  const eligibleForUno =
    !isSpectator &&
    isPlaying &&
    !mePlayer.eliminated &&
    !mePlayer.unoSafe &&
    (gameState.myHand.length === 1 ||
      (gameState.myHand.length === 2 && isMyTurn && gameState.playableCardIds.length > 0));

  const vulnerableOpponent =
    !isSpectator &&
    isPlaying &&
    gameState.unoVulnerablePlayerId &&
    gameState.unoVulnerablePlayerId !== myPlayerId
      ? gameState.players.find((p) => p.id === gameState.unoVulnerablePlayerId)
      : undefined;

  const canShortcutUno = Boolean(eligibleForUno || vulnerableOpponent);

  const myTurnSecondsLeft =
    isMyTurn && room.turnDeadlineAt && gameState.config.turnTimerSeconds > 0
      ? Math.max(0, Math.ceil((room.turnDeadlineAt - nowMs) / 1000))
      : null;

  // Trigger soft chime when turn arrives to human player
  const prevTurnRef = useRef<boolean>(false);
  useEffect(() => {
    if (isMyTurn && !prevTurnRef.current) {
      soundEngine.playTurnChime();
    }
    prevTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  const requestPlayCard = (cardId: string) => {
    if (!isPlaying || isSpectator) return;
    const card = gameState.myHand.find((c) => c.id === cardId);
    if (!card) return;

    const face = getActiveFace(card, gameState.activeSide);
    if (isWildKind(face.kind)) {
      setWildChoiceCard(card);
      return;
    }

    void onSendGameAction({ type: 'play_card', cardId: card.id });
  };

  const handleWildColorSelected = (color: ActiveColor) => {
    const targetCard = wildChoiceCard;
    setWildChoiceCard(null);
    if (!targetCard) return;
    void onSendGameAction({
      type: 'play_card',
      cardId: targetCard.id,
      chosenColor: color,
    });
  };

  const handleTapDiscard = () => {
    if (!selectedCardId) return;
    const isEligible =
      gameState.playableCardIds.includes(selectedCardId) ||
      gameState.jumpInCardIds.includes(selectedCardId);
    if (!isEligible) return;
    const id = selectedCardId;
    setSelectedCardId(null);
    requestPlayCard(id);
  };

  const handleTriggerUno = () => {
    soundEngine.unlock();
    if (vulnerableOpponent) {
      void onSendGameAction({ type: 'catch_uno', targetPlayerId: vulnerableOpponent.id });
      return;
    }
    if (eligibleForUno) {
      void onSendGameAction({ type: 'call_uno' });
    }
  };

  // Status banner when another player holds a blocking pending action (challenge / 7-swap)
  const pendingStatusText = useMemo(() => {
    const pa = gameState.pendingAction;
    if (!pa || !isPlaying) return null;
    if (pa.type === 'wild_four_challenge' && pa.challengerId !== myPlayerId) {
      const challenger = gameState.players.find((p) => p.id === pa.challengerId);
      return `${challenger?.name ?? 'Player'} is deciding whether to challenge Wild +4...`;
    }
    if (pa.type === 'choose_swap_target' && pa.playerId !== myPlayerId) {
      const actor = gameState.players.find((p) => p.id === pa.playerId);
      return `${actor?.name ?? 'Player'} is picking someone to swap hands with...`;
    }
    return null;
  }, [gameState.pendingAction, gameState.players, isPlaying, myPlayerId]);

  const myReaction = reactionsByPlayer[myPlayerId] ?? null;

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden">
      {/* Top Bar */}
      <TopBar
        title={`${room.roomId} · ${MODE_PRESETS[gameState.config.mode].label.replace('UNO ', '').replace(' / Speed UNO', '')}`}
        subtitle={`Round ${gameState.roundNumber}${
          gameState.config.winTargetScore > 0 ? ` • Target ${gameState.config.winTargetScore} pts` : ''
        }${gameState.config.mode === 'flip' ? ` • ${gameState.activeSide.toUpperCase()} SIDE` : ''}`}
        themeId={themeId}
        onChangeTheme={onChangeTheme}
        muted={muted}
        onToggleMute={onToggleMute}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={onToggleHaptics}
        rightSlot={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenRules(gameState.config.mode)}
              title="Game Rules & Controls"
              className="inline-flex items-center gap-1 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition active:scale-95"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden md:inline">Rules</span>
            </button>
            <button
              type="button"
              onClick={onLeaveRoom}
              title="Leave Room"
              className="inline-flex items-center gap-1 rounded-xl bg-slate-950/70 hover:bg-rose-950/80 border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-rose-200 backdrop-blur-md transition active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Leave</span>
            </button>
          </div>
        }
      />

      {/* Opponent Ring */}
      <OpponentRing
        players={gameState.players}
        myPlayerId={myPlayerId}
        hostId={room.hostId}
        currentPlayerId={gameState.currentPlayerId}
        unoVulnerablePlayerId={gameState.unoVulnerablePlayerId}
        activeSide={gameState.activeSide}
        turnDeadlineAt={room.turnDeadlineAt}
        turnTimerSeconds={gameState.config.turnTimerSeconds}
        reactionsByPlayer={reactionsByPlayer}
        onCatchUno={(targetPlayerId) => {
          soundEngine.unlock();
          void onSendGameAction({ type: 'catch_uno', targetPlayerId });
        }}
      />

      {/* Floating Event Toast / Pending Notice */}
      <div className="pointer-events-none relative z-20 flex h-8 items-center justify-center px-3">
        <AnimatePresence mode="wait">
          {actionBanner ? (
            <motion.div
              key={actionBanner.id}
              initial={{ opacity: 0, y: -8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.94 }}
              className={`rounded-full border px-3.5 py-1 text-xs font-extrabold shadow-lg backdrop-blur-md ${
                actionBanner.tone === 'flip'
                  ? 'border-fuchsia-300/60 bg-fuchsia-950/85 text-fuchsia-100'
                  : actionBanner.tone === 'uno'
                    ? 'border-amber-300/70 bg-amber-500/90 text-slate-950'
                    : actionBanner.tone === 'warn'
                      ? 'border-rose-300/60 bg-rose-950/85 text-rose-100'
                      : 'border-white/20 bg-slate-950/80 text-white'
              }`}
            >
              {actionBanner.text}
            </motion.div>
          ) : pendingStatusText ? (
            <motion.div
              key="pending-status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-full border border-cyan-300/40 bg-slate-950/80 px-3.5 py-1 text-xs font-bold text-cyan-100 backdrop-blur-md"
            >
              {pendingStatusText}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Center Arena */}
      <main className="relative flex-1 flex flex-col items-center justify-center min-h-0 px-3">
        <CenterArena
          topCard={gameState.topCard}
          activeColor={gameState.activeColor}
          activeSide={gameState.activeSide}
          direction={gameState.direction}
          drawPileCount={gameState.drawPileCount}
          drawPenalty={gameState.drawPenalty}
          canDraw={canDraw}
          highlightDrawHint={highlightDrawHint}
          dropTargetActive={dropTargetActive}
          onDrawCard={() => {
            soundEngine.unlock();
            void onSendGameAction({ type: 'draw_card' });
          }}
          onTapDiscard={handleTapDiscard}
          discardRef={discardRef}
        />
      </main>

      {/* Drawn Playable Quick Bar OR Self Seat Status + UNO/CATCH + Social Controls */}
      <div className="relative z-40 mx-auto w-full max-w-4xl px-3 sm:px-6 pb-1 flex flex-col gap-1.5">
        {myDrawnPlayableCard && isPlaying && (
          <DrawnPlayableBanner
            card={myDrawnPlayableCard}
            activeSide={gameState.activeSide}
            onPlayDrawn={(card) => {
              soundEngine.unlock();
              requestPlayCard(card.id);
            }}
            onKeepDrawn={() => {
              soundEngine.unlock();
              void onSendGameAction({ type: 'keep_drawn' });
            }}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Self Identity & Turn Indicator Chip */}
          {mePlayer ? (
            <div
              className={`relative flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 backdrop-blur-md transition ${
                mePlayer.eliminated
                  ? 'border-rose-400/30 bg-rose-950/60 opacity-75'
                  : isMyTurn
                    ? 'border-amber-300 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                    : 'border-white/15 bg-slate-950/70'
              }`}
            >
              {myReaction && (
                <div className="absolute -top-7 left-2 rounded-full bg-slate-900/95 border border-white/25 px-2 py-0.5 text-base shadow-lg">
                  {myReaction.emoji}
                </div>
              )}
              <AvatarIllustration
                avatarId={mePlayer.avatarId}
                isBot={mePlayer.isBot}
                sizeClass="w-8 h-8"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate max-w-[100px] sm:max-w-[140px] text-xs font-extrabold text-white">
                    {mePlayer.name}
                  </span>
                  {isMyTurn && (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">
                      Your Turn
                    </span>
                  )}
                  {mePlayer.unoSafe && !mePlayer.eliminated && (
                    <span className="rounded-full bg-emerald-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">
                      UNO Safe
                    </span>
                  )}
                  {mePlayer.eliminated && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                      <Flame className="w-2.5 h-2.5" /> Out
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] font-semibold text-white/70">
                  <span>{mePlayer.score} pts</span>
                  {myTurnSecondsLeft !== null && (
                    <span
                      className={`inline-flex items-center gap-0.5 font-mono font-bold ${
                        myTurnSecondsLeft <= 5 ? 'text-rose-300' : 'text-amber-200'
                      }`}
                    >
                      <Timer className="w-3 h-3" />
                      {myTurnSecondsLeft}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-cyan-300/35 bg-slate-950/75 px-3 py-1.5 text-xs font-bold text-cyan-200 backdrop-blur-md">
              <Eye className="w-4 h-4" />
              Spectating
            </div>
          )}

          {/* Center UNO! / CATCH! CTA */}
          <div className="flex items-center gap-2">
            {vulnerableOpponent && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                animate={{ scale: [1, 1.07, 1] }}
                transition={{ repeat: Infinity, duration: 1.05 }}
                onClick={handleTriggerUno}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-xs sm:text-sm font-black uppercase tracking-wide text-white shadow-[0_0_24px_rgba(244,63,94,0.65)] ring-2 ring-white/80"
              >
                <ShieldAlert className="w-4 h-4" />
                Catch {vulnerableOpponent.name}! +2
              </motion.button>
            )}

            {eligibleForUno && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 0.95 }}
                onClick={handleTriggerUno}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 px-5 py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_26px_rgba(250,204,21,0.7)] ring-2 ring-white"
              >
                <Megaphone className="w-4 h-4" />
                UNO!
              </motion.button>
            )}
          </div>

          {/* Right Social Controls */}
          <SocialPanel
            messages={chatMessages}
            myPlayerId={myPlayerId}
            chatOpen={chatOpen}
            onChatOpenChange={setChatOpen}
            onSendChat={onSendChat}
            onSendReaction={onSendReaction}
          />
        </div>
      </div>

      {/* Bottom Hand Tray (for active players) or Spectator Footer */}
      {mePlayer && !mePlayer.eliminated ? (
        <PlayerHand
          hand={gameState.myHand}
          activeSide={gameState.activeSide}
          playableCardIds={gameState.playableCardIds}
          jumpInCardIds={gameState.jumpInCardIds}
          isMyTurn={isMyTurn}
          canDraw={canDraw}
          canUno={canShortcutUno}
          sortMode={sortMode}
          onToggleSort={() => setSortMode((prev) => (prev === 'color' ? 'playable' : 'color'))}
          selectedCardId={selectedCardId}
          onSelectCard={setSelectedCardId}
          onPlayCard={requestPlayCard}
          onDrawCard={() => {
            soundEngine.unlock();
            void onSendGameAction({ type: 'draw_card' });
          }}
          onTriggerUno={handleTriggerUno}
          onDropTargetActiveChange={setDropTargetActive}
          discardRef={discardRef}
          disabledShortcuts={Boolean(
            wildChoiceCard || showSwapModal || challengePending || !isPlaying || chatOpen
          )}
        />
      ) : (
        <div className="safe-pb relative z-20 px-4 py-4 text-center text-xs font-semibold text-white/70">
          {mePlayer?.eliminated
            ? 'Mercy Rule knockout! Watch how the remaining contenders finish the round.'
            : 'Watching table live. You will be free to join if returning to the lobby.'}
        </div>
      )}

      {/* Game Action Modals */}
      <WildColorWheelModal
        open={Boolean(wildChoiceCard)}
        card={wildChoiceCard}
        activeSide={gameState.activeSide}
        onSelectColor={handleWildColorSelected}
        onCancel={() => setWildChoiceCard(null)}
      />

      <SwapTargetModal
        open={showSwapModal}
        opponents={gameState.players.filter((p) => p.id !== myPlayerId)}
        onChooseTarget={(targetPlayerId) =>
          void onSendGameAction({ type: 'choose_swap_target', targetPlayerId })
        }
      />

      <WildFourChallengeModal
        open={Boolean(challengePending)}
        offender={
          challengePending
            ? gameState.players.find((p) => p.id === challengePending.offenderId)
            : undefined
        }
        previousActiveColor={challengePending?.previousActiveColor ?? gameState.activeColor}
        onRespond={(challenge) => void onSendGameAction({ type: 'respond_wild_four', challenge })}
      />

      <ScorePodiumModal
        gameState={gameState}
        isHost={isHost}
        onNextRound={onNextRound}
        onRematch={onRematch}
        onReturnToLobby={onReturnToLobby}
        onLeave={onLeaveRoom}
      />
    </div>
  );
}
