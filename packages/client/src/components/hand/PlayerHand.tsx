import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ArrowUpRight, Play, Sparkles, Zap } from 'lucide-react';
import {
  getActiveFace,
  getCardLabel,
  sortHand,
  type Card,
  type SortMode,
  type TableSide,
} from '@uno/shared';
import { soundEngine } from '../../sound/soundEngine.js';
import { UnoCard } from '../card/UnoCard.js';
import {
  resolveGestureAxis,
  resolveKeyboardHandAction,
  resolveTapCardAction,
  shouldCommitCardPlay,
  type GestureAxis,
  type SimpleRect,
} from './handGesture.js';

interface PlayerHandProps {
  hand: readonly Card[];
  activeSide: TableSide;
  playableCardIds: readonly string[];
  jumpInCardIds: readonly string[];
  isMyTurn: boolean;
  canDraw: boolean;
  canUno: boolean;
  sortMode: SortMode;
  onToggleSort: () => void;
  selectedCardId: string | null;
  onSelectCard: (cardId: string | null) => void;
  onPlayCard: (cardId: string) => void;
  onDrawCard: () => void;
  onTriggerUno: () => void;
  onDropTargetActiveChange?: (active: boolean) => void;
  discardRef?: React.RefObject<HTMLDivElement | null>;
  disabledShortcuts?: boolean;
}

interface DragSession {
  card: Card;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  currentX: number;
  currentY: number;
  startTime: number;
  axis: GestureAxis;
  eligible: boolean;
}

function getSimpleRect(el: HTMLElement | null): SimpleRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}

/** Responsive cross-device player hand with directional gesture locking, swipe-up/drop play, and keyboard controls. */
export function PlayerHand({
  hand,
  activeSide,
  playableCardIds,
  jumpInCardIds,
  isMyTurn,
  canDraw,
  canUno,
  sortMode,
  onToggleSort,
  selectedCardId,
  onSelectCard,
  onPlayCard,
  onDrawCard,
  onTriggerUno,
  onDropTargetActiveChange,
  discardRef,
  disabledShortcuts = false,
}: PlayerHandProps) {
  const playableSet = useMemo(() => new Set(playableCardIds), [playableCardIds]);
  const jumpInSet = useMemo(() => new Set(jumpInCardIds), [jumpInCardIds]);
  const eligibleSet = useMemo(() => {
    const combined = new Set<string>(playableCardIds);
    for (const id of jumpInCardIds) combined.add(id);
    return combined;
  }, [jumpInCardIds, playableCardIds]);

  const sortedHand = useMemo(
    () => sortHand(hand, activeSide, sortMode, eligibleSet),
    [hand, activeSide, sortMode, eligibleSet]
  );

  const selectedCard = useMemo(
    () => sortedHand.find((c) => c.id === selectedCardId) ?? null,
    [sortedHand, selectedCardId]
  );

  const trayRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const suppressNextClickRef = useRef(false);

  const [floatingDrag, setFloatingDrag] = useState<{
    card: Card;
    x: number;
    y: number;
    tiltDeg: number;
    readyToSnap: boolean;
  } | null>(null);

  const [shakeCardId, setShakeCardId] = useState<string | null>(null);

  // Clear selection if selected card left hand (played / swapped).
  useEffect(() => {
    if (selectedCardId && !hand.some((c) => c.id === selectedCardId)) {
      onSelectCard(null);
    }
  }, [hand, selectedCardId, onSelectCard]);

  // Desktop keyboard shortcuts (ArrowLeft/Right, 1-9, Enter, Space, U).
  useEffect(() => {
    if (disabledShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const intent = resolveKeyboardHandAction(e.key, {
        sortedCardIds: sortedHand.map((c) => c.id),
        selectedCardId,
        playableIds: eligibleSet,
        canDraw,
        canUno,
      });

      if (intent.type === 'none') return;
      e.preventDefault();
      soundEngine.unlock();

      if (intent.type === 'select') {
        onSelectCard(intent.cardId);
      } else if (intent.type === 'play') {
        onSelectCard(null);
        onPlayCard(intent.cardId);
      } else if (intent.type === 'draw') {
        onDrawCard();
      } else if (intent.type === 'uno') {
        onTriggerUno();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canDraw,
    canUno,
    disabledShortcuts,
    eligibleSet,
    onDrawCard,
    onPlayCard,
    onSelectCard,
    onTriggerUno,
    selectedCardId,
    sortedHand,
  ]);

  const triggerUnplayableFeedback = (cardId: string) => {
    soundEngine.playErrorThud();
    setShakeCardId(cardId);
    setTimeout(() => {
      setShakeCardId((prev) => (prev === cardId ? null : prev));
    }, 320);
  };

  const handleCardClick = (card: Card) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    soundEngine.unlock();
    const isEligible = eligibleSet.has(card.id);
    const outcome = resolveTapCardAction(card.id, selectedCardId, isEligible);

    if (outcome === 'play') {
      onSelectCard(null);
      onPlayCard(card.id);
      return;
    }

    if (outcome === 'select') {
      onSelectCard(card.id);
      return;
    }

    if (selectedCardId === card.id) {
      triggerUnplayableFeedback(card.id);
      onSelectCard(null);
    } else {
      onSelectCard(card.id);
      if (isMyTurn) triggerUnplayableFeedback(card.id);
    }
  };

  const handlePointerDown = (card: Card, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    suppressNextClickRef.current = false;
    dragSessionRef.current = {
      card,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      currentX: e.clientX,
      currentY: e.clientY,
      startTime: performance.now(),
      axis: 'undecided',
      eligible: eligibleSet.has(card.id),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragSessionRef.current;
    if (!s || s.pointerId !== e.pointerId) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const stepDx = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.currentX = e.clientX;
    s.currentY = e.clientY;

    if (s.axis === 'undecided') {
      const resolved = resolveGestureAxis(dx, dy);
      if (resolved === 'undecided') return;

      s.axis = resolved;
      suppressNextClickRef.current = true;

      if (resolved === 'vertical' && s.eligible) {
        soundEngine.unlock();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore unsupported pointer capture environments.
        }
      }
    }

    if (s.axis === 'horizontal') {
      if (s.pointerType === 'mouse' && trayRef.current) {
        trayRef.current.scrollLeft -= stepDx;
      }
      return;
    }

    if (s.axis === 'vertical' && s.eligible) {
      const discardRect = getSimpleRect(discardRef?.current ?? null);
      const { commit } = shouldCommitCardPlay({
        dy,
        elapsedMs: performance.now() - s.startTime,
        pointerX: e.clientX,
        pointerY: e.clientY,
        discardRect,
      });

      onDropTargetActiveChange?.(commit || dy <= -44);
      setFloatingDrag({
        card: s.card,
        x: e.clientX,
        y: e.clientY,
        tiltDeg: Math.max(-14, Math.min(14, dx * 0.06)),
        readyToSnap: commit || dy <= -48,
      });
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const s = dragSessionRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    dragSessionRef.current = null;
    setFloatingDrag(null);
    onDropTargetActiveChange?.(false);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if pointer already released.
    }

    if (cancelled || s.axis !== 'vertical') return;

    const dy = e.clientY - s.startY;
    const elapsedMs = performance.now() - s.startTime;
    const discardRect = getSimpleRect(discardRef?.current ?? null);

    if (!s.eligible) {
      if (dy <= -40) triggerUnplayableFeedback(s.card.id);
      return;
    }

    const decision = shouldCommitCardPlay({
      dy,
      elapsedMs,
      pointerX: e.clientX,
      pointerY: e.clientY,
      discardRect,
    });

    if (decision.commit) {
      onSelectCard(null);
      onPlayCard(s.card.id);
    }
  };

  const selectedIsEligible = selectedCard ? eligibleSet.has(selectedCard.id) : false;
  const selectedIsJumpIn = selectedCard ? jumpInSet.has(selectedCard.id) : false;
  const selectedLabel = selectedCard ? getCardLabel(getActiveFace(selectedCard, activeSide)) : '';
  const compactOverlap =
    sortedHand.length > 14 ? '-ml-7 sm:-ml-8' : sortedHand.length > 9 ? '-ml-5 sm:-ml-6' : '-ml-3 sm:-ml-4';

  return (
    <div className="safe-pb relative z-20 w-full select-none">
      {/* Floating Preview / Confirm Action Bar above hand */}
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-3 pb-1.5 sm:px-6">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-slate-950/75 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white/85 backdrop-blur-md">
            {hand.length} {hand.length === 1 ? 'Card' : 'Cards'}
          </span>
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              onToggleSort();
            }}
            className="inline-flex items-center gap-1 rounded-full bg-slate-950/75 hover:bg-slate-900 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 backdrop-blur-md transition active:scale-95"
          >
            <ArrowUpDown className="w-3 h-3" />
            Sort: {sortMode === 'color' ? 'Color' : 'Playable'}
          </button>
        </div>

        {/* Selected card preview & 1-tap play confirmation */}
        {selectedCard ? (
          <div className="flex items-center gap-1.5 rounded-full bg-slate-950/90 border border-white/20 px-2.5 py-1 shadow-xl backdrop-blur-md">
            <span className="hidden sm:inline text-xs font-bold text-white">{selectedLabel}</span>
            {selectedIsEligible ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  onSelectCard(null);
                  onPlayCard(selectedCard.id);
                }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-black text-slate-950 transition active:scale-95 ${
                  selectedIsJumpIn
                    ? 'bg-cyan-300 hover:bg-cyan-200'
                    : 'bg-emerald-400 hover:bg-emerald-300'
                }`}
              >
                <Play className="w-3 h-3 fill-current" />
                {selectedIsJumpIn ? 'Jump In!' : 'Play'}
              </button>
            ) : (
              <span className="text-[11px] font-semibold text-white/60">
                {isMyTurn ? 'Not playable now' : 'Wait for your turn'}
              </span>
            )}
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
            {playableCardIds.length > 0 ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                <span>Swipe up, drag to center, or double-tap a glowing card</span>
              </>
            ) : jumpInCardIds.length > 0 ? (
              <>
                <Zap className="w-3.5 h-3.5 text-cyan-300" />
                <span>Jump-In match ready! Slam a cyan card out of turn</span>
              </>
            ) : isMyTurn ? (
              <>
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-300" />
                <span>No match &mdash; tap Draw Deck or press Space</span>
              </>
            ) : (
              <span>Waiting for opponents...</span>
            )}
          </div>
        )}
      </div>

      {/* Horizontal Touch-Scrollable / Fanned Card Tray */}
      <div
        ref={trayRef}
        className="no-scrollbar touch-pan-x relative w-full overflow-x-auto pt-6 pb-2"
      >
        <div className="flex w-max min-w-full items-end justify-center px-4 sm:px-8">
          {sortedHand.map((card, index) => {
            const isPlayable = playableSet.has(card.id);
            const isJumpIn = !isPlayable && jumpInSet.has(card.id);
            const isEligible = isPlayable || isJumpIn;
            const isSelected = selectedCardId === card.id;
            const isBeingDragged = floatingDrag?.card.id === card.id;
            const dimmed = isMyTurn && !isPlayable && !isJumpIn;

            // Subtle desktop fan arch
            const mid = (sortedHand.length - 1) / 2;
            const offsetFromMid = index - mid;
            const desktopRotate = Math.max(-9, Math.min(9, offsetFromMid * 1.4));
            const desktopArcY = Math.min(14, Math.abs(offsetFromMid) * 1.5);

            const desktopYOffset =
              (sortedHand.length <= 12 ? desktopArcY : 0) +
              (isEligible && !isSelected ? -8 : 0);

            return (
              <motion.div
                key={card.id}
                layout="position"
                animate={
                  shakeCardId === card.id
                    ? { x: [-6, 6, -4, 4, 0], y: desktopYOffset, rotate: sortedHand.length <= 12 ? desktopRotate : 0 }
                    : { y: desktopYOffset, rotate: sortedHand.length <= 12 ? desktopRotate : 0 }
                }
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                onPointerDown={(e) => handlePointerDown(card, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => finishDrag(e, false)}
                onPointerCancel={(e) => finishDrag(e, true)}
                className={`relative shrink-0 transition-opacity ${
                  index > 0 ? compactOverlap : ''
                } ${isSelected ? 'z-30' : isEligible ? 'z-20 hover:z-30' : 'z-10 hover:z-30'} ${
                  isBeingDragged ? 'opacity-20 scale-95' : 'opacity-100'
                }`}
              >
                {isJumpIn && (
                  <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950 shadow">
                    Jump!
                  </span>
                )}
                {index < 9 && (
                  <span className="pointer-events-none hidden lg:inline-block absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-slate-950/80 px-1 text-[9px] font-bold text-white/55">
                    {index + 1}
                  </span>
                )}
                <UnoCard
                  card={card}
                  side={activeSide}
                  size="md"
                  playable={isPlayable}
                  jumpIn={isJumpIn}
                  dimmed={dimmed}
                  selected={isSelected}
                  onClick={() => handleCardClick(card)}
                />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Floating dragged card following finger / pointer */}
      {floatingDrag && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: floatingDrag.x,
            top: floatingDrag.y,
            transform: `translate(-50%, -62%) rotate(${floatingDrag.tiltDeg}deg) scale(${
              floatingDrag.readyToSnap ? 1.12 : 1.04
            })`,
          }}
        >
          <div
            className={`rounded-2xl transition-shadow ${
              floatingDrag.readyToSnap ? 'ring-4 ring-emerald-300 shadow-[0_0_32px_rgba(52,211,153,0.75)]' : ''
            }`}
          >
            <UnoCard card={floatingDrag.card} side={activeSide} size="md" playable />
          </div>
          {floatingDrag.readyToSnap && (
            <div className="mt-1.5 text-center">
              <span className="rounded-full bg-emerald-400 px-2.5 py-0.5 text-[10px] font-black uppercase text-slate-950 shadow">
                Release to Play!
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
