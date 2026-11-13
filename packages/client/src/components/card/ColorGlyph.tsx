import type { CardColorToken } from '../../theme/tableThemes.js';

interface ColorGlyphProps {
  shape: CardColorToken['shape'];
  className?: string;
}

/** Distinct colorblind-friendly geometric emblem rendered in card corners. */
export function ColorGlyph({ shape, className = 'w-2.5 h-2.5' }: ColorGlyphProps) {
  switch (shape) {
    case 'circle':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="currentColor" />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <polygon points="8,1.5 14.5,14 1.5,14" fill="currentColor" />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="currentColor" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <polygon points="8,1 15,8 8,15 1,8" fill="currentColor" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <polygon
            points="8,1 10.2,5.6 15.2,6.3 11.5,9.8 12.4,14.8 8,12.4 3.6,14.8 4.5,9.8 0.8,6.3 5.8,5.6"
            fill="currentColor"
          />
        </svg>
      );
    case 'hex':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6" fill="currentColor" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <polygon points="9.5,1 3,9 7.5,9 6.5,15 13,7 8.5,7" fill="currentColor" />
        </svg>
      );
    case 'clover':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <circle cx="8" cy="4.5" r="3" fill="currentColor" />
          <circle cx="4.5" cy="9.5" r="3" fill="currentColor" />
          <circle cx="11.5" cy="9.5" r="3" fill="currentColor" />
        </svg>
      );
    case 'prism':
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <circle cx="5.2" cy="5.2" r="3.2" fill="#ef4444" />
          <circle cx="10.8" cy="5.2" r="3.2" fill="#3b82f6" />
          <circle cx="5.2" cy="10.8" r="3.2" fill="#facc15" />
          <circle cx="10.8" cy="10.8" r="3.2" fill="#22c55e" />
        </svg>
      );
  }
}
