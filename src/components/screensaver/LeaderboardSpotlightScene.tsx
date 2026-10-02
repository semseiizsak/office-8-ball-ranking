import React, { useMemo, useRef } from 'react';
import { Player } from '../../types';
import { LeagueInsights } from '../../utils/league';
import { PlayerAvatar } from '../ui';
import { gsap, useGSAP, d } from '../../utils/gsap';

/** A calmer beat between the goofy ones: the current top 3, flipping down into place like scoreboard flaps, elo counting up live. */
export const LeaderboardSpotlightScene: React.FC<{ players: Player[]; league: LeagueInsights }> = ({ players, league }) => {
  const top3 = useMemo(
    () =>
      [...players]
        .filter((player) => !league.insights.get(player.id)?.isDormant)
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 3),
    [players, league]
  );

  const sceneRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const eloRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useGSAP(
    () => {
      if (top3.length === 0) return;
      const tl = gsap.timeline();
      tl.fromTo(titleRef.current, { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: d(0.4) });
      tl.fromTo(
        rowRefs.current,
        { opacity: 0, rotateX: -70, y: -20, transformOrigin: 'top center' },
        { opacity: 1, rotateX: 0, y: 0, duration: d(0.55), ease: 'back.out(1.6)', stagger: 0.15 },
        '-=0.15'
      );

      top3.forEach((player, i) => {
        const el = eloRefs.current[i];
        if (!el) return;
        const counter = { val: 0 };
        tl.to(
          counter,
          {
            val: player.elo,
            duration: d(0.7),
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = String(Math.round(counter.val));
            },
          },
          i === 0 ? '-=0.3' : '-=0.55'
        );
      });
    },
    { scope: sceneRef, dependencies: [top3.map((p) => p.id).join(',')] }
  );

  if (top3.length === 0) return null;

  return (
    <div ref={sceneRef} className="relative grid w-full flex-1 content-center gap-6 px-8" style={{ perspective: 900 }}>
      <h2 ref={titleRef} className="text-center font-display text-3xl font-extrabold uppercase">
        Top of the ladder
      </h2>
      <div className="grid gap-3">
        {top3.map((player, index) => (
          <div
            key={player.id}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            className="flex items-center gap-3 rounded-2xl bg-card p-4"
          >
            <span
              className={`grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-black tabular-nums ${
                index === 0 ? 'bg-bg text-crown' : index === 1 ? 'bg-silver text-bg' : 'bg-bronze text-white'
              }`}
            >
              {index + 1}
            </span>
            <PlayerAvatar player={player} size={44} />
            <span className="flex-1 truncate text-lg font-bold">{player.name.split(' ')[0]}</span>
            <span
              ref={(el) => {
                eloRefs.current[index] = el;
              }}
              className="text-xl font-black tabular-nums"
            >
              0
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
