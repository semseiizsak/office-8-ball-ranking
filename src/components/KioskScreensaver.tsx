import React, { useEffect, useMemo, useState } from 'react';
import { Challenge, LobbyMessage, MatchRecord, Player } from '../types';
import { LeagueInsights } from '../utils/league';
import { KioskChatFeed } from './LobbyChat';
import { BallClashScene } from './screensaver/BallClashScene';
import { StatSpotlightScene } from './screensaver/StatSpotlightScene';
import { BowlingScene } from './screensaver/BowlingScene';
import { LeaderboardSpotlightScene } from './screensaver/LeaderboardSpotlightScene';
import { FunFactScene } from './screensaver/FunFactScene';
import { BallFloodScene } from './screensaver/BallFloodScene';
import { BallBounceScene } from './screensaver/BallBounceScene';
import { LuckyNumberScene } from './screensaver/LuckyNumberScene';

/** Seconds each screensaver scene stays before auto-advancing. */
const SCENE_SECONDS = 7;

/**
 * Nobody stands at a wall display, so an idle kiosk shouldn't just sit on a
 * static ladder all day. A loop of small, goofy scenes — reusing the same
 * clashes, bursts and entrances the rest of the app already animates with —
 * until someone taps the screen and it's back to work. The office chat runs
 * underneath, so the wall still shows what the room is saying.
 */
export const KioskScreensaver: React.FC<{
  players: Player[];
  matches: MatchRecord[];
  league: LeagueInsights;
  subscribeToChat: (onChange: (messages: LobbyMessage[]) => void) => () => void;
  onDismiss: () => void;
}> = ({ players, matches, league, subscribeToChat, onDismiss }) => {
  // Picked once per idle session, not re-rolled every scene, so one idle
  // stretch tells one little "story" instead of flickering between players.
  const [p1, p2] = useMemo(() => {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }, [players]);
  const spotlight = useMemo(() => players[Math.floor(Math.random() * Math.max(1, players.length))], [players]);

  // Mostly spectacle, a couple of calm beats for pacing — leaning hard into
  // "overkill" per the brief, including a few scenes that are pure, unrelated
  // nonsense in the honored bowling-alley-screensaver tradition.
  const scenes = [
    <BallClashScene key="clash" left={p1} right={p2} />,
    <StatSpotlightScene key="stat" player={spotlight} />,
    <BallFloodScene key="flood" />,
    <BowlingScene key="bowl" player={p2} />,
    <LuckyNumberScene key="lucky" />,
    <LeaderboardSpotlightScene key="ladder" players={players} league={league} />,
    <BallBounceScene key="bounce" />,
    <FunFactScene key="fact" players={players} matches={matches} league={league} />,
  ];

  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setPage((current) => (current + 1) % scenes.length), SCENE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Screensaver: tap to start a game"
      onClick={onDismiss}
      onKeyDown={onDismiss}
      className="anim-fade fixed inset-0 z-[70] flex cursor-pointer flex-col overflow-hidden bg-bg text-white"
    >
      <div className="relative flex h-[50%] flex-none flex-col overflow-hidden">{scenes[page]}</div>
      <div className="flex min-h-0 flex-1 flex-col rounded-t-[32px] bg-card px-6 pb-[calc(var(--safe-bottom)+1.25rem)] pt-6">
        <KioskChatFeed subscribe={subscribeToChat} players={players} />
        <span className="mt-5 flex h-[60px] w-full flex-none items-center justify-center gap-2.5 rounded-full bg-live text-base font-extrabold uppercase tracking-[0.06em]">
          <span className="live-dot h-[10px] w-[10px]" />
          Tap anywhere to start a game
        </span>
      </div>
    </div>
  );
};
