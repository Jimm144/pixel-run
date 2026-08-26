import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../utils/cn';

export function PixelButton({
  children,
  onClick,
  variant = 'primary',
  className,
  style,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'ghost';
  className?: string;
  style?: CSSProperties;
  small?: boolean;
}) {
  const styles = {
    primary:
      'border-[var(--ui-bg)] bg-[var(--ui-accent)] text-[#0b0616] hover:bg-[var(--ui-accent-hi)] shadow-[4px_4px_0_var(--ui-bg)] active:shadow-[1px_1px_0_var(--ui-bg)]',
    danger:
      'border-[var(--ui-bg)] bg-[var(--ui-danger)] text-[#180512] hover:bg-[var(--ui-danger-hi)] shadow-[4px_4px_0_var(--ui-bg)] active:shadow-[1px_1px_0_var(--ui-bg)]',
    ghost:
      'border-[var(--ui-accent)]/60 bg-[var(--ui-accent-dim)]/80 text-[var(--ui-accent)] hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-dim2)] hover:text-[var(--ui-accent-hi)] shadow-[4px_4px_0_var(--ui-bg)] active:shadow-[1px_1px_0_var(--ui-bg)]',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        'font-pixel border-2 uppercase leading-none tracking-wide transition-[transform,box-shadow,background-color,border-color,color] duration-75 active:translate-x-[3px] active:translate-y-[3px] focus-visible:outline-2 focus-visible:outline-[var(--ui-gold)] focus-visible:outline-offset-2',
        small ? 'px-3 py-2 text-[10px]' : 'px-5 py-3 text-[10px]',
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Shared pause glyph — used by the touch pause button and the control hints. */
export function PauseIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={className} fill="currentColor" shapeRendering="crispEdges">
      <rect x="3" y="2" width="3" height="12" />
      <rect x="10" y="2" width="3" height="12" />
    </svg>
  );
}

/** Shared pixel close 'X' glyph — crisp pixel squares with crisp edges. */
export function PixelCloseIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={className} fill="currentColor" shapeRendering="crispEdges">
      <rect x="2" y="2" width="2" height="2" />
      <rect x="12" y="2" width="2" height="2" />
      <rect x="4" y="4" width="2" height="2" />
      <rect x="10" y="4" width="2" height="2" />
      <rect x="6" y="6" width="4" height="4" />
      <rect x="4" y="10" width="2" height="2" />
      <rect x="10" y="10" width="2" height="2" />
      <rect x="2" y="12" width="2" height="2" />
      <rect x="12" y="12" width="2" height="2" />
    </svg>
  );
}

/** Shared 7x7 pixel arrow glyph in 4 directions. */
export function PixelArrow({ dir, className = '' }: { dir: 'up' | 'down' | 'left' | 'right'; className?: string }) {
  if (dir === 'up') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M3 0h1v1H3V0z M2 1h3v1H2V1z M1 2h5v1H1V2z M0 3h7v1H0V3z M2 4h3v3H2V4z" />
      </svg>
    );
  }
  if (dir === 'down') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M2 0h3v3H2V0z M0 3h7v1H0V3z M1 4h5v1H1V4z M2 5h3v1H2V5z M3 6h1v1H3V6z" />
      </svg>
    );
  }
  if (dir === 'left') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M0 3h1v1H0V3z M1 2h1v3H1V2z M2 1h1v5H2V1z M3 0h1v7H3V0z M4 2h3v3H4V2z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 7 7"
      className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M6 3h1v1H6V3z M5 2h1v3H5V2z M4 1h1v5H4V1z M3 0h1v7H3V0z M0 2h3v3H0V2z" />
    </svg>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string; decorated?: boolean }) {
  return (
    <div
      className={cn(
        'relative border-2 border-[var(--ui-accent)] bg-[var(--ui-panel)] p-5 shadow-[4px_4px_0_var(--ui-bg)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 border-2 border-[var(--ui-border2)] bg-[var(--ui-panel3)] px-2 py-2">
      <span className="font-pixel text-[8px] text-[var(--ui-muted)]">{label}</span>
      <span className="font-pixel text-[10px]" style={{ color: color ?? '#ffffff' }}>
        {value}
      </span>
    </div>
  );
}
