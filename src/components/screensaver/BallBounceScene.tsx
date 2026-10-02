import React, { useMemo } from 'react';
import { Ball } from '../ui';

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const waypoint = () => `translate(${rand(-42, 42)}vw, ${rand(-36, 36)}vh)`;

/**
 * A complete non sequitur, on purpose: pool balls careening around and
 * "bouncing" off the edges, DVD-logo style. No data, no point to it — the
 * over-the-top unrelated filler bowling alleys have always put between frames.
 */
export const BallBounceScene: React.FC = () => {
  const balls = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => ({
        n: ((index * 2 + 1) % 15) || 15,
        size: rand(40, 72),
        style: {
          ['--p0' as string]: waypoint(),
          ['--p1' as string]: waypoint(),
          ['--p2' as string]: waypoint(),
          ['--p3' as string]: waypoint(),
          animationDuration: `${(5 + Math.random() * 3).toFixed(2)}s`,
          animationDelay: `${rand(0, 1500)}ms`,
        } as React.CSSProperties,
      })),
    []
  );

  return (
    <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
      {balls.map((ball, index) => (
        <Ball key={index} n={ball.n} size={ball.size} className="ball-bounce" style={ball.style} />
      ))}
    </div>
  );
};
