import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Dice5,
  Eye,
  Flame,
  Globe,
  Layers,
  Lock,
  LogIn,
  PlusCircle,
  RefreshCw,
  Shuffle,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import {
  AVATAR_IDS,
  MODE_PRESETS,
  type AckResult,
  type Card,
  type GameMode,
  type PublicRoomSummary,
  type RoomJoinSuccess,
} from '@uno/shared';
import { soundEngine } from '../../sound/soundEngine.js';
import { AvatarIllustration } from '../avatars/AvatarIllustration.js';
import { UnoCard } from '../card/UnoCard.js';

interface HomeScreenProps {
  playerName: string;
  onChangeName: (name: string) => void;
  avatarId: string;
  onChangeAvatar: (avatarId: string) => void;
  initialRoomCode: string;
  publicRooms: PublicRoomSummary[];
  connected: boolean;
  onCreateRoom: (payload: {
    playerName: string;
    mode: GameMode;
    isPublic: boolean;
  }) => Promise<AckResult<RoomJoinSuccess>>;
  onJoinRoom: (payload: {
    roomId: string;
    playerName: string;
  }) => Promise<AckResult<RoomJoinSuccess>>;
  onRefreshPublicRooms: () => void;
  onOpenRules: (mode?: GameMode) => void;
}

const MODE_ORDER: GameMode[] = ['classic', 'no-mercy', 'flip', 'blitz', 'custom'];

const MODE_BADGE_ICON: Record<GameMode, typeof Sparkles> = {
  classic: Sparkles,
  'no-mercy': Flame,
  flip: Layers,
  blitz: Zap,
  custom: Shuffle,
};

const QUICK_NAMES = [
  'AceFox',
  'UnoKing',
  'FlipNova',
  'StackCat',
  'WildMint',
  'BlitzOwl',
  'Lucky7',
  'CardShark',
];

const HERO_PREVIEW_CARDS: Array<{ card: Card; side: 'light' | 'dark'; rotate: string; y: string }> = [
  {
    card: { id: 'hero-1', light: { color: 'red', kind: 'number', value: 7, points: 7 } },
    side: 'light',
    rotate: '-rotate-12',
    y: 'translate-y-2',
  },
  {
    card: { id: 'hero-2', light: { color: 'wild', kind: 'wild_draw_four', points: 50 } },
    side: 'light',
    rotate: 'rotate-0',
    y: '-translate-y-1',
  },
  {
    card: {
      id: 'hero-3',
      light: { color: 'blue', kind: 'flip', points: 20 },
      dark: { color: 'pink', kind: 'draw_five', points: 20 },
    },
    side: 'dark',
    rotate: 'rotate-12',
    y: 'translate-y-2',
  },
];

/** Landing screen for name/avatar setup, creating or joining a room by ID, and browsing public tables. */
export function HomeScreen({
  playerName,
  onChangeName,
  avatarId,
  onChangeAvatar,
  initialRoomCode,
  publicRooms,
  connected,
  onCreateRoom,
  onJoinRoom,
  onRefreshPublicRooms,
  onOpenRules,
}: HomeScreenProps) {
  const [selectedMode, setSelectedMode] = useState<GameMode>('classic');
  const [isPublic, setIsPublic] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode);
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCodeInput(initialRoomCode);
      setActiveTab('join');
    }
  }, [initialRoomCode]);

  const requireValidName = (): string | null => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      setNameError('Pick a player name first to sit at the table.');
      nameInputRef.current?.focus();
      soundEngine.playErrorThud();
      return null;
    }
    setNameError(null);
    return trimmed;
  };

  const handleCreate = async () => {
    soundEngine.unlock();
    const validName = requireValidName();
    if (!validName || busyAction) return;
    setBusyAction('create');
    try {
      await onCreateRoom({ playerName: validName, mode: selectedMode, isPublic });
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoin = async (targetRoomId: string) => {
    soundEngine.unlock();
    const validName = requireValidName();
    const normalizedCode = targetRoomId.trim().toUpperCase();
    if (!validName || !normalizedCode || busyAction) return;
    setBusyAction(normalizedCode);
    try {
      await onJoinRoom({ roomId: normalizedCode, playerName: validName });
    } finally {
      setBusyAction(null);
    }
  };

  const pickRandomName = () => {
    soundEngine.unlock();
    const next = QUICK_NAMES[Math.floor(Math.random() * QUICK_NAMES.length)];
    onChangeName(next);
    setNameError(null);
  };

  return (
    <div className="relative flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6 pb-8">
        {/* Hero strip */}
        <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-slate-950/60 p-4 sm:p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 border border-amber-300/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200 mb-2.5">
                <Sparkles className="w-3.5 h-3.5" />
                Up to 6 Players + AI Bots
              </div>
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                Shuffle Up &amp; Deal Together.
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-white/75 leading-relaxed">
                Enter any name, spin up a private room link or QR code, and play Classic, No Mercy,
                dual-sided Flip!, or Blitz UNO seamlessly across phone, tablet, and desktop.
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    onOpenRules(selectedMode);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95"
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-300" />
                  Mode Rules &amp; Controls
                </button>
                {initialRoomCode && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/20 border border-cyan-300/40 px-3 py-1.5 text-xs font-bold text-cyan-100">
                    Invite ready: <span className="font-mono tracking-wider">{initialRoomCode}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Decorative animated UNO card fan */}
            <div className="hidden sm:flex items-center justify-center pr-2 shrink-0">
              <div className="flex items-center -space-x-5">
                {HERO_PREVIEW_CARDS.map((item) => (
                  <div
                    key={item.card.id}
                    className={`pointer-events-none transform ${item.rotate} ${item.y} drop-shadow-2xl`}
                  >
                    <UnoCard card={item.card} side={item.side} size="md" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Identity + Play Setup grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Left column: Name & Avatar */}
          <section className="lg:col-span-5 rounded-3xl border border-white/15 bg-slate-950/65 p-4 sm:p-5 backdrop-blur-xl shadow-xl">
            <h2 className="font-display text-base sm:text-lg font-extrabold text-white">
              Your Table Identity
            </h2>
            <p className="text-xs text-white/60 mt-0.5">No account needed—saved in your browser.</p>

            <div className="mt-4">
              <label
                htmlFor="player-name-input"
                className="block text-xs font-bold uppercase tracking-wider text-white/75 mb-1.5"
              >
                Display Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="player-name-input"
                  ref={nameInputRef}
                  type="text"
                  maxLength={18}
                  value={playerName}
                  onChange={(e) => {
                    onChangeName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Enter nickname..."
                  className="w-full rounded-2xl bg-slate-900/90 border border-white/15 focus:border-amber-400 focus:outline-none px-3.5 py-2.5 text-sm font-semibold text-white placeholder:text-white/35"
                />
                <button
                  type="button"
                  onClick={pickRandomName}
                  title="Random fun name"
                  className="shrink-0 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 p-2.5 text-amber-300 transition active:scale-95"
                >
                  <Dice5 className="w-5 h-5" />
                </button>
              </div>
              {nameError && (
                <p className="mt-1.5 text-xs font-semibold text-rose-300">{nameError}</p>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/75">
                  Choose Avatar
                </span>
                <span className="text-[11px] font-semibold text-amber-200 capitalize">
                  {avatarId}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_IDS.map((id) => {
                  const active = id === avatarId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        soundEngine.unlock();
                        onChangeAvatar(id);
                      }}
                      className={`group flex flex-col items-center gap-1 rounded-2xl p-2 border transition active:scale-95 ${
                        active
                          ? 'border-amber-300 bg-amber-400/20 shadow-lg ring-2 ring-amber-300/40'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <AvatarIllustration avatarId={id} sizeClass="w-10 h-10 sm:w-11 sm:h-11" />
                      <span className="text-[10px] font-bold capitalize text-white/80">{id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right column: Create or Join Room */}
          <section className="lg:col-span-7 flex flex-col rounded-3xl border border-white/15 bg-slate-950/65 p-4 sm:p-5 backdrop-blur-xl shadow-xl">
            <div className="flex rounded-2xl bg-slate-900/90 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-bold transition ${
                  activeTab === 'create'
                    ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                Create Room
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('join')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-bold transition ${
                  activeTab === 'join'
                    ? 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                Join by Code
              </button>
            </div>

            {activeTab === 'create' ? (
              <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/75">
                      Pick Game Mode
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenRules(selectedMode)}
                      className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline underline-offset-2"
                    >
                      View mode details
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MODE_ORDER.map((mode) => {
                      const meta = MODE_PRESETS[mode];
                      const Icon = MODE_BADGE_ICON[mode];
                      const selected = mode === selectedMode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSelectedMode(mode)}
                          className={`text-left rounded-2xl border p-3 transition active:scale-[0.99] ${
                            selected
                              ? 'border-amber-300 bg-amber-400/15 ring-2 ring-amber-300/30'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          } ${mode === 'custom' ? 'sm:col-span-2' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-display text-xs sm:text-sm font-extrabold text-white">
                              <Icon className="w-4 h-4 text-amber-300 shrink-0" />
                              {meta.label}
                            </span>
                            {selected && (
                              <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-slate-950">
                                Selected
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-snug text-white/70">{meta.tagline}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsPublic((prev) => !prev)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      isPublic
                        ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-200'
                        : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                    }`}
                  >
                    {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {isPublic ? 'Listed in Public Rooms' : 'Private Invite Only'}
                  </button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={!connected || busyAction !== null}
                    onClick={handleCreate}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg hover:brightness-105 disabled:opacity-50"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {busyAction === 'create'
                      ? 'Creating Room...'
                      : !connected
                        ? 'Connecting...'
                        : 'Create Game Room'}
                  </motion.button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleJoin(roomCodeInput);
                }}
                className="mt-4 flex flex-1 flex-col justify-between gap-4"
              >
                <div>
                  <label
                    htmlFor="room-code-input"
                    className="block text-xs font-bold uppercase tracking-wider text-white/75 mb-1.5"
                  >
                    Room ID Code
                  </label>
                  <input
                    id="room-code-input"
                    type="text"
                    maxLength={10}
                    value={roomCodeInput}
                    onChange={(e) =>
                      setRoomCodeInput(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
                      )
                    }
                    placeholder="E.G. UNO42K"
                    className="w-full rounded-2xl bg-slate-900/90 border border-white/15 focus:border-cyan-400 focus:outline-none px-4 py-3 font-mono text-lg sm:text-xl font-extrabold uppercase tracking-[0.25em] text-white placeholder:text-white/25 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                  />
                  <p className="mt-2 text-xs text-white/60">
                    Ask the host for their 6-character Room ID or scan their lobby QR code. If a
                    match is already running and spectators are enabled, you will join ringside.
                  </p>
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={!connected || !roomCodeInput.trim() || busyAction !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg hover:brightness-105 disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  {busyAction && busyAction !== 'create'
                    ? `Joining ${busyAction}...`
                    : !connected
                      ? 'Connecting...'
                      : 'Join Room'}
                </motion.button>
              </form>
            )}
          </section>
        </div>

        {/* Public Open Rooms */}
        <section className="rounded-3xl border border-white/15 bg-slate-950/60 p-4 sm:p-5 backdrop-blur-xl shadow-xl">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-300" />
              <h2 className="font-display text-sm sm:text-base font-extrabold text-white">
                Public Tables ({publicRooms.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={onRefreshPublicRooms}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 text-xs font-bold text-white/85 transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {publicRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center text-xs sm:text-sm text-white/60">
              No public tables open right now. Create one above and switch on{' '}
              <span className="font-semibold text-white/85">Listed in Public Rooms</span>!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {publicRooms.map((room) => {
                const modeMeta = MODE_PRESETS[room.mode];
                const isLive = room.status === 'in_game';
                return (
                  <div
                    key={room.roomId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-extrabold tracking-wider text-amber-300">
                          {room.roomId}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isLive
                              ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                              : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                          }`}
                        >
                          {isLive ? 'In Game' : 'Lobby'}
                        </span>
                      </div>
                      <div className="truncate text-xs font-semibold text-white mt-0.5">
                        Host: {room.hostName}
                      </div>
                      <div className="text-[11px] text-white/60">
                        {modeMeta.label} &bull; {room.playerCount}/{room.maxPlayers} players
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!connected || busyAction !== null}
                      onClick={() => void handleJoin(room.roomId)}
                      className={`shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-extrabold transition active:scale-95 disabled:opacity-50 ${
                        isLive
                          ? 'bg-white/15 hover:bg-white/25 text-white'
                          : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                      }`}
                    >
                      {isLive ? <Eye className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
                      {isLive ? 'Watch' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
