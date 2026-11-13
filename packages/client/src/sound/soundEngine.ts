import type { GameEvent } from '@uno/shared';

const STORAGE_MUTED = 'multi_uno_muted';
const STORAGE_HAPTICS = 'multi_uno_haptics';

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage quota / private mode errors.
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = readBool(STORAGE_MUTED, false);
  private hapticsEnabled = readBool(STORAGE_HAPTICS, true);

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Call on first user interaction to unlock Web Audio on iOS/Chrome. */
  unlock(): void {
    this.ensureContext();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(next: boolean): void {
    this.muted = next;
    writeBool(STORAGE_MUTED, next);
  }

  isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  setHapticsEnabled(next: boolean): void {
    this.hapticsEnabled = next;
    writeBool(STORAGE_HAPTICS, next);
  }

  vibrate(pattern: number | number[]): void {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore unsupported vibration errors.
      }
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.14,
    delaySec = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  private playNoiseBurst(durationSec: number, filterFreq: number, gainPeak = 0.08): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.value = gainPeak;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  playCardSnap(): void {
    this.playNoiseBurst(0.075, 1900, 0.12);
    this.playTone(260, 120, 0.08, 'triangle', 0.13);
    this.vibrate(14);
  }

  playCardDraw(): void {
    this.playNoiseBurst(0.11, 2600, 0.09);
    this.playTone(340, 520, 0.09, 'sine', 0.07);
    this.vibrate(10);
  }

  playDealBurst(): void {
    for (let i = 0; i < 5; i += 1) {
      this.playTone(540 + i * 35, 380, 0.045, 'triangle', 0.06, i * 0.055);
    }
  }

  playFlipTable(): void {
    this.playTone(240, 720, 0.22, 'sawtooth', 0.07);
    this.playTone(480, 960, 0.24, 'triangle', 0.09, 0.05);
    this.vibrate([20, 30, 35]);
  }

  playUnoShout(): void {
    this.playTone(523.25, 523.25, 0.12, 'triangle', 0.16, 0);
    this.playTone(783.99, 783.99, 0.26, 'triangle', 0.18, 0.11);
    this.vibrate([25, 35, 45]);
  }

  playPenaltyAlert(): void {
    this.playTone(290, 145, 0.18, 'sawtooth', 0.11, 0);
    this.playTone(210, 110, 0.22, 'sawtooth', 0.11, 0.12);
    this.vibrate([35, 30, 35]);
  }

  playTurnChime(): void {
    this.playTone(659.25, 659.25, 0.11, 'sine', 0.09, 0);
    this.playTone(880, 880, 0.16, 'sine', 0.09, 0.08);
  }

  playVictoryFanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playTone(freq, freq, 0.22, 'triangle', 0.14, idx * 0.09);
    });
    this.vibrate([40, 40, 80]);
  }

  playErrorThud(): void {
    this.playTone(155, 85, 0.12, 'sine', 0.14);
    this.vibrate(25);
  }

  /** Plays synchronized sound and haptics for engine GameEvent batches. */
  playEvents(events: readonly GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'round_started':
          this.playDealBurst();
          break;
        case 'card_played':
          this.playCardSnap();
          break;
        case 'cards_drawn':
          if (ev.reason === 'turn') this.playCardDraw();
          else this.playPenaltyAlert();
          break;
        case 'table_flipped':
          this.playFlipTable();
          break;
        case 'uno_called':
          this.playUnoShout();
          break;
        case 'uno_caught':
        case 'player_eliminated':
          this.playPenaltyAlert();
          break;
        case 'round_ended':
        case 'match_ended':
          this.playVictoryFanfare();
          break;
        default:
          break;
      }
    }
  }
}

export const soundEngine = new SoundEngine();
