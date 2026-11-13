import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Eye,
  LogOut,
  Play,
  QrCode,
  Shield,
  SlidersHorizontal,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  MODE_PRESETS,
  type AckResult,
  type GameMode,
  type HouseRules,
  type LobbyRoomState,
  type UpdateConfigPayload,
} from '@uno/shared';
import { soundEngine } from '../../sound/soundEngine.js';
import { AvatarIllustration } from '../avatars/AvatarIllustration.js';

interface LobbyScreenProps {
  room: LobbyRoomState;
  myPlayerId: string;
  onLeave: () => void;
  onUpdateConfig: (payload: UpdateConfigPayload) => Promise<AckResult>;
  onAddBot: () => Promise<AckResult>;
  onRemovePlayer: (playerId: string) => Promise<AckResult>;
  onTransferHost: (playerId: string) => Promise<AckResult>;
  onToggleReady: () => Promise<AckResult>;
  onStartMatch: () => Promise<AckResult>;
  onOpenRules: (mode: GameMode) => void;
}

const MODE_ORDER: GameMode[] = ['classic', 'no-mercy', 'flip', 'blitz', 'custom'];

const HOUSE_RULE_TOGGLES: Array<{
  key: keyof Pick<
    HouseRules,
    'sevenZero' | 'jumpIn' | 'drawUntilPlayable' | 'playDrawnCard' | 'wildFourChallenge' | 'allowDiscardAll'
  >;
  label: string;
  hint: string;
}> = [
  { key: 'sevenZero', label: '7-0 Hand Swap & Rotate', hint: '7 swaps with a rival; 0 rotates hands' },
  { key: 'jumpIn', label: 'Out-of-Turn Jump-In', hint: 'Slam identical color + symbol anytime' },
  { key: 'drawUntilPlayable', label: 'Draw Until Playable', hint: 'Keep drawing when forced to draw' },
  { key: 'playDrawnCard', label: 'Play Drawn Card', hint: 'Allow playing 1 drawn card immediately' },
  { key: 'wildFourChallenge', label: 'Wild +4 Bluff Challenge', hint: 'Victim may challenge illegal +4' },
  { key: 'allowDiscardAll', label: 'Include Discard All', hint: 'Add color-sweep action cards' },
];

/** Pre-game Lobby with QR invite sharing, 2-6 player/bot seat management, and Host Rule Configurator. */
export function LobbyScreen({
  room,
  myPlayerId,
  onLeave,
  onUpdateConfig,
  onAddBot,
  onRemovePlayer,
  onTransferHost,
  onToggleReady,
  onStartMatch,
  onOpenRules,
}: LobbyScreenProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [showAdvancedRules, setShowAdvancedRules] = useState(room.config.mode === 'custom');
  const [starting, setStarting] = useState(false);

  const isHost = room.hostId === myPlayerId;
  const mePlayer = room.players.find((p) => p.id === myPlayerId);
  const isSpectator = !mePlayer && room.spectators.some((s) => s.id === myPlayerId);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?room=${room.roomId}`
      : `?room=${room.roomId}`;

  const copyInvite = async () => {
    soundEngine.unlock();
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Fallback: open QR sheet if clipboard permission denied.
      setQrOpen(true);
    }
  };

  const patchRules = (rulesPatch: Partial<HouseRules>) => {
    void onUpdateConfig({
      mode: room.config.mode,
      configOverrides: { rules: rulesPatch },
    });
  };

  const handleStartMatch = async () => {
    soundEngine.unlock();
    if (starting) return;
    setStarting(true);
    try {
      await onStartMatch();
    } finally {
      setStarting(false);
    }
  };

  const emptySeats = Math.max(0, room.config.maxPlayers - room.players.length);
  const readyHumans = room.players.filter((p) => !p.isBot && (p.isHost || p.ready)).length;
  const totalHumans = room.players.filter((p) => !p.isBot).length;
  const canStart = isHost && room.players.length >= 2 && readyHumans === totalHumans;

  return (
    <div className="relative flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-24 sm:pb-10">
        {/* Room code + invite header */}
        <section className="rounded-3xl border border-white/15 bg-slate-950/65 p-4 sm:p-5 backdrop-blur-xl shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Room ID
                </span>
                <span className="rounded-xl bg-amber-400/20 border border-amber-300/40 px-3 py-1 font-mono text-base sm:text-lg font-black tracking-[0.2em] text-amber-200">
                  {room.roomId}
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white/85">
                  {MODE_PRESETS[room.config.mode].label}
                </span>
                {isSpectator && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 border border-cyan-300/35 px-2.5 py-0.5 text-[11px] font-bold text-cyan-200">
                    <Eye className="w-3 h-3" /> Spectator
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-white/65">
                Share the code, link, or QR code with friends to join directly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyInvite}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 text-xs font-bold text-white transition active:scale-95"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Link Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-amber-300" />
                    Copy Invite Link
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  setQrOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 text-xs font-bold text-white transition active:scale-95"
              >
                <QrCode className="w-4 h-4 text-cyan-300" />
                QR Share
              </button>
              <button
                type="button"
                onClick={() => onOpenRules(room.config.mode)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 text-xs font-bold text-white transition active:scale-95"
              >
                <BookOpen className="w-4 h-4 text-amber-300" />
                Rules
              </button>
            </div>
          </div>
        </section>

        {/* Seats + Host Configurator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Player Seats */}
          <section className="lg:col-span-5 rounded-3xl border border-white/15 bg-slate-950/65 p-4 sm:p-5 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-display text-base font-extrabold text-white">
                  Table Seats ({room.players.length}/{room.config.maxPlayers})
                </h2>
                <p className="text-[11px] text-white/60">
                  {room.players.length < 2
                    ? 'Need at least 2 players (human or AI bot) to start.'
                    : `${readyHumans}/${totalHumans} human players ready`}
                </p>
              </div>
              {isHost && room.players.length < room.config.maxPlayers && (
                <button
                  type="button"
                  onClick={() => void onAddBot()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-300/35 px-3 py-1.5 text-xs font-bold text-emerald-200 transition active:scale-95"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Bot
                </button>
              )}
            </div>

            <div className="space-y-2">
              {room.players.map((p) => {
                const isSelf = p.id === myPlayerId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${
                      isSelf
                        ? 'border-amber-300/40 bg-amber-400/10'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarIllustration
                        avatarId={p.avatarId}
                        isBot={p.isBot}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-white">
                            {p.name}
                            {isSelf ? ' (You)' : ''}
                          </span>
                          {p.isHost && (
                            <span
                              title="Room Host"
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-200"
                            >
                              <Crown className="w-2.5 h-2.5" />
                              Host
                            </span>
                          )}
                          {p.isBot && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-200">
                              <Bot className="w-2.5 h-2.5" />
                              AI
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span
                            className={
                              p.isHost || p.ready ? 'font-bold text-emerald-300' : 'text-white/55'
                            }
                          >
                            {p.isHost ? 'Host Ready' : p.ready ? 'Ready' : 'Not Ready'}
                          </span>
                          {!p.connected && !p.isBot && (
                            <span className="text-rose-300 font-semibold">&bull; Reconnecting</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isHost && !isSelf && (
                      <div className="flex items-center gap-1 shrink-0">
                        {!p.isBot && p.connected && (
                          <button
                            type="button"
                            onClick={() => void onTransferHost(p.id)}
                            title="Transfer Host"
                            className="rounded-lg bg-white/10 hover:bg-amber-400/25 p-1.5 text-amber-200 transition"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void onRemovePlayer(p.id)}
                          title={p.isBot ? 'Remove Bot' : 'Kick Player'}
                          className="rounded-lg bg-white/10 hover:bg-rose-500/30 p-1.5 text-rose-200 transition"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {Array.from({ length: emptySeats }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="flex items-center justify-between rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2.5 text-xs text-white/40"
                >
                  <span>Open Seat {room.players.length + idx + 1}</span>
                  <span>Invite friend or add bot</span>
                </div>
              ))}
            </div>

            {room.spectators.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/10">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                  <Eye className="w-3.5 h-3.5" /> Spectators ({room.spectators.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {room.spectators.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/85"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Rule Configurator */}
          <section className="lg:col-span-7 rounded-3xl border border-white/15 bg-slate-950/65 p-4 sm:p-5 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-300" />
                <h2 className="font-display text-base font-extrabold text-white">
                  Match Setup {!isHost && '(Host Controlled)'}
                </h2>
              </div>
              {!isHost && (
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/70">
                  Read Only
                </span>
              )}
            </div>

            {/* Game Mode selector */}
            <div className="mb-4">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-white/65 mb-1.5">
                Mode Preset
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {MODE_ORDER.map((m) => {
                  const active = room.config.mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={!isHost}
                      onClick={() => void onUpdateConfig({ mode: m })}
                      className={`rounded-xl px-2.5 py-2 text-xs font-bold border transition ${
                        active
                          ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      } disabled:opacity-75 disabled:cursor-default`}
                    >
                      {MODE_PRESETS[m].label.replace('UNO ', '').replace(' / Speed UNO', '')}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-white/65">
                {MODE_PRESETS[room.config.mode].tagline}
              </p>
            </div>

            {/* Core numerical/pill settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white/75 mb-2">Max Players</div>
                <div className="flex gap-1.5">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!isHost || n < room.players.length}
                      onClick={() => void onUpdateConfig({ configOverrides: { maxPlayers: n } })}
                      className={`flex-1 rounded-lg py-1.5 font-bold border transition ${
                        room.config.maxPlayers === n
                          ? 'border-amber-300 bg-amber-400 text-slate-950'
                          : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                      } disabled:opacity-45`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white/75 mb-2">Turn Timer</div>
                <div className="flex gap-1.5">
                  {([0, 15, 30, 45] as const).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={!isHost}
                      onClick={() =>
                        void onUpdateConfig({ configOverrides: { turnTimerSeconds: sec } })
                      }
                      className={`flex-1 rounded-lg py-1.5 font-bold border transition ${
                        room.config.turnTimerSeconds === sec
                          ? 'border-amber-300 bg-amber-400 text-slate-950'
                          : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                      } disabled:opacity-65`}
                    >
                      {sec === 0 ? 'Off' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white/75 mb-2">Starting Hand</div>
                <div className="flex gap-1.5">
                  {([5, 7, 10] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      disabled={!isHost}
                      onClick={() =>
                        void onUpdateConfig({ configOverrides: { startingHandSize: size } })
                      }
                      className={`flex-1 rounded-lg py-1.5 font-bold border transition ${
                        room.config.startingHandSize === size
                          ? 'border-amber-300 bg-amber-400 text-slate-950'
                          : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                      } disabled:opacity-65`}
                    >
                      {size} cards
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white/75 mb-2">Target Score</div>
                <div className="flex gap-1.5">
                  {([0, 250, 500] as const).map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      disabled={!isHost}
                      onClick={() =>
                        void onUpdateConfig({ configOverrides: { winTargetScore: pts } })
                      }
                      className={`flex-1 rounded-lg py-1.5 font-bold border transition ${
                        room.config.winTargetScore === pts
                          ? 'border-amber-300 bg-amber-400 text-slate-950'
                          : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                      } disabled:opacity-65`}
                    >
                      {pts === 0 ? '1 Round' : `${pts} pts`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Room visibility & AI pills */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                disabled={!isHost}
                onClick={() =>
                  void onUpdateConfig({
                    configOverrides: {
                      botDifficulty: room.config.botDifficulty === 'smart' ? 'casual' : 'smart',
                    },
                  })
                }
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-bold text-white/85 hover:bg-white/10 disabled:opacity-75"
              >
                AI Bots: <span className="text-amber-300 capitalize">{room.config.botDifficulty}</span>
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() =>
                  void onUpdateConfig({
                    configOverrides: { allowSpectators: !room.config.allowSpectators },
                  })
                }
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-bold text-white/85 hover:bg-white/10 disabled:opacity-75"
              >
                Spectators:{' '}
                <span className={room.config.allowSpectators ? 'text-emerald-300' : 'text-rose-300'}>
                  {room.config.allowSpectators ? 'Allowed' : 'Off'}
                </span>
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() =>
                  void onUpdateConfig({
                    configOverrides: { isPublic: !room.config.isPublic },
                  })
                }
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-bold text-white/85 hover:bg-white/10 disabled:opacity-75"
              >
                Visibility:{' '}
                <span className={room.config.isPublic ? 'text-emerald-300' : 'text-amber-200'}>
                  {room.config.isPublic ? 'Public' : 'Private'}
                </span>
              </button>
            </div>

            {/* Collapsible Custom House Rules */}
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setShowAdvancedRules((prev) => !prev)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-bold text-white/85"
              >
                <span>House Rule Toggles</span>
                {showAdvancedRules ? (
                  <ChevronUp className="w-4 h-4 text-white/60" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/60" />
                )}
              </button>

              {showAdvancedRules && (
                <div className="border-t border-white/10 p-3 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                      <div>
                        <div className="font-bold text-white">Draw Stacking</div>
                        <div className="text-[10px] text-white/55">Stack equal or higher +N</div>
                      </div>
                      <button
                        type="button"
                        disabled={!isHost}
                        onClick={() =>
                          patchRules({
                            stacking:
                              room.config.rules.stacking === 'off' ? 'same-or-higher' : 'off',
                          })
                        }
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                          room.config.rules.stacking === 'same-or-higher'
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-white/10 text-white/70'
                        }`}
                      >
                        {room.config.rules.stacking === 'same-or-higher' ? 'On' : 'Off'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                      <div>
                        <div className="font-bold text-white">Mercy Knock-Out</div>
                        <div className="text-[10px] text-white/55">Out at 25+ cards</div>
                      </div>
                      <button
                        type="button"
                        disabled={!isHost}
                        onClick={() =>
                          patchRules({
                            mercyLimit: room.config.rules.mercyLimit >= 25 ? 0 : 25,
                          })
                        }
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                          room.config.rules.mercyLimit > 0
                            ? 'bg-rose-400 text-slate-950'
                            : 'bg-white/10 text-white/70'
                        }`}
                      >
                        {room.config.rules.mercyLimit > 0
                          ? `${room.config.rules.mercyLimit} cards`
                          : 'Off'}
                      </button>
                    </div>

                    {HOUSE_RULE_TOGGLES.map((item) => {
                      const enabled = room.config.rules[item.key];
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
                        >
                          <div className="pr-2">
                            <div className="font-bold text-white">{item.label}</div>
                            <div className="text-[10px] text-white/55">{item.hint}</div>
                          </div>
                          <button
                            type="button"
                            disabled={!isHost}
                            onClick={() => patchRules({ [item.key]: !enabled })}
                            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                              enabled ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-white/70'
                            }`}
                          >
                            {enabled ? 'On' : 'Off'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sticky Lobby Footer Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/15 bg-slate-950/80 px-4 py-3 backdrop-blur-xl shadow-2xl">
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-rose-500/25 border border-white/15 px-3.5 py-2.5 text-xs font-bold text-white transition active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            Leave Room
          </button>

          <div className="flex items-center gap-2">
            {mePlayer && !isHost && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => void onToggleReady()}
                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-extrabold shadow-lg transition ${
                  mePlayer.ready
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-white text-slate-950 hover:bg-amber-200'
                }`}
              >
                <Check className="w-4 h-4" />
                {mePlayer.ready ? 'Ready!' : 'Mark Ready'}
              </motion.button>
            )}

            {isHost && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={!canStart || starting}
                onClick={handleStartMatch}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 px-6 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-105 disabled:opacity-45"
              >
                <Play className="w-4 h-4 fill-current" />
                {starting
                  ? 'Starting...'
                  : room.players.length < 2
                    ? 'Add Bot or Friend to Start'
                    : readyHumans < totalHumans
                      ? `Waiting Ready (${readyHumans}/${totalHumans})`
                      : 'Start Match'}
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Share Modal */}
      <AnimatePresence>
        {qrOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQrOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-white/15 bg-slate-900 p-5 text-center shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-display text-base font-extrabold text-white">
                  Scan to Join Table
                </span>
                <button
                  type="button"
                  onClick={() => setQrOpen(false)}
                  className="rounded-lg bg-white/10 p-1.5 text-white/75 hover:bg-white/20"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mx-auto inline-flex rounded-2xl bg-white p-3.5 shadow-inner">
                <QRCodeSVG value={inviteUrl} size={196} level="M" />
              </div>
              <div className="mt-3 font-mono text-lg font-black tracking-[0.22em] text-amber-300">
                {room.roomId}
              </div>
              <p className="mt-1 break-all text-[11px] text-white/60">{inviteUrl}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
