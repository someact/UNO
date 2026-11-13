import { describe, expect, it } from 'vitest';
import {
  isPointInsideRect,
  resolveGestureAxis,
  resolveKeyboardHandAction,
  resolveTapCardAction,
  shouldCommitCardPlay,
} from '../src/components/hand/handGesture.js';

describe('@uno/client directional hand gestures & shortcuts', () => {
  it('locks gesture axis cleanly between horizontal scroll and vertical card lift', () => {
    expect(resolveGestureAxis(3, -4)).toBe('undecided');
    expect(resolveGestureAxis(18, -5)).toBe('horizontal');
    expect(resolveGestureAxis(-16, -4)).toBe('horizontal');
    expect(resolveGestureAxis(2, -16)).toBe('vertical');
    expect(resolveGestureAxis(3, 18)).toBe('horizontal');
  });

  it('commits card play via magnetic discard target, full upward swipe, or quick flick', () => {
    const discardRect = { left: 150, right: 250, top: 180, bottom: 300 };

    expect(isPointInsideRect(125, 200, discardRect)).toBe(true);
    expect(isPointInsideRect(90, 200, discardRect)).toBe(false);

    expect(
      shouldCommitCardPlay({
        dy: -20,
        elapsedMs: 250,
        pointerX: 190,
        pointerY: 220,
        discardRect,
      })
    ).toEqual({ commit: true, reason: 'drop_target' });

    expect(
      shouldCommitCardPlay({
        dy: -80,
        elapsedMs: 400,
        pointerX: 20,
        pointerY: 420,
        discardRect,
      })
    ).toEqual({ commit: true, reason: 'swipe_up' });

    expect(
      shouldCommitCardPlay({
        dy: -45,
        elapsedMs: 80,
        pointerX: 20,
        pointerY: 420,
        discardRect,
      })
    ).toEqual({ commit: true, reason: 'swipe_up' });

    expect(
      shouldCommitCardPlay({
        dy: -25,
        elapsedMs: 300,
        pointerX: 20,
        pointerY: 420,
        discardRect,
      })
    ).toEqual({ commit: false, reason: 'none' });
  });

  it('implements safe tap-to-preview and second-tap-to-play', () => {
    expect(resolveTapCardAction('c1', null, true)).toBe('select');
    expect(resolveTapCardAction('c1', 'c1', true)).toBe('play');
    expect(resolveTapCardAction('c2', null, false)).toBe('preview_unplayable');
    expect(resolveTapCardAction('c2', 'c2', false)).toBe('preview_unplayable');
  });

  it('maps desktop keyboard shortcuts for Arrows, 1-9, Enter, Space, and U', () => {
    const ctx = {
      sortedCardIds: ['c1', 'c2', 'c3'],
      selectedCardId: 'c1',
      playableIds: new Set(['c1', 'c3']),
      canDraw: true,
      canUno: true,
    };

    expect(resolveKeyboardHandAction('ArrowRight', ctx)).toEqual({
      type: 'select',
      cardId: 'c2',
    });
    expect(resolveKeyboardHandAction('ArrowLeft', ctx)).toEqual({
      type: 'select',
      cardId: 'c3',
    });
    expect(resolveKeyboardHandAction('1', ctx)).toEqual({
      type: 'play',
      cardId: 'c1',
    });
    expect(resolveKeyboardHandAction('3', ctx)).toEqual({
      type: 'select',
      cardId: 'c3',
    });
    expect(resolveKeyboardHandAction('Enter', ctx)).toEqual({
      type: 'play',
      cardId: 'c1',
    });
    expect(resolveKeyboardHandAction(' ', ctx)).toEqual({ type: 'draw' });
    expect(resolveKeyboardHandAction('u', ctx)).toEqual({ type: 'uno' });
    expect(
      resolveKeyboardHandAction(' ', { ...ctx, canDraw: false })
    ).toEqual({ type: 'none' });
  });
});
