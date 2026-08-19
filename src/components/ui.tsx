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
      'border-[#08040f] bg-[#3ef2c8] text-[#0b0616] hover:bg-[#7ef7ff] shadow-[4px_4px_0_#08040f] active:shadow-[1px_1px_0_#08040f]',
    danger:
      'border-[#08040f] bg-[#ff4d6d] text-[#180512] hover:bg-[#ff7a90] shadow-[4px_4px_0_#08040f] active:shadow-[1px_1px_0_#08040f]',
    ghost:
      'border-[#3ef2c8]/60 bg-[#0d2822]/80 text-[#3ef2c8] hover:border-[#3ef2c8] hover:bg-[#165044] hover:text-[#7ef7ff] shadow-[4px_4px_0_#08040f] active:shadow-[1px_1px_0_#08040f]',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        'font-pixel border-2 uppercase leading-none tracking-wide transition-[transform,box-shadow,background-color,border-color,color] duration-75 active:translate-x-[3px] active:translate-y-[3px]',
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

export function Panel({ children, className }: { children: ReactNode; className?: string; decorated?: boolean }) {
  return (
    <div
      className={cn(
        'relative border-2 border-[#3ef2c8] bg-[#0e071e] p-5 shadow-[4px_4px_0_#06020c]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 border-2 border-[#2c1f4d] bg-[#0d0619] px-2 py-2">
      <span className="font-pixel text-[8px] text-[#9d8fd6]">{label}</span>
      <span className="font-pixel text-[10px]" style={{ color: color ?? '#ffffff' }}>
        {value}
      </span>
    </div>
  );
}
