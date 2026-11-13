import type { AvatarId } from '@uno/shared';

interface AvatarStyle {
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  label: string;
}

const AVATAR_STYLES: Record<AvatarId, AvatarStyle> = {
  fox: { bg: '#fb923c', primary: '#ea580c', secondary: '#ffedd5', accent: '#7c2d12', label: 'Fox' },
  cat: { bg: '#f472b6', primary: '#db2777', secondary: '#fce7f3', accent: '#831843', label: 'Cat' },
  panda: { bg: '#38bdf8', primary: '#f8fafc', secondary: '#0f172a', accent: '#334155', label: 'Panda' },
  owl: { bg: '#a78bfa', primary: '#7c3aed', secondary: '#fef3c7', accent: '#4c1d95', label: 'Owl' },
  frog: { bg: '#4ade80', primary: '#16a34a', secondary: '#dcfce7', accent: '#14532d', label: 'Frog' },
  koala: { bg: '#94a3b8', primary: '#64748b', secondary: '#f1f5f9', accent: '#1e293b', label: 'Koala' },
  tiger: { bg: '#fbbf24', primary: '#d97706', secondary: '#fef3c7', accent: '#451a03', label: 'Tiger' },
  rabbit: { bg: '#fda4af', primary: '#f8fafc', secondary: '#ffe4e6', accent: '#9f1239', label: 'Rabbit' },
};

interface AvatarIllustrationProps {
  avatarId: string;
  isBot?: boolean;
  sizeClass?: string;
}

/** Custom illustrated character SVG portrait for players and AI bots. */
export function AvatarIllustration({
  avatarId,
  isBot = false,
  sizeClass = 'w-10 h-10',
}: AvatarIllustrationProps) {
  const key = (avatarId in AVATAR_STYLES ? avatarId : 'fox') as AvatarId;
  const s = AVATAR_STYLES[key];

  return (
    <div className={`relative inline-flex shrink-0 ${sizeClass}`}>
      <svg viewBox="0 0 64 64" className="w-full h-full rounded-full shadow-inner" aria-label={s.label}>
        <circle cx="32" cy="32" r="32" fill={s.bg} />

        {/* Ears vary by character silhouette */}
        {key === 'rabbit' ? (
          <>
            <ellipse cx="22" cy="14" rx="5.5" ry="12" fill={s.primary} />
            <ellipse cx="42" cy="14" rx="5.5" ry="12" fill={s.primary} />
            <ellipse cx="22" cy="14" rx="2.8" ry="8" fill={s.secondary} />
            <ellipse cx="42" cy="14" rx="2.8" ry="8" fill={s.secondary} />
          </>
        ) : key === 'koala' || key === 'panda' || key === 'frog' ? (
          <>
            <circle cx="15" cy="19" r="8" fill={key === 'panda' ? s.secondary : s.primary} />
            <circle cx="49" cy="19" r="8" fill={key === 'panda' ? s.secondary : s.primary} />
          </>
        ) : (
          <>
            <polygon points="12,26 17,9 29,20" fill={s.primary} />
            <polygon points="52,26 47,9 35,20" fill={s.primary} />
            <polygon points="15,23 18,13 25,20" fill={s.secondary} />
            <polygon points="49,23 46,13 39,20" fill={s.secondary} />
          </>
        )}

        {/* Head */}
        <circle cx="32" cy="35" r="18" fill={s.primary} />

        {/* Cheek / Muzzle patch */}
        <ellipse cx="32" cy="41" rx="11" ry="8" fill={s.secondary} />

        {/* Panda eye patches */}
        {key === 'panda' && (
          <>
            <ellipse cx="24.5" cy="32" rx="4.8" ry="5.5" fill={s.secondary} transform="rotate(-15 24.5 32)" />
            <ellipse cx="39.5" cy="32" rx="4.8" ry="5.5" fill={s.secondary} transform="rotate(15 39.5 32)" />
          </>
        )}

        {/* Eyes */}
        {isBot ? (
          <>
            <rect x="19" y="28" width="26" height="8" rx="4" fill="#0f172a" />
            <circle cx="25" cy="32" r="2.3" fill="#22d3ee" />
            <circle cx="39" cy="32" r="2.3" fill="#22d3ee" />
          </>
        ) : (
          <>
            <circle cx="25" cy="32" r="2.8" fill={key === 'panda' ? '#ffffff' : '#0f172a'} />
            <circle cx="39" cy="32" r="2.8" fill={key === 'panda' ? '#ffffff' : '#0f172a'} />
            <circle cx="25.8" cy="31.1" r="1" fill="#ffffff" />
            <circle cx="39.8" cy="31.1" r="1" fill="#ffffff" />
          </>
        )}

        {/* Nose & Smile */}
        <ellipse cx="32" cy="38.5" rx="3" ry="2.1" fill={s.accent} />
        <path
          d="M28 42.5 Q32 45.5 36 42.5"
          fill="none"
          stroke={s.accent}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {isBot && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-cyan-400 px-1 py-0.2 text-[8px] font-black uppercase tracking-wider text-slate-950 ring-2 ring-slate-950">
          AI
        </span>
      )}
    </div>
  );
}
