import React, { useRef } from 'react';
import { MatchRecord, Player } from '../../types';
import { LeagueInsights } from '../../utils/league';
import { gsap, useGSAP, d, prefersReducedMotion } from '../../utils/gsap';

export const FunFactScene: React.FC<{ players: Player[]; matches: MatchRecord[]; league: LeagueInsights }> = ({
  players,
  matches,
  league,
}) => {
  const crownHolder = players.find((player) => player.id === league.crown.holderId);

  const sceneRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const crownRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline();
      tl.fromTo(
        emojiRef.current,
        { opacity: 0, scale: 0, rotate: -40 },
        { opacity: 1, scale: 1, rotate: 0, duration: d(0.5), ease: 'back.out(2.4)' }
      );

      const counter = { val: 0 };
      tl.to(
        counter,
        {
          val: matches.length,
          duration: d(0.8),
          ease: 'power2.out',
          onUpdate: () => {
            if (!countRef.current) return;
            countRef.current.textContent = `${Math.round(counter.val)} matches played this season`;
          },
        },
        '-=0.1'
      );

      if (crownHolder) {
        tl.fromTo(crownRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: d(0.4) }, '-=0.2');
      }

      if (!prefersReducedMotion()) {
        tl.to(emojiRef.current, { y: -8, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 }, '>');
      }
    },
    { scope: sceneRef, dependencies: [matches.length, crownHolder?.id] }
  );

  return (
    <div ref={sceneRef} className="relative grid w-full flex-1 place-items-center gap-4 px-8 text-center">
      <span ref={emojiRef} className="text-6xl">
        🎱
      </span>
      <p ref={countRef} className="text-2xl font-bold">
        0 matches played this season
      </p>
      {crownHolder && (
        <p ref={crownRef} className="text-base font-semibold text-white/70">
          👑 {crownHolder.name.split(' ')[0]} holds the crown{league.crown.bounty > 0 ? ` — ${league.crown.bounty} bounty riding` : ''}
        </p>
      )}
    </div>
  );
};
