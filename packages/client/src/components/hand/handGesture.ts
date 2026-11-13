export type GestureAxis = 'undecided' | 'horizontal' | 'vertical';

export interface SimpleRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const GESTURE_LOCK_THRESHOLD = 10;
export const SWIPE_COMMIT_DISTANCE = 72;
export const FLICK_MIN_DISTANCE = 36;
export const FLICK_VELOCITY_PX_PER_MS = 0.42;
export const DROP_MAGNETIC_PADDING = 32;

/** Determines whether pointer movement commits to horizontal scroll panning or vertical card drag/swipe-up. */
export function resolveGestureAxis(
  dx: number,
  dy: number,
  lockThreshold = GESTURE_LOCK_THRESHOLD
): GestureAxis {
  if (Math.hypot(dx, dy) < lockThreshold) {
    return 'undecided';
  }
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX > absY * 1.15) {
    return 'horizontal';
  }
  if (dy < 0 && absY >= absX) {
    return 'vertical';
  }
  return 'horizontal';
}

/** Tests whether a pointer coordinate lies inside `rect` expanded by `padding` px for forgiving drop targeting. */
export function isPointInsideRect(
  x: number,
  y: number,
  rect: SimpleRect,
  padding = DROP_MAGNETIC_PADDING
): boolean {
  return (
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
  );
}

/** Evaluates on pointer release whether a dragged/swiped card should play onto the discard pile. */
export function shouldCommitCardPlay(params: {
  dy: number;
  elapsedMs: number;
  pointerX: number;
  pointerY: number;
  discardRect: SimpleRect | null;
}): { commit: boolean; reason: 'drop_target' | 'swipe_up' | 'none' } {
  if (params.discardRect && isPointInsideRect(params.pointerX, params.pointerY, params.discardRect)) {
    return { commit: true, reason: 'drop_target' };
  }
  if (params.dy <= -SWIPE_COMMIT_DISTANCE) {
    return { commit: true, reason: 'swipe_up' };
  }
  if (params.dy <= -FLICK_MIN_DISTANCE && params.elapsedMs > 0) {
    const upwardVelocity = -params.dy / params.elapsedMs;
    if (upwardVelocity >= FLICK_VELOCITY_PX_PER_MS) {
      return { commit: true, reason: 'swipe_up' };
    }
  }
  return { commit: false, reason: 'none' };
}

/** Handles Tap-to-Preview vs Double-Tap-to-Play semantics safely across touch & click. */
export function resolveTapCardAction(
  cardId: string,
  selectedCardId: string | null,
  isPlayable: boolean
): 'play' | 'select' | 'preview_unplayable' {
  if (selectedCardId === cardId && isPlayable) {
    return 'play';
  }
  return isPlayable ? 'select' : 'preview_unplayable';
}

export type KeyboardShortcutIntent =
  | { type: 'select'; cardId: string }
  | { type: 'play'; cardId: string }
  | { type: 'draw' }
  | { type: 'uno' }
  | { type: 'none' };

/** Maps desktop keyboard shortcuts (`Arrows`, `1-9`, `Enter`, `Space`, `U`) to hand actions. */
export function resolveKeyboardHandAction(
  key: string,
  ctx: {
    sortedCardIds: readonly string[];
    selectedCardId: string | null;
    playableIds: ReadonlySet<string>;
    canDraw: boolean;
    canUno: boolean;
  }
): KeyboardShortcutIntent {
  const { sortedCardIds, selectedCardId, playableIds, canDraw, canUno } = ctx;

  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    if (sortedCardIds.length === 0) return { type: 'none' };
    const delta = key === 'ArrowRight' ? 1 : -1;
    const currentIdx = selectedCardId ? sortedCardIds.indexOf(selectedCardId) : -1;
    const nextIdx =
      currentIdx === -1
        ? key === 'ArrowRight'
          ? 0
          : sortedCardIds.length - 1
        : (currentIdx + delta + sortedCardIds.length) % sortedCardIds.length;
    return { type: 'select', cardId: sortedCardIds[nextIdx] };
  }

  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx < sortedCardIds.length) {
      const targetId = sortedCardIds[idx];
      if (selectedCardId === targetId && playableIds.has(targetId)) {
        return { type: 'play', cardId: targetId };
      }
      return { type: 'select', cardId: targetId };
    }
    return { type: 'none' };
  }

  if (key === 'Enter') {
    if (selectedCardId && playableIds.has(selectedCardId)) {
      return { type: 'play', cardId: selectedCardId };
    }
    return { type: 'none' };
  }

  if (key === ' ' || key === 'Spacebar') {
    if (canDraw) return { type: 'draw' };
    return { type: 'none' };
  }

  if (key.toLowerCase() === 'u') {
    if (canUno) return { type: 'uno' };
    return { type: 'none' };
  }

  return { type: 'none' };
}
