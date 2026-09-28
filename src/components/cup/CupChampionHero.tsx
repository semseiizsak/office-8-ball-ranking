import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '../../types';
import { CHAMPION_CHIPS } from '../../utils/tournament';
import { cupIn } from '../../utils/cupView';
import { BallBurst, CountUp, PlayerAvatar } from '../ui';

const CONFETTI = ['#FFFFFF', '#0A0A0A', '#0B7A3E', '#C9CCD1'];

/** Paper falling over the gold card, once. */
const CupConfetti: React.FC<{ delay: number }> = ({ delay }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        left: `${Math.round(Math.random() * 96)}%`,
        background: CONFETTI[index % CONFETTI.length],
        ['--t' as string]: `${(2.2 + Math.random()).toFixed(2)}s`,
        ['--d' as string]: `${delay + Math.round(Math.random() * 900)}ms`,
        ['--r' as string]: `${Math.round(Math.random() * 720 - 360)}deg`,
      })),
    [delay]
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((style, index) => (
        <span key={index} className="cup-confetti wa-rain h-2.5 w-1.5 rounded-[1px]" style={style as React.CSSProperties} />
      ))}
    </div>
  );
};

/**
 * The week's winner on a gold card: trophy, face, name and the chips they
 * took. The first time a viewer sees it the balls burst and paper falls.
 */
export const CupChampionHero: React.FC<{
  champion: Player | null;
  championId: string;
  name: string;
  runnerUp: Player | null;
  runnerUpName: string;
  titles: number;
  isMe: boolean;
  celebrate: boolean;
  motion: boolean;
  delay: number;
  onSelect: () => void;
}> = ({ champion, championId, name, runnerUp, runnerUpName, titles, isMe, celebrate, motion, delay, onSelect }) => {
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!celebrate || !motion) return;
    const on = window.setTimeout(() => setBurst(true), delay + 260);
    const off = window.setTimeout(() => setBurst(false), delay + 960);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [celebrate, motion, delay]);
  // Timings are relative to the card's own slot in the choreography.
  const t = (at: number) => delay + at - 640;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!champion}
      aria-label={`${name}, champion. ${CHAMPION_CHIPS} chips`}
      className="cup-in press relative grid justify-items-center gap-2 overflow-hidden rounded-[28px] bg-crown p-5 text-center text-bg"
      style={cupIn('cup-final-in', delay, 420)}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 28%, rgba(255,255,255,.35), rgba(255,255,255,0) 60%)' }} />
      {burst && <BallBurst />}
      {celebrate && motion && <CupConfetti delay={t(900)} />}
      <span className="cup-in relative" style={cupIn('cup-trophy-rise', t(760), 640)}>
        <span className="wa-float block text-[56px] leading-none" style={{ animationDelay: `${t(1400)}ms` }}>🏆</span>
      </span>
      <span className="cup-in relative rounded-full shadow-[0_0_0_3px_#0A0A0A]" style={cupIn('anim-pop', t(880), 340)}>
        <PlayerAvatar player={champion ?? { id: championId, name: '?', avatarUrl: '' }} size={96} />
      </span>
      <b
        className="cup-in relative line-clamp-2 font-display font-extrabold uppercase text-bg [overflow-wrap:anywhere]"
        style={{ ...cupIn('wa-wipe', t(980), 620), fontSize: 'clamp(32px, 11vw, 44px)', lineHeight: 1 }}
      >
        {name}
      </b>
      <span className="relative font-display text-xl font-extrabold tabular-nums">
        +<CountUp to={CHAMPION_CHIPS} delay={t(1100)} /> chips
      </span>
      <span className="relative text-[13px] font-bold">{titles <= 1 ? 'First title' : `Title number ${titles}`}</span>
      {isMe && (
        <span className="relative flex h-7 items-center rounded-full bg-bg px-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">That's you</span>
      )}
      {runnerUpName && (
        <span className="relative flex items-center gap-2 text-[13px] font-bold">
          <PlayerAvatar player={runnerUp} size={24} />
          Beat {runnerUpName} in the final
        </span>
      )}
    </button>
  );
};
