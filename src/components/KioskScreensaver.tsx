import React, { useEffect, useMemo, useState } from 'react';
import { Challenge, MatchRecord, Player } from '../types';
import { LeagueInsights } from '../utils/league';
import { BallClashScene } from './screensaver/BallClashScene';
import { StatSpotlightScene } from './screensaver/StatSpotlightScene';
import { BowlingScene } from './screensaver/BowlingScene';
import { LeaderboardSpotlightScene } from './screensaver/LeaderboardSpotlightScene';
import { FunFactScene } from './screensaver/FunFactScene';

/** Seconds each screensaver scene stays before auto-advancing. */
const SCENE_SECONDS = 7;

/**
 * Nobody stands at a wall display, so an idle kiosk shouldn't just sit on a
 * static ladder all day. A loop of small, goofy scenes — reusing the same
 * clashes, bursts and entrances the rest of the app already animates with —
 * until someone taps the screen and it's back to work.
 */
export const KioskScreensaver: React.FC<{
  players: Player[];
  matches: MatchRecord[];
  league: LeagueInsights;
  onDismiss: () => void;
}> = ({ players, matches, league, onDismiss }) => {
  // Picked once per idle session, not re-rolled every scene, so one idle
  // stretch tells one little "story" instead of flickering between players.
  const [p1, p2] = useMemo(() => {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }, [players]);
  const spotlight = useMemo(() => players[Math.floor(Math.random() * Math.max(1, players.length))], [players]);

  const scenes = [
    <BallClashScene key="clash" left={p1} right={p2} />,
    <StatSpotlightScene key="stat" player={spotlight} />,
    <BowlingScene key="bowl" player={p2} />,
    <LeaderboardSpotlightScene key="ladder" players={players} league={league} />,
    <FunFactScene key="fact" players={players} matches={matches} league={league} />,
  ];

  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setPage((current) => (current + 1) % scenes.length), SCENE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screensaver — tap to dismiss"
      onClick={onDismiss}
      className="anim-fade fixed inset-0 z-[70] flex flex-col overflow-hidden bg-bg"
    >
      {scenes[page]}
      <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
        Tap the screen
      </p>
    </div>
  );
};
