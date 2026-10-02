import React, { useMemo } from 'react';
import { Player } from '../../types';
import { Ball } from '../ui';

const RESULTS = [
  { word: 'STRIKE!', flavor: (name: string) => `${name} is on fire!` },
  { word: 'SPARE!', flavor: (name: string) => `${name} cleaned it up.` },
  { word: 'GUTTER BALL!', flavor: (name: string) => `Rough one for ${name}.` },
];

/** Bowling-alley goofiness: pool balls scattering like pins behind a big result word. */
export const BowlingScene: React.FC<{ player?: Player }> = ({ player }) => {
  const result = useMemo(() => RESULTS[Math.floor(Math.random() * RESULTS.length)], []);
  const pins = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        n: (index % 15) + 1,
        style: {
          ['--x' as string]: `${(Math.random() - 0.5) * 150}vw`,
          ['--y' as string]: `${(Math.random() - 0.5) * 110}vh`,
          ['--r' as string]: `${Math.round(Math.random() * 360)}deg`,
          animationDelay: `${index * 40}ms`,
        } as React.CSSProperties,
      })),
    []
  );
  const name = player?.name.split(' ')[0] ?? 'Someone';

  return (
    <div className="relative grid w-full flex-1 place-items-center overflow-hidden">
      {pins.map((pin, index) => (
        <Ball key={index} n={pin.n} size={44} className="bowl-pin" style={pin.style} />
      ))}
      <div className="relative grid justify-items-center gap-3">
        <h2 className="bowl-in font-display text-[64px] leading-none">{result.word}</h2>
        <p className="text-base font-semibold text-white/70">{result.flavor(name)}</p>
      </div>
    </div>
  );
};
