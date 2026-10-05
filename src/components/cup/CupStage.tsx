import React, { useEffect, useId, useState } from 'react';
import { Player } from '../../types';
import { CHAMPION_CHIPS, FINALIST_CHIPS } from '../../utils/tournament';
import { cupIn } from '../../utils/cupView';
import { CountUp, PlayerAvatar } from '../ui';

export type CrestTone = 'gold' | 'silver';
const TONE: Record<CrestTone, string> = { gold: '#F2B705', silver: '#C9CCD1' };

/** The cup's crest: a shield around the trophy with the 8 ball on it, and a sheen that passes over now and then. */
export const CupCrest: React.FC<{ tone: CrestTone; fastShine?: boolean }> = ({ tone, fastShine }) => {
  const id = useId().replace(/:/g, '');
  const c = TONE[tone];
  const shield = 'M48 2 L90 18 V56 C90 80 70 96 48 102 C26 96 6 80 6 56 V18 Z';
  return (
    <svg viewBox="0 0 96 104" width="96" height="104" aria-hidden="true" className="block">
      <defs>
        <clipPath id={`${id}-crest`}>
          <path d={shield} />
        </clipPath>
        <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity=".55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={shield} fill="#141414" stroke={c} strokeWidth="2" strokeLinejoin="round" />
      <path d={shield} fill="none" stroke={c} strokeWidth="1" strokeLinejoin="round" transform="translate(48 52) scale(.86) translate(-48 -52)" />
      <path d="M34 28 H62 V40 C62 50 56 56 48 56 C40 56 34 50 34 40 Z" fill={c} />
      <path d="M34 32 H28 C28 40 31 44 35 45" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M62 32 H68 C68 40 65 44 61 45" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M45 56 H51 V64 H45 Z" fill={c} />
      <path d="M38 64 H58 V70 H38 Z" fill={c} />
      <circle cx="48" cy="40" r="7" fill="#0A0A0A" />
      <circle cx="48" cy="40" r="3.4" fill="#F4F1E8" />
      <text x="48" y="41.8" textAnchor="middle" fill="#0A0A0A" style={{ font: '800 5px Inter, sans-serif' }}>8</text>
      <text x="48" y="86" textAnchor="middle" fill="#FFFFFF" letterSpacing="1" style={{ font: '800 8.5px Sora, Inter, sans-serif' }}>OFFICE CUP</text>
      <g clipPath={`url(#${id}-crest)`}>
        <rect x="-40" y="0" width="28" height="104" fill={`url(#${id}-shine)`} className="cup-shine" style={fastShine ? { animationDuration: '1.6s', animationDelay: '0ms' } : undefined} />
      </g>
    </svg>
  );
};

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 86_400_000;

/** Scoreboard tiles counting down to `to`, red for the last hour. Ticks on its own clock. */
export const CupCountdown: React.FC<{ to: number; caption: string; delay: number }> = ({ to, caption, delay }) => {
  const [at, setAt] = useState(() => Date.now());
  const left = Math.max(0, to - at);
  const underDay = left < DAY;
  useEffect(() => {
    const timer = window.setInterval(() => setAt(Date.now()), underDay ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [underDay]);
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  const tiles: Array<[number, string]> = underDay
    ? [[hours, 'Hrs'], [minutes, 'Min'], [seconds, 'Sec']]
    : [[days, 'Days'], [hours, 'Hrs'], [minutes, 'Min']];
  const urgent = left < 3_600_000;
  const label = underDay
    ? `${hours} hours ${minutes} minutes ${seconds} seconds left`
    : `${days} days ${hours} hours ${minutes} minutes left`;
  return (
    <div className="grid justify-items-center gap-2">
      <div role="timer" aria-label={label} className="flex justify-center gap-1.5">
        {tiles.map(([value, unit], index) => (
          <span
            key={unit}
            className={`cup-in grid h-[54px] w-[60px] content-center justify-items-center rounded-xl transition-colors duration-300 ease-[var(--ease)] ${urgent ? 'bg-live' : 'bg-surface'}`}
            style={cupIn('rise-in', delay + index * 70, 340)}
          >
            <span key={value} className="cup-digit font-display text-2xl font-extrabold leading-none tabular-nums text-white">{pad(value)}</span>
            <span className={`mt-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] ${urgent ? 'text-white' : 'text-white/55'}`}>{unit}</span>
          </span>
        ))}
      </div>
      <span className="cup-in text-xs font-semibold text-white/55" style={cupIn('rise-in', delay + 210, 340)}>{caption}</span>
    </div>
  );
};

/** What the week is worth: a gold pill with both prizes counting up and a sheen crossing it every few seconds. */
export const CupStakeBanner: React.FC<{ delay: number }> = ({ delay }) => (
  <div
    role="img"
    aria-label={`${CHAMPION_CHIPS} coins to the champion, ${FINALIST_CHIPS} to the runner up`}
    className="cup-in relative flex h-12 items-center justify-between overflow-hidden rounded-full bg-crown px-5 text-bg"
    style={cupIn('rise-in', delay, 360)}
  >
    <span aria-hidden="true" className="flex items-center gap-2">
      <span className="text-lg leading-none">🏆</span>
      <span className="flex items-baseline gap-1.5">
        <b className="font-display text-xl font-extrabold leading-none tabular-nums"><CountUp to={CHAMPION_CHIPS} delay={delay + 60} /></b>
        <span className="text-xs font-extrabold uppercase tracking-[0.08em]">Champion</span>
      </span>
    </span>
    <span aria-hidden="true" className="flex items-baseline gap-1.5">
      <b className="font-display text-base font-extrabold leading-none tabular-nums"><CountUp to={FINALIST_CHIPS} delay={delay + 60} /></b>
      <span className="text-xs font-extrabold uppercase tracking-[0.08em]">Runner up</span>
    </span>
    <span aria-hidden="true" className="cup-shine-x pointer-events-none absolute inset-y-0 left-0 w-[60px]" style={{ animationDelay: `${delay + 340}ms` }} />
  </div>
);

/** Last week's winner, kept on show until the next one is crowned. */
export const CupReigning: React.FC<{ player: Player; titles: number; delay: number; onSelect: () => void }> = ({ player, titles, delay, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className="cup-in press flex items-center gap-3 rounded-3xl bg-card p-4 text-left"
    style={cupIn('rise-in', delay, 360)}
  >
    <span className="flex-none rounded-full shadow-[0_0_0_2px_#F2B705]">
      <PlayerAvatar player={player} size={56} />
    </span>
    <span className="grid min-w-0 flex-1 gap-1">
      <b className="truncate font-display text-[22px] font-extrabold uppercase leading-none">{player.name.split(' ')[0]}</b>
      <span className="text-xs font-semibold text-white/55">Reigning champion</span>
    </span>
    <span className="flex flex-none items-center gap-1.5">
      <span className="text-2xl leading-none">🏆</span>
      <b className="text-[13px] font-extrabold tabular-nums">{titles}</b>
    </span>
  </button>
);

/**
 * The poster header: spotlight and beams on a black stage, the crest, one big
 * word and whatever the phase puts under it. Tapping the crest replays the intro.
 */
export const CupStage: React.FC<{
  title: string;
  subline: string;
  tone: CrestTone;
  /** Champion week: a stronger spotlight. */
  strong?: boolean;
  /** The draw is running: the crest's sheen passes every 1.6 s. */
  drawing?: boolean;
  onReplay: () => void;
  /** Small buttons pinned to the top corner: the rules, the cup history. */
  corner?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, subline, tone, strong, drawing, onReplay, corner, children }) => {
  const silver = tone === 'silver';
  const spot = silver ? 'rgba(201,204,209,.12)' : `rgba(242,183,5,${strong ? 0.36 : 0.26})`;
  return (
    <header className="relative isolate -mx-4 overflow-hidden px-4 pb-5 pt-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[-1]" style={{ background: 'linear-gradient(180deg, #141414 0%, #0A0A0A 72%)' }} />
      <div aria-hidden="true" className="cup-in pointer-events-none absolute inset-0 z-[-1]" style={cupIn('anim-fade', 0, 600)}>
        <div
          className={`absolute left-1/2 top-[-120px] ml-[-210px] h-[420px] w-[420px] rounded-full ${silver ? 'opacity-70' : 'cup-glow'}`}
          style={{ background: `radial-gradient(circle, ${spot} 0%, rgba(0,0,0,0) 64%)` }}
        />
        <div className="cup-beam absolute left-[8%] top-[-80px] h-[520px] w-[90px] origin-top rotate-[-24deg]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 70%)' }} />
        <div className="cup-beam absolute right-[8%] top-[-80px] h-[520px] w-[90px] origin-top rotate-[24deg]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 70%)', animationDelay: '-3.5s' }} />
      </div>

      {corner && <div className="absolute right-4 top-4 z-10 flex gap-1.5">{corner}</div>}
      <div className="grid justify-items-center text-center">
        <button type="button" aria-label="Replay the cup intro" onClick={onReplay} className="cup-in press rounded-2xl" style={cupIn('cup-crest-in', 80, 560)}>
          <CupCrest tone={tone} fastShine={drawing} />
        </button>
        <h1
          className="cup-in mt-3 whitespace-nowrap font-display font-extrabold uppercase text-white"
          style={{ ...cupIn('wa-wipe', 240, 620), fontSize: 'clamp(40px, 13.5vw, 56px)', lineHeight: 0.95, letterSpacing: '-0.03em' }}
        >
          {title}
        </h1>
        <p className="cup-in mt-2 text-[13px] font-semibold text-white/55" style={cupIn('rise-in', 380, 340)}>{subline}</p>
      </div>
      {children && <div className="mt-4 grid gap-2.5">{children}</div>}
    </header>
  );
};
