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
        small ? 'px-3 py-2 text-[8px]' : 'px-5 py-3.5 text-[11px]',
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

export function Panel({ children, className, decorated = true }: { children: ReactNode; className?: string; decorated?: boolean }) {  return (
    <div
      className={cn(
        'relative border-4 border-[#3ef2c8] bg-[#140a26]/95 p-5 shadow-[0_0_0_4px_#08040f,0_0_40px_rgba(62,242,200,0.22)]',
        className,
      )}
    >
      {decorated && <>
        <span className="pointer-events-none absolute -left-[10px] -top-[10px] h-2 w-2 bg-[#ff4d6d]" />
        <span className="pointer-events-none absolute -right-[10px] -top-[10px] h-2 w-2 bg-[#ff4d6d]" />
        <span className="pointer-events-none absolute -bottom-[10px] -left-[10px] h-2 w-2 bg-[#ff4d6d]" />
        <span className="pointer-events-none absolute -bottom-[10px] -right-[10px] h-2 w-2 bg-[#ff4d6d]" />
      </>}
      {children}
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 border-2 border-[#2c1f4d] bg-[#0d0619] px-2 py-2">
      <span className="font-pixel text-[7px] text-[#6f5fa8]">{label}</span>
      <span className="font-pixel text-[11px]" style={{ color: color ?? '#ffffff' }}>
        {value}
      </span>
    </div>
  );
}
