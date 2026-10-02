import React, { useMemo } from 'react';
import { Ball } from '../ui';

const PAYOFFS = ["RACK 'EM!", 'GAME ON!', 'BREAK TIME!', 'LOADED!', 'FULL HOUSE!'];
const BALL_COUNT = 34;

/** The "wow" beat: the whole dark screen pops full of pool balls, then a big payoff word lands on top. */
export const BallFloodScene: React.FC = () => {
  const payoff = useMemo(() => PAYOFFS[Math.floor(Math.random() * PAYOFFS.length)], []);
  const balls = useMemo(
    () =>
      Array.from({ length: BALL_COUNT }, (_, index) => ({
        n: (index % 15) + 1,
        style: {
          left: `${Math.round(Math.random() * 100)}%`,
          top: `${Math.round(Math.random() * 100)}%`,
          ['--size' as string]: `${Math.round(32 + Math.random() * 48)}px`,
          ['--r' as string]: `${Math.round(Math.random() * 360 - 180)}deg`,
          animationDelay: `${Math.round(Math.random() * 1200)}ms`,
        } as React.CSSProperties,
      })),
    []
  );

  return (
    <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
      {balls.map((ball, index) => (
        <Ball key={index} n={ball.n} className="ball-pop" style={ball.style} />
      ))}
      <h2
        className="wa-in relative z-10 rounded-2xl bg-bg/80 px-7 py-4 text-center font-display text-5xl font-extrabold uppercase tracking-[-0.02em]"
        style={{ ['--wa' as string]: 'wa-slam', animationDelay: '950ms' }}
      >
        {payoff}
      </h2>
    </div>
  );
};
