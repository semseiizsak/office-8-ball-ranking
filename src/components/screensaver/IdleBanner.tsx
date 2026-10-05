import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Trophy } from 'lucide-react';
import { MatchRecord, Player, Season } from '../../types';
import { Tournament } from '../../utils/tournament';
import { PlayerAvatar } from '../ui';
import { SeasonRaceChart } from '../SeasonRaceChart';
import { clockOf, firstName, idleCups, ladderOf } from './idleData';

/** Seconds each banner card stays before the next slides in. */
const CARD_SECONDS = 10;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-sm font-extrabold uppercase tracking-[0.14em] text-white/55">{children}</span>
);

const Headline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mt-1 block truncate font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em]">{children}</span>
);

/**
 * The thin strip above the idle chat: one card at a time, sliding on every
 * ten seconds. The cup, last week's champion, the season race in miniature,
 * the top three, and whoever is on a run.
 */
export const IdleBanner: React.FC<{
  players: Player[];
  matches: MatchRecord[];
  seasonMatches: MatchRecord[];
  season: Season;
  tournaments: Tournament[];
  now: number;
}> = ({ players, matches, seasonMatches, season, tournaments, now }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const { current, currentState, lastChampion } = useMemo(() => idleCups(tournaments, matches, now), [tournaments, matches, now]);
  const ladder = useMemo(() => ladderOf(players, seasonMatches), [players, seasonMatches]);
  const games = useMemo(() => [...seasonMatches].sort((a, b) => a.timestamp - b.timestamp), [seasonMatches]);
  const hottest = useMemo(() => [...players].sort((a, b) => b.currentStreak - a.currentStreak)[0], [players]);

  const cards: React.ReactNode[] = [];

  // The cup: sign up while it is open, otherwise where it stands.
  const signupOpen = !!current && now >= current.opensAt && now < current.closesAt;
  cards.push(
    <div key="cup" className={`flex h-full items-center gap-5 rounded-3xl px-6 ${signupOpen ? 'bg-felt text-white' : 'bg-surface-alt'}`}>
      <span className="cup-swing flex h-16 w-16 flex-none items-center justify-center rounded-full bg-crown text-bg">
        <Trophy className="h-8 w-8" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        {signupOpen ? (
          <>
            <span className="block text-sm font-extrabold uppercase tracking-[0.14em] text-white">Weekly cup</span>
            <Headline>Sign up now</Headline>
            <span className="mt-1 block text-lg font-semibold text-white">
              {current!.entrants.length} in, closes {clockOf(current!.closesAt)}
            </span>
          </>
        ) : currentState && !currentState.champion ? (
          <>
            <Label>Weekly cup</Label>
            <Headline>{currentState.current}</Headline>
            <span className="mt-1 block text-lg font-semibold text-white/60">{current!.field!.length} players. Final by Friday 17:00</span>
          </>
        ) : (
          <>
            <Label>Next weekly cup</Label>
            <Headline>Join on Monday</Headline>
            <span className="mt-1 block text-lg font-semibold text-white/60">Sign-ups from 8:00 until 12:00</span>
          </>
        )}
      </span>
    </div>
  );

  if (lastChampion?.state.champion) {
    const champ = byId.get(lastChampion.state.champion);
    cards.push(
      <div key="champ" className="flex h-full items-center gap-5 rounded-3xl bg-surface-alt px-6">
        <PlayerAvatar player={champ ?? null} size={72} />
        <span className="min-w-0">
          <Label>Last cup champion</Label>
          <Headline>{champ ? firstName(champ.name) : 'Former player'}</Headline>
        </span>
        <Trophy className="ml-auto h-12 w-12 flex-none text-crown" strokeWidth={2} />
      </div>
    );
  }

  if (games.length > 0 && ladder.length > 0) {
    const top = ladder.slice(0, 5).map((p) => p.id);
    const daysLeft = season.endsAt ? Math.max(0, Math.ceil((season.endsAt - now) / 86_400_000)) : null;
    cards.push(
      <div key="race" className="flex h-full items-center gap-6 rounded-3xl bg-surface-alt px-6">
        <span className="min-w-0 flex-none">
          <Label>The race</Label>
          <Headline>{firstName(ladder[0].name)} leads</Headline>
          <span className="mt-1 block text-lg font-semibold text-white/60">
            {daysLeft !== null ? `${daysLeft} days left in ${season.name}` : season.name}
          </span>
        </span>
        <span className="ml-auto block h-full min-w-0 flex-1 py-3">
          <SeasonRaceChart games={games} startingElo={season.startingElo} players={players} onlyIds={top} leaderId={top[0]} labels={false} width={420} height={110} drawMs={1600} />
        </span>
      </div>
    );
  }

  if (ladder.length >= 3) {
    cards.push(
      <div key="top" className="flex h-full items-center gap-6 rounded-3xl bg-surface-alt px-6">
        <Label>Top 3</Label>
        <span className="ml-auto grid flex-1 grid-cols-3 gap-4">
          {ladder.slice(0, 3).map((player, rank) => (
            <span key={player.id} className="flex min-w-0 items-center gap-3">
              <PlayerAvatar player={player} size={52} />
              <span className="min-w-0">
                <span className="block truncate text-2xl font-extrabold">{firstName(player.name)}</span>
                <span className={`block text-base font-bold tabular-nums ${rank === 0 ? 'text-crown' : 'text-white/60'}`}>{player.elo}</span>
              </span>
            </span>
          ))}
        </span>
      </div>
    );
  }

  if (hottest && hottest.currentStreak >= 2) {
    cards.push(
      <div key="fire" className="flex h-full items-center gap-5 rounded-3xl bg-surface-alt px-6">
        <PlayerAvatar player={hottest} size={72} />
        <span className="min-w-0">
          <Label>On fire</Label>
          <Headline>{firstName(hottest.name)}</Headline>
          <span className="mt-1 block text-lg font-semibold text-white/60">{hottest.currentStreak} wins in a row</span>
        </span>
        <Flame className="ml-auto h-12 w-12 flex-none text-live" strokeWidth={2} />
      </div>
    );
  }

  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setIndex((i) => i + 1), CARD_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [index]);
  const shown = index % cards.length;

  return (
    <div className="relative h-full overflow-hidden">
      <div key={shown} className="idle-card h-full">
        {cards[shown]}
      </div>
    </div>
  );
};
