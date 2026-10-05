import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MatchRecord, Player, Season } from '../../types';
import { Tournament } from '../../utils/tournament';
import { cupNames } from '../../utils/cupView';
import { PlayerAvatar } from '../ui';
import { CupBracket } from '../cup/CupBracket';
import { SeasonRaceChart } from '../SeasonRaceChart';
import { clockOf, firstName, idleCups, ladderOf, weekSwings } from './idleData';

const NO_SEEN = new Set<string>();

/**
 * Lays its content out at a phone-like width, then scales it up to fill the
 * space it has. The bracket is drawn for a phone and measures itself with
 * offsets, which a transform leaves alone, so its lines still line up.
 */
const ScaleToFit: React.FC<{ width: number; children: React.ReactNode }> = ({ width, children }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const h = inner.current.offsetHeight;
      const scale = Math.min(outer.current.clientWidth / width, h ? outer.current.clientHeight / h : 1);
      setFit({ scale, height: h });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={inner} className="absolute left-1/2 top-0 origin-top" style={{ width, transform: `translateX(-50%) scale(${fit.scale})` }}>
        {children}
      </div>
    </div>
  );
};
const noop = () => undefined;

/** The shared frame of a full-screen idle page: a big title, a subline, and the page. */
const Page: React.FC<{ kicker: string; title: string; subline?: string; children: React.ReactNode }> = ({ kicker, title, subline, children }) => (
  <div className="anim-fade flex min-h-0 flex-1 flex-col">
    <span className="text-sm font-extrabold uppercase tracking-[0.14em] text-white/55">{kicker}</span>
    <h1 className="mt-1 font-display text-6xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em]">{title}</h1>
    {subline && <p className="mt-2 text-xl font-semibold text-white/60">{subline}</p>}
    <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
  </div>
);

const FormDots: React.FC<{ form: ('W' | 'L')[] }> = ({ form }) => (
  <span className="flex gap-1.5">
    {[...form].slice(0, 5).reverse().map((result, index) => (
      <span key={index} className={`h-3.5 w-3.5 rounded-full ${result === 'W' ? 'bg-felt' : 'bg-loss'}`} />
    ))}
  </span>
);

/** Where the weekly cup stands: this week's bracket once drawn, otherwise the last one played. */
export const CupStandingsPage: React.FC<{
  players: Player[];
  matches: MatchRecord[];
  tournaments: Tournament[];
  now: number;
}> = ({ players, matches, tournaments, now }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const { current, currentState, lastPlayed } = useMemo(() => idleCups(tournaments, matches, now), [tournaments, matches, now]);
  const signupOpen = !!current && now >= current.opensAt && now < current.closesAt;

  if (signupOpen) {
    return (
      <Page kicker="Weekly cup" title="Sign-ups open" subline={`${current!.entrants.length} in so far. Draw at ${clockOf(current!.closesAt)}.`}>
        <div className="grid auto-rows-min grid-cols-2 gap-4">
          {current!.entrants.map((entry, index) => {
            const player = byId.get(entry.id);
            return (
              <span key={entry.id} className="card-drop flex items-center gap-4 rounded-3xl bg-felt px-5 py-4 text-white" style={{ animationDelay: `${index * 60}ms` }}>
                <PlayerAvatar player={player ?? null} size={56} />
                <span className="truncate font-display text-3xl font-extrabold uppercase">{player ? firstName(player.name) : '?'}</span>
              </span>
            );
          })}
        </div>
      </Page>
    );
  }

  const shown = currentState ? { cup: current!, state: currentState, thisWeek: true } : lastPlayed ? { ...lastPlayed, thisWeek: false } : null;
  if (!shown) {
    return (
      <Page kicker="Weekly cup" title="No cup yet" subline="Sign-ups open Monday from 8:00 until 12:00.">
        <span />
      </Page>
    );
  }
  const champion = shown.state.champion ? byId.get(shown.state.champion) : null;
  const title = champion ? `${firstName(champion.name)} won` : shown.state.current;
  const subline = shown.thisWeek
    ? `${shown.cup.field!.length} players. Final by Friday 17:00.`
    : `Last week's cup, ${shown.cup.field!.length} players.`;
  return (
    <Page kicker={shown.thisWeek ? 'Weekly cup' : 'Last cup'} title={title} subline={subline}>
      <ScaleToFit width={420}>
        <CupBracket
          state={shown.state}
          byId={byId}
          names={cupNames(shown.cup.field ?? [], byId)}
          meId=""
          seen={NO_SEEN}
          force
          motion
          base={300}
          silver={shown.thisWeek && !shown.state.champion && shown.state.unfinished}
          onSelectPlayer={noop}
        />
      </ScaleToFit>
    </Page>
  );
};

/** The whole season as one chart, the way the season wrap draws it, live. */
export const SeasonRacePage: React.FC<{
  players: Player[];
  seasonMatches: MatchRecord[];
  season: Season;
  now: number;
}> = ({ players, seasonMatches, season, now }) => {
  const games = useMemo(() => [...seasonMatches].sort((a, b) => a.timestamp - b.timestamp), [seasonMatches]);
  const ladder = useMemo(() => ladderOf(players, seasonMatches), [players, seasonMatches]);
  const daysLeft = season.endsAt ? Math.max(0, Math.ceil((season.endsAt - now) / 86_400_000)) : null;
  const subline = `${games.length} matches, ${ladder.length} players.${daysLeft !== null ? ` ${daysLeft} days to go.` : ''}`;
  return (
    <Page kicker={season.name} title="The race" subline={subline}>
      {games.length === 0 ? (
        <p className="text-2xl font-semibold text-white/55">No matches this season yet.</p>
      ) : (
        <div className="rounded-3xl bg-card p-5">
          <SeasonRaceChart games={games} startingElo={season.startingElo} players={players} leaderId={ladder[0]?.id} width={440} height={480} labelWidth={92} drawMs={3000} />
        </div>
      )}
    </Page>
  );
};

/** Who is on a run, who is in a hole, and the week's biggest movers. */
export const FormPage: React.FC<{
  players: Player[];
  seasonMatches: MatchRecord[];
  now: number;
}> = ({ players, seasonMatches, now }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const hot = useMemo(() => players.filter((p) => p.currentStreak >= 2).sort((a, b) => b.currentStreak - a.currentStreak).slice(0, 3), [players]);
  const cold = useMemo(() => players.filter((p) => p.currentStreak <= -2).sort((a, b) => a.currentStreak - b.currentStreak).slice(0, 3), [players]);
  const swings = useMemo(() => weekSwings(seasonMatches, now), [seasonMatches, now]);
  const riser = swings[0]?.delta > 0 ? swings[0] : null;
  const faller = swings.at(-1) && swings.at(-1)!.delta < 0 ? swings.at(-1)! : null;

  const row = (player: Player, note: string, index: number) => (
    <span key={player.id} className="card-drop flex items-center gap-4 rounded-3xl bg-card px-5 py-4" style={{ animationDelay: `${index * 80}ms` }}>
      <PlayerAvatar player={player} size={56} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-3xl font-extrabold uppercase leading-[1.05]">{firstName(player.name)}</span>
        <span className="mt-1 block text-lg font-semibold text-white/60">{note}</span>
      </span>
      <FormDots form={player.recentForm} />
    </span>
  );

  const mover = (entry: { id: string; delta: number }, label: string) => {
    const player = byId.get(entry.id);
    return (
      <span className="card-drop flex items-center gap-4 rounded-3xl bg-card px-5 py-4">
        <PlayerAvatar player={player ?? null} size={56} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
          <span className="block truncate font-display text-3xl font-extrabold uppercase leading-[1.05]">{player ? firstName(player.name) : '?'}</span>
        </span>
        <span className={`rounded-full px-4 py-1.5 text-2xl font-extrabold tabular-nums text-white ${entry.delta > 0 ? 'bg-felt' : 'bg-live'}`}>
          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
        </span>
      </span>
    );
  };

  return (
    <Page kicker="Form" title="Who's hot" subline="Runs, slumps and the week's biggest movers.">
      <div className="grid auto-rows-min gap-6">
        <section className="grid gap-3">
          <h2 className="text-2xl font-extrabold">On fire</h2>
          {hot.length ? hot.map((p, i) => row(p, `${p.currentStreak} wins in a row`, i)) : <p className="text-lg font-semibold text-white/55">Nobody on a run right now.</p>}
        </section>
        <section className="grid gap-3">
          <h2 className="text-2xl font-extrabold">Ice cold</h2>
          {cold.length ? (
            cold.map((p, i) => row(p, p.currentStreak <= -3 ? `Wall of shame, ${-p.currentStreak} losses` : `${-p.currentStreak} losses in a row`, i + 3))
          ) : (
            <p className="text-lg font-semibold text-white/55">Nobody in a slump. Suspicious.</p>
          )}
        </section>
        {(riser || faller) && (
          <section className="grid gap-3">
            <h2 className="text-2xl font-extrabold">Last 7 days</h2>
            {riser && mover(riser, 'Biggest climb')}
            {faller && mover(faller, 'Biggest drop')}
          </section>
        )}
      </div>
    </Page>
  );
};

const dayOf = (at: number, now: number) => {
  const date = new Date(at);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return clockOf(at);
  return `${date.toLocaleDateString('en-GB', { weekday: 'short' })} ${clockOf(at)}`;
};

/** The latest games, newest first: who won, who lost, what it was worth. */
export const RecentResultsPage: React.FC<{
  players: Player[];
  matches: MatchRecord[];
  now: number;
}> = ({ players, matches, now }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const latest = useMemo(() => [...matches].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10), [matches]);
  return (
    <Page kicker="Results" title="Latest games" subline="Winner on the left, with the rating they took.">
      <div className="grid auto-rows-min gap-3">
        {latest.map((match, index) => {
          const winnerIsA = match.winnerId === match.playerAId;
          const winnerName = winnerIsA ? match.playerAName : match.playerBName;
          const loserName = winnerIsA ? match.playerBName : match.playerAName;
          const winner = byId.get(match.winnerId) ?? { id: match.winnerId, name: winnerName, avatarUrl: '' };
          const loser = byId.get(match.loserId) ?? { id: match.loserId, name: loserName, avatarUrl: '' };
          const extras = [
            match.isUpset && '😱',
            match.bountyCollected > 0 && '👑',
            match.modifiers.tableRun && '🏃',
            match.modifiers.eightOnBreak && '💥',
          ].filter(Boolean) as string[];
          return (
            <span key={match.id} className="card-drop grid grid-cols-[88px_1fr_auto_1fr] items-center gap-4 rounded-3xl bg-card px-5 py-3.5" style={{ animationDelay: `${index * 70}ms` }}>
              <span className="text-base font-semibold tabular-nums text-white/55">{dayOf(match.timestamp, now)}</span>
              <span className="flex min-w-0 items-center gap-3">
                <PlayerAvatar player={winner} size={48} />
                <span className="min-w-0 truncate text-2xl font-extrabold">{firstName(winnerName)}</span>
                {extras.length > 0 && <span className="flex-none text-xl">{extras.join(' ')}</span>}
              </span>
              <span className="flex-none rounded-full bg-felt px-3 py-1 text-base font-extrabold tabular-nums text-white">+{match.eloDelta + match.bountyCollected}</span>
              <span className="flex min-w-0 items-center justify-end gap-3">
                <span className="min-w-0 truncate text-2xl font-bold text-white/60">{firstName(loserName)}</span>
                <PlayerAvatar player={loser} size={48} />
              </span>
            </span>
          );
        })}
      </div>
    </Page>
  );
};
