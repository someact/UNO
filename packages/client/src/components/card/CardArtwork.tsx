import type { CardFace, CardKind, TableSide } from '@uno/shared';

interface CardArtworkProps {
  face: CardFace;
  side: TableSide;
}

function getQuadrantColors(side: TableSide): [string, string, string, string] {
  return side === 'dark'
    ? ['#ec4899', '#14b8a6', '#f97316', '#a855f7']
    : ['#ef4444', '#3b82f6', '#facc15', '#22c55e'];
}

export function getCornerText(face: CardFace): string {
  switch (face.kind) {
    case 'number':
      return String(face.value ?? 0);
    case 'skip':
      return '⊘';
    case 'skip_everyone':
      return '⊘⊘';
    case 'reverse':
      return '⇄';
    case 'draw_one':
      return '+1';
    case 'draw_two':
      return '+2';
    case 'draw_five':
      return '+5';
    case 'flip':
      return '↻';
    case 'discard_all':
      return 'ALL';
    case 'wild':
      return 'W';
    case 'wild_draw_two':
      return '+2';
    case 'wild_draw_four':
      return '+4';
    case 'wild_draw_six':
      return '+6';
    case 'wild_draw_ten':
      return '+10';
    case 'wild_draw_color':
      return '+C';
  }
}

function MiniCardFan({
  colors,
  badge,
  intense = false,
}: {
  colors: string[];
  badge?: string;
  intense?: boolean;
}) {
  const count = colors.length;
  return (
    <svg viewBox="0 0 80 80" className="w-full h-full drop-shadow-md" aria-hidden="true">
      {intense && (
        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeDasharray="5 4" />
      )}
      {colors.map((fill, idx) => {
        const offset = (idx - (count - 1) / 2) * 8;
        const rot = (idx - (count - 1) / 2) * 11;
        return (
          <g key={idx} transform={`translate(${40 + offset}, ${36 - Math.abs(offset) * 0.2}) rotate(${rot})`}>
            <rect
              x="-13"
              y="-19"
              width="26"
              height="38"
              rx="4.5"
              fill={fill}
              stroke="#ffffff"
              strokeWidth="2.5"
            />
          </g>
        );
      })}
      {badge && (
        <g transform="translate(40, 62)">
          <rect x="-22" y="-12" width="44" height="22" rx="11" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
          <text
            x="0"
            y="4"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="14"
            fontWeight="900"
            fontFamily="Fredoka, system-ui, sans-serif"
          >
            {badge}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Renders bespoke vector center illustration for any Multi-UNO card face. */
export function CardArtwork({ face, side }: CardArtworkProps) {
  const [c1, c2, c3, c4] = getQuadrantColors(side);
  const kind: CardKind = face.kind;

  if (kind === 'number') {
    const val = face.value ?? 0;
    const needsBar = val === 6 || val === 9;
    return (
      <div className="relative flex flex-col items-center justify-center leading-none">
        <span
          className="font-display font-bold text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.45)] select-none"
          style={{ fontSize: 'clamp(1.7rem, 3.8vw, 2.75rem)' }}
        >
          {val}
        </span>
        {needsBar && <span className="mt-0.5 h-1 w-6 rounded-full bg-white/95 shadow-sm" />}
      </div>
    );
  }

  switch (kind) {
    case 'skip':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]" aria-hidden="true">
          <circle cx="40" cy="40" r="24" fill="none" stroke="#ffffff" strokeWidth="8.5" />
          <line x1="23" y1="57" x2="57" y2="23" stroke="#ffffff" strokeWidth="8.5" strokeLinecap="round" />
        </svg>
      );

    case 'skip_everyone':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]" aria-hidden="true">
          <circle cx="40" cy="40" r="28" fill="none" stroke="#fde047" strokeWidth="4.5" strokeDasharray="8 5" />
          <circle cx="40" cy="40" r="19" fill="none" stroke="#ffffff" strokeWidth="7.5" />
          <line x1="26" y1="54" x2="54" y2="26" stroke="#ffffff" strokeWidth="7.5" strokeLinecap="round" />
        </svg>
      );

    case 'reverse':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]" aria-hidden="true">
          <path
            d="M22 33 L47 33 L47 21 L66 38 L47 55 L47 43 L22 43 Z"
            fill="#ffffff"
            transform="translate(-4, -10) rotate(-18 40 40)"
          />
          <path
            d="M58 47 L33 47 L33 59 L14 42 L33 25 L33 37 L58 37 Z"
            fill="#ffffff"
            opacity="0.92"
            transform="translate(4, 10) rotate(-18 40 40)"
          />
        </svg>
      );

    case 'draw_one':
      return <MiniCardFan colors={['#ffffff']} badge="+1" />;

    case 'draw_two':
      return <MiniCardFan colors={['#f8fafc', '#e2e8f0']} badge="+2" />;

    case 'draw_five':
      return <MiniCardFan colors={['#fde047', '#f8fafc', '#fde047']} badge="+5" intense />;

    case 'discard_all':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]" aria-hidden="true">
          <rect x="18" y="14" width="26" height="36" rx="4" fill="rgba(255,255,255,0.45)" stroke="#fff" strokeWidth="2" transform="rotate(-12 31 32)" />
          <rect x="27" y="17" width="26" height="36" rx="4" fill="rgba(255,255,255,0.75)" stroke="#fff" strokeWidth="2" />
          <rect x="36" y="21" width="26" height="36" rx="4" fill="#ffffff" stroke="#0f172a" strokeWidth="2" transform="rotate(10 49 39)" />
          <path d="M40 50 L40 69 M31 61 L40 70 L49 61" stroke="#fde047" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );

    case 'flip':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]" aria-hidden="true">
          <path d="M22 34 A22 22 0 0 1 60 28" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
          <polygon points="64,17 65,33 50,30" fill="#ffffff" />
          <path d="M58 46 A22 22 0 0 1 20 52" fill="none" stroke="#fde047" strokeWidth="7" strokeLinecap="round" />
          <polygon points="16,63 15,47 30,50" fill="#fde047" />
          <circle cx="40" cy="40" r="6" fill="#ffffff" />
        </svg>
      );

    case 'wild':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-md" aria-hidden="true">
          <g transform="rotate(-18 40 40)">
            <path d="M40,40 L40,12 A28,28 0 0,0 12,40 Z" fill={c1} />
            <path d="M40,40 L68,40 A28,28 0 0,0 40,12 Z" fill={c2} />
            <path d="M40,40 L12,40 A28,28 0 0,0 40,68 Z" fill={c3} />
            <path d="M40,40 L40,68 A28,28 0 0,0 68,40 Z" fill={c4} />
            <circle cx="40" cy="40" r="28" fill="none" stroke="#ffffff" strokeWidth="3.5" />
          </g>
        </svg>
      );

    case 'wild_draw_two':
      return <MiniCardFan colors={[c1, c2, c3, c4]} badge="+2" />;

    case 'wild_draw_four':
      return <MiniCardFan colors={[c1, c2, c3, c4]} badge="+4" />;

    case 'wild_draw_six':
      return <MiniCardFan colors={[c1, c2, c3, c4]} badge="+6" intense />;

    case 'wild_draw_ten':
      return <MiniCardFan colors={[c1, c2, c3, c4]} badge="+10" intense />;

    case 'wild_draw_color':
      return (
        <svg viewBox="0 0 80 80" className="w-4/5 h-4/5 drop-shadow-md" aria-hidden="true">
          <circle cx="29" cy="29" r="13" fill={c1} stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="51" cy="29" r="13" fill={c2} stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="29" cy="51" r="13" fill={c3} stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="51" cy="51" r="13" fill={c4} stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="40" cy="40" r="9" fill="#0f172a" stroke="#ffffff" strokeWidth="2.5" />
          <text x="40" y="44" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">
            +
          </text>
        </svg>
      );
  }
}
