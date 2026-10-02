import React, { useEffect, useState } from 'react';
import { Ball, BallBurst } from '../ui';

const LINES = ['The balls have spoken.', "Today's lucky number.", 'Destiny rolls again.', 'The table has decided.'];
const SPIN_MS = 1400;

/** Pure nonsense, on purpose — a fortune-teller slot spin landing on a random ball. Not tied to any player or stat, just the "why is this even here" spectacle a bowling alley screensaver swears by. */
export const LuckyNumberScene: React.FC = () => {
  const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)]);
  const [n, setN] = useState(() => 1 + Math.floor(Math.random() * 15));
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    let tick = 0;
    const interval = window.setInterval(() => {
      tick += 1;
      setN(1 + ((tick * 7) % 15));
    }, 80);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setN(1 + Math.floor(Math.random() * 15));
      setSpinning(false);
    }, SPIN_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-5">
      {!spinning && <BallBurst />}
      <p className="relative z-10 text-sm font-semibold uppercase tracking-[0.14em] text-white/55">{line}</p>
      <Ball key={spinning ? 'spin' : 'final'} n={n} size={150} className={spinning ? '' : 'ball-pop'} />
      {!spinning && (
        <p
          className="wa-in relative z-10 font-display text-3xl font-extrabold uppercase"
          style={{ ['--wa' as string]: 'wa-rise', animationDelay: '120ms' }}
        >
          Lucky number {n}
        </p>
      )}
    </div>
  );
};
