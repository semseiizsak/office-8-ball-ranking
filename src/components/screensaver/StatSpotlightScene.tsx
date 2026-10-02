import React, { useMemo, useRef } from 'react';
import { Player } from '../../types';
import { BallBurst, PlayerAvatar } from '../ui';
import { gsap, useGSAP, d } from '../../utils/gsap';

const STAT_PICKS = ['elo', 'wins', 'currentStreak', 'peakElo'] as const;
const STAT_LABELS: Record<(typeof STAT_PICKS)[number], string> = {
  elo: 'Current rating',
  wins: 'Total wins',
  currentStreak: 'Current streak',
  peakElo: 'Peak rating',
};

export const StatSpotlightScene: React.FC<{ player?: Player }> = ({ player }) => {
  const stat = useMemo(() => STAT_PICKS[Math.floor(Math.random() * STAT_PICKS.length)], []);

  const sceneRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const valueRef = useRef<HTMLParagraphElement>(null);

  const rawValue = player ? player[stat] : 0;
  const isStreak = stat === 'currentStreak';
  const targetValue = isStreak ? Math.abs(rawValue) : rawValue;

  useGSAP(
    () => {
      if (!player) return;
      const tl = gsap.timeline();
      tl.fromTo(
        avatarRef.current,
        { opacity: 0, scale: 0.3, rotateY: -60, y: 40 },
        { opacity: 1, scale: 1, rotateY: 0, y: 0, duration: d(0.6), ease: 'back.out(1.8)' }
      )
        .fromTo(nameRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: d(0.4) }, '-=0.25')
        .fromTo(labelRef.current, { opacity: 0 }, { opacity: 1, duration: d(0.35) }, '-=0.15');

      const counter = { val: 0 };
      tl.to(
        counter,
        {
          val: targetValue,
          duration: d(0.9),
          ease: 'power2.out',
          onUpdate: () => {
            if (!valueRef.current) return;
            const rounded = Math.round(counter.val);
            valueRef.current.textContent = isStreak ? `${rawValue > 0 ? '+' : rawValue < 0 ? '-' : ''}${rounded}` : String(rounded);
          },
        },
        '-=0.1'
      );
    },
    { scope: sceneRef, dependencies: [player?.id, stat] }
  );

  if (!player) return null;

  return (
    <div ref={sceneRef} className="relative grid w-full flex-1 place-items-center" style={{ perspective: 900 }}>
      <BallBurst />
      <div className="relative grid justify-items-center gap-3">
        <div ref={avatarRef}>
          <PlayerAvatar player={player} size={140} />
        </div>
        <h2 ref={nameRef} className="font-display text-4xl font-extrabold uppercase">
          {player.name.split(' ')[0]}
        </h2>
        <p ref={labelRef} className="text-sm font-semibold uppercase tracking-[0.1em] text-white/55">
          {STAT_LABELS[stat]}
        </p>
        <p ref={valueRef} className="text-6xl font-black tabular-nums">
          0
        </p>
      </div>
    </div>
  );
};
