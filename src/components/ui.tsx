import React, { useMemo } from 'react';
import { Player } from '../types';
import { ballColor, playerBall } from '../utils/balls';

/** A pool ball drawn in CSS: solid 1-8, striped 9-15, the 8 in black. */
export const Ball: React.FC<{
  n: number;
  size?: number;
  /** Hide the number disc, for small balls where it would be noise. */
  bare?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ n, size = 44, bare, className = '', style }) => (
  <span
    aria-hidden="true"
    className={`ball${n > 8 ? ' striped' : ''}${n === 8 ? ' eight' : ''}${bare ? ' bare' : ''} ${className}`}
    style={{ ['--c' as string]: ballColor(n).c, ['--size' as string]: `${size}px`, ...style }}
  >
    <span className="n">{n}</span>
  </span>
);

/**
 * A player's face inside a ring in their ball colour, with the ball itself
 * tucked into the corner. Photo when there is one, initial when there is not.
 */
export const PlayerAvatar: React.FC<{
  player: Pick<Player, 'id' | 'name' | 'avatarUrl' | 'ball'> | null | undefined;
  size?: number;
  className?: string;
}> = ({ player, size = 44, className = '' }) => {
  const n = playerBall(player);
  return (
    <span
      aria-hidden="true"
      className={`pavatar${n > 8 ? ' striped' : ''}${n === 8 ? ' eight' : ''}${size < 40 ? ' small' : ''} ${className}`}
      style={{ ['--c' as string]: ballColor(n).c, ['--av' as string]: `${size}px` }}
    >
      <span className="ring" />
      <span className="face">
        {player?.avatarUrl ? (
          <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          (player?.name ?? '?').charAt(0)
        )}
      </span>
      <Ball n={n} size={Math.round(size * 0.42)} />
    </span>
  );
};

/** Fifteen balls breaking outward from the middle, for the moments worth celebrating. */
export const BallBurst: React.FC = () => {
  const balls = useMemo(
    () =>
      Array.from({ length: 15 }, (_, index) => {
        const angle = (index / 15) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const distance = 170 + Math.random() * 120;
        return {
          n: index + 1,
          style: {
            ['--x' as string]: `${Math.round(Math.cos(angle) * distance)}px`,
            ['--y' as string]: `${Math.round(Math.sin(angle) * distance * 1.4)}px`,
            ['--r' as string]: `${Math.round(Math.random() * 540 - 270)}deg`,
            ['--d' as string]: `${Math.round(Math.random() * 40)}ms`,
          } as React.CSSProperties,
        };
      }),
    []
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {balls.map((ball) => (
        <Ball key={ball.n} n={ball.n} size={44} className="burst-ball" style={ball.style} />
      ))}
    </div>
  );
};

/** Two-tone split showing how the room has called a match. */
export const CallSplit: React.FC<{
  left: { player: Pick<Player, 'id' | 'ball'>; count: number };
  right: { player: Pick<Player, 'id' | 'ball'>; count: number };
  mineId?: string | null;
  onRed?: boolean;
}> = ({ left, right, mineId, onRed }) => {
  const total = left.count + right.count;
  const leftShare = total ? Math.round((left.count / total) * 100) : 0;
  const rightShare = total ? 100 - leftShare : 0;
  const leftBall = playerBall(left.player);
  const rightBall = playerBall(right.player);
  const segment = (n: number, count: number) => (
    <span
      className="block min-w-0 basis-0 transition-[flex-grow] duration-300 ease-[var(--ease)]"
      style={{
        flexGrow: count || 0.001,
        background: ballColor(n).c,
        boxShadow: onRed ? 'inset 0 0 0 1.5px #fff' : n === 8 ? 'inset 0 0 0 1px rgba(255,255,255,.45)' : undefined,
      }}
    />
  );
  const legend = (n: number, share: number, count: number, id: string) => (
    <span style={{ color: onRed ? '#fff' : ballColor(n).t }}>
      <b className="mr-0.5 text-sm font-black tabular-nums">{share}%</b> {count} {count === 1 ? 'call' : 'calls'}
      {mineId === id && (
        <span className="ml-1 rounded-[5px] bg-white px-1.5 py-0.5 align-[1px] text-[9px] font-extrabold uppercase tracking-widest text-bg">You</span>
      )}
    </span>
  );
  return (
    <div className="grid gap-1.5" role="img" aria-label={`${left.count} calls against ${right.count}`}>
      <div className={`flex h-2.5 gap-0.5 overflow-hidden rounded-full ${onRed ? 'bg-bg' : 'bg-surface-alt'}`}>
        {total > 0 && (
          <>
            {segment(leftBall, left.count)}
            {segment(rightBall, right.count)}
          </>
        )}
      </div>
      {total > 0 ? (
        <div className="flex items-center justify-between text-xs font-semibold">
          {legend(leftBall, leftShare, left.count, left.player.id)}
          {legend(rightBall, rightShare, right.count, right.player.id)}
        </div>
      ) : (
        <div className={`text-center text-xs font-semibold ${onRed ? 'text-white' : 'text-white/55'}`}>No calls yet</div>
      )}
    </div>
  );
};

/**
 * A bottom sheet: dimmed backdrop, grab handle, title and close. Every task
 * that opens over a screen uses this, so they all slide the same way.
 */
export const Sheet: React.FC<{
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeDisabled?: boolean;
  z?: number;
  label?: string;
}> = ({ title, onClose, children, footer, closeDisabled, z = 50, label }) => {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, closeDisabled]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} className="fixed inset-0 flex items-end justify-center" style={{ zIndex: z }}>
      <button type="button" aria-label="Close" onClick={onClose} disabled={closeDisabled} className="anim-fade absolute inset-0 bg-black/60" />
      <div className="anim-sheet relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-elev">
        <div className="flex shrink-0 flex-col gap-2.5 px-4 pt-2.5">
          <span className="mx-auto h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 text-[22px]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close"
              className="press grid h-11 w-11 flex-none place-items-center rounded-full bg-surface-alt disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="no-scrollbar stagger grid flex-1 gap-4 overflow-y-auto px-4 pb-4 pt-4">{children}</div>
        {footer && <div className="shrink-0 px-4 pb-[calc(var(--safe-bottom)+1.25rem)] pt-1">{footer}</div>}
        {!footer && <div className="h-[calc(var(--safe-bottom)+0.75rem)] shrink-0" />}
      </div>
    </div>
  );
};

/** The stake pair shown before anything is committed: what a win and a loss are worth. */
export const StakeTiles: React.FC<{ win: number; lose: number; winNote?: string; loseNote?: string }> = ({ win, lose, winNote, loseNote }) => (
  <div className="grid grid-cols-2 gap-2">
    <div className="grid content-start gap-1.5 rounded-xl bg-surface p-3">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">If you win</span>
      <span className="text-[26px] font-black leading-none tabular-nums">+{win}</span>
      {winNote && <span className="text-xs font-semibold text-white/55">{winNote}</span>}
    </div>
    <div className="grid content-start gap-1.5 rounded-xl bg-surface p-3">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">If you lose</span>
      <span className="text-[26px] font-black leading-none tabular-nums">−{lose}</span>
      {loseNote && <span className="text-xs font-semibold text-white/55">{loseNote}</span>}
    </div>
  </div>
);

/** All fifteen balls to pick from. The player's colour everywhere comes from this. */
export const BallPicker: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-5 justify-items-center gap-1.5" role="radiogroup" aria-label="Pick a ball">
    {Array.from({ length: 15 }, (_, index) => index + 1).map((n) => (
      <button
        key={n}
        type="button"
        role="radio"
        aria-checked={value === n}
        aria-label={`Ball ${n}`}
        onClick={() => onChange(n)}
        className={`grid h-[50px] w-[50px] place-items-center rounded-full transition-shadow duration-300 ease-[var(--ease)] [&>span]:transition-transform [&>span]:duration-300 hover:[&>span]:-rotate-[25deg] ${
          value === n ? 'shadow-[0_0_0_2px_#fff]' : ''
        }`}
      >
        <Ball n={n} size={40} />
      </button>
    ))}
  </div>
);

export const fieldClass =
  'h-12 w-full rounded-xl bg-surface px-4 text-white outline-none placeholder:text-white/55 focus-visible:shadow-[inset_0_0_0_2px_#fff]';
export const labelClass = 'grid gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55';

/** Counts up from `from` to `to` once, ease-in-out, starting after `delay` ms. */
export const CountUp: React.FC<{ to: number; from?: number; delay?: number }> = ({ to, from = 0, delay = 0 }) => {
  const [value, setValue] = React.useState(from);
  React.useEffect(() => {
    // A hidden tab never paints a frame, and reduced motion wants no count, so land on the number straight away.
    if (document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / 900));
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setValue(Math.round(from + (to - from) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, from, delay]);
  return <>{value}</>;
};


