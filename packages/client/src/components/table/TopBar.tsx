import { Palette, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { TABLE_THEMES, type TableThemeId } from '../../theme/tableThemes.js';

interface TopBarProps {
  title: string;
  subtitle?: string;
  themeId: TableThemeId;
  onChangeTheme: (id: TableThemeId) => void;
  muted: boolean;
  onToggleMute: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  rightSlot?: React.ReactNode;
}

const THEME_ORDER: TableThemeId[] = ['emerald', 'neon', 'wood'];

/** Compact translucent top bar with room/mode label, theme switcher, audio mute, and haptics toggle. */
export function TopBar({
  title,
  subtitle,
  themeId,
  onChangeTheme,
  muted,
  onToggleMute,
  hapticsEnabled,
  onToggleHaptics,
  rightSlot,
}: TopBarProps) {
  const nextTheme = () => {
    const idx = THEME_ORDER.indexOf(themeId);
    onChangeTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  return (
    <header className="safe-pt relative z-20 flex items-center justify-between gap-2 px-3 py-2 sm:px-5">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 via-amber-400 to-blue-500 font-display text-xs font-black text-slate-950 shadow">
          UNO
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-sm sm:text-base font-bold text-white leading-tight">
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-[11px] font-medium text-white/65">{subtitle}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={nextTheme}
          title={`Theme: ${TABLE_THEMES[themeId].name}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition active:scale-95"
        >
          <Palette className="w-3.5 h-3.5 text-amber-300" />
          <span className="hidden sm:inline">{TABLE_THEMES[themeId].name}</span>
        </button>

        <button
          type="button"
          onClick={onToggleHaptics}
          title={hapticsEnabled ? 'Vibration Haptics On' : 'Vibration Haptics Off'}
          className={`inline-flex items-center justify-center rounded-xl border p-1.5 backdrop-blur-md transition active:scale-95 ${
            hapticsEnabled
              ? 'bg-slate-950/70 border-white/15 text-emerald-300'
              : 'bg-slate-950/50 border-white/10 text-white/40'
          }`}
          aria-label="Toggle vibration haptics"
        >
          <Smartphone className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          className={`inline-flex items-center justify-center rounded-xl border p-1.5 backdrop-blur-md transition active:scale-95 ${
            muted
              ? 'bg-rose-950/70 border-rose-400/30 text-rose-300'
              : 'bg-slate-950/70 border-white/15 text-amber-300'
          }`}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {rightSlot}
      </div>
    </header>
  );
}
