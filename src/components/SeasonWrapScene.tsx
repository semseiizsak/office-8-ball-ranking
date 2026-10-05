import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MatchRecord, Player, Season } from '../types';
import { matchesInSeason } from '../utils/league';
import { BallBurst, CountUp, PlayerAvatar } from './ui';
import { SeasonRaceChart } from './SeasonRaceChart';

const first = (name: string) => name.split(' ')[0];
const PAGE_SECONDS = [10, 7, 8, 9];

/**
 * The season wrap: four pages shown once when a season closes. The whole
 * race as one chart, the podium, the season's titles, and the viewer's own
 * season. Tap to go on, the arrow goes back, the cross closes it.
 */
export const SeasonWrapScene: React.FC<{
  season: Season;
  matches: MatchRecord[];
  players: Player[];
  currentPlayer: Player;
  onClose: () => void;
}> = ({ season, matches, players, currentPlayer, onClose }) => {
  const [page, setPage] = useState(0);
  const byId = new Map(players.map((p) => [p.id, p]));
  const games = useMemo(() => matchesInSeason(matches, season).sort((a, b) => a.timestamp - b.timestamp), [matches, season]);
  const standings = season.standings;
  const next = () => (page >= 3 ? onClose() : setPage(page + 1));
  const back = () => setPage(Math.max(0, page - 1));

  useEffect(() => {
    const timer = window.setTimeout(next, PAGE_SECONDS[page] * 1000);
    return () => window.clearTimeout(timer);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' || event.key === ' ') next();
      if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const racers = useMemo(() => new Set(games.flatMap((m) => [m.playerAId, m.playerBId])).size, [games]);

  // The viewer's own season.
  const mine = useMemo(() => {
    const own = games.filter((m) => m.playerAId === currentPlayer.id || m.playerBId === currentPlayer.id);
    const wins = own.filter((m) => m.winnerId === currentPlayer.id).length;
    let run = 0;
    let best = 0;
    for (const m of own) {
      run = m.winnerId === currentPlayer.id ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const against = new Map<string, { w: number; l: number }>();
    for (const m of own) {
      const other = m.playerAId === currentPlayer.id ? m.playerBId : m.playerAId;
      const row = against.get(other) ?? { w: 0, l: 0 };
      if (m.winnerId === currentPlayer.id) row.w++;
      else row.l++;
      against.set(other, row);
    }
    const nemesis = [...against].sort((a, b) => b[1].l - b[1].w - (a[1].l - a[1].w) || b[1].l - a[1].l)[0];
    const standing = standings.find((s) => s.playerId === currentPlayer.id);
    const start = season.startingElo[currentPlayer.id] ?? 1000;
    return { played: own.length, wins, losses: own.length - wins, best, nemesis, standing, start };
  }, [games, currentPlayer.id, standings, season.startingElo]);

  const podium = [1, 0, 2].map((i) => standings[i]).filter(Boolean);
  const heights = ['h-40', 'h-28', 'h-20'];
  const fills = ['bg-crown text-bg', 'bg-silver text-bg', 'bg-bronze text-white'];

  const body = [
    <span key="race" className="grid w-full max-w-md gap-4">
      <h2 className="wa-in text-[40px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-slide' }}>The race</h2>
      <span className="wa-in wa-d1 text-sm font-semibold text-white/70">
        {season.name}. {games.length} matches, {racers} players. Gold is the champion.
      </span>
      <span className="rounded-3xl bg-card p-3">{games.length > 0 ? (
          <SeasonRaceChart games={games} startingElo={season.startingElo} players={players} leaderId={standings[0]?.playerId} highlightId={currentPlayer.id} />
        ) : <span className="text-sm text-white/55">No matches this season.</span>}</span>
    </span>,
    <span key="podium" className="relative grid w-full max-w-sm gap-6">
      <BallBurst />
      <h2 className="wa-in text-[40px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-drop' }}>Champion</h2>
      <span className="grid grid-cols-3 items-end gap-2">
        {podium.map((spot) => {
          const rank = spot.rank - 1;
          const delay = 300 + (2 - rank) * 350;
          return (
            <span key={spot.playerId} className="grid justify-items-center gap-2">
              <span className="wa-in grid justify-items-center gap-1" style={{ ['--wa' as string]: 'wa-drop', animationDelay: `${delay + 300}ms` }}>
                {rank === 0 && <span className="text-2xl">👑</span>}
                <PlayerAvatar player={byId.get(spot.playerId) ?? null} size={rank === 0 ? 72 : 54} />
                <b className="max-w-full truncate text-sm">{first(spot.name)}</b>
                <span className="text-xs font-bold tabular-nums text-white/70">{spot.elo}</span>
              </span>
              <span className={`wa-podium grid w-full place-items-center rounded-t-xl font-display text-[34px] font-extrabold ${heights[rank]} ${fills[rank]}`} style={{ animationDelay: `${delay}ms` }}>
                {rank + 1}
              </span>
            </span>
          );
        })}
      </span>
      <span className="wa-in text-sm font-semibold text-white/65" style={{ ['--wa' as string]: 'wa-blur', animationDelay: '1500ms' }}>
        {standings[0] ? `${first(standings[0].name)} finishes on top with ${standings[0].wins} wins.` : ''}
      </span>
    </span>,
    <span key="titles" className="grid w-full max-w-sm gap-3">
      <h2 className="wa-in text-[40px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-zoom' }}>The titles</h2>
      {season.titles.slice(0, 6).map((title, index) => (
        <span key={title.key} className="wa-in flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 text-left" style={{ ['--wa' as string]: 'wa-slide', animationDelay: `${300 + index * 160}ms` }}>
          <span className="text-2xl">{title.emoji}</span>
          <span className="grid min-w-0 flex-1">
            <b className="truncate text-sm">{title.label}</b>
            <span className="truncate text-xs text-white/60">{title.valueLabel}</span>
          </span>
          <PlayerAvatar player={byId.get(title.holderId) ?? null} size={30} />
          <b className="max-w-[72px] truncate text-sm">{first(title.holderName)}</b>
        </span>
      ))}
      {season.titles.length === 0 && <span className="text-sm text-white/55">No titles this season.</span>}
    </span>,
    <span key="you" className="grid w-full max-w-sm justify-items-center gap-4">
      <span className="wa-in" style={{ ['--wa' as string]: 'wa-spin' }}><PlayerAvatar player={currentPlayer} size={96} /></span>
      <h2 className="wa-in wa-d1 text-[40px] leading-[1.05]" style={{ ['--wa' as string]: 'wa-wipe' }}>Your season</h2>
      <span className="grid w-full grid-cols-2 gap-2">
        {[
          ['Finished', mine.standing ? `#${mine.standing.rank}` : 'Did not play'],
          ['Rating', mine.standing ? mine.standing.elo : mine.start],
          ['Won', mine.wins],
          ['Lost', mine.losses],
          ['Best streak', mine.best],
          ['Change', mine.standing ? mine.standing.elo - mine.start : 0],
        ].map(([label, value], index) => (
          <span key={String(label)} className="wa-in grid gap-1 rounded-2xl bg-surface p-3 text-left" style={{ ['--wa' as string]: 'wa-rise', animationDelay: `${400 + index * 110}ms` }}>
            <b className="font-display text-[28px] font-extrabold leading-none tabular-nums">
              {typeof value === 'number' ? (
                <>
                  {label === 'Change' && value > 0 ? '+' : ''}
                  <CountUp to={value} delay={500 + index * 110} />
                </>
              ) : (
                value
              )}
            </b>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55">{label}</span>
          </span>
        ))}
      </span>
      {mine.nemesis && mine.nemesis[1].l > mine.nemesis[1].w && (
        <span className="wa-in text-sm font-semibold text-white/70" style={{ ['--wa' as string]: 'wa-blur', animationDelay: '1300ms' }}>
          Nemesis: {first(byId.get(mine.nemesis[0])?.name ?? '?')}, {mine.nemesis[1].w} to {mine.nemesis[1].l}.
        </span>
      )}
    </span>,
  ];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Season wrap" className="anim-fade fixed inset-0 z-[70] flex flex-col overflow-hidden bg-bg">
      <div className="relative z-10 flex gap-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        {PAGE_SECONDS.map((seconds, index) => (
          <span key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-alt">
            {index < page && <span className="block h-full w-full bg-white" />}
            {index === page && <span key={page} className="wa-fill block h-full w-full bg-white" style={{ animationDuration: `${seconds}s` }} />}
          </span>
        ))}
      </div>
      <div className="relative z-10 flex items-center justify-between px-4 pt-3">
        <button type="button" onClick={back} disabled={page === 0} aria-label="Previous" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-lg disabled:opacity-0">‹</button>
        <span className="text-xs font-semibold text-white/55">{season.name}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-lg">✕</button>
      </div>
      <button key={page} type="button" onClick={next} className="relative grid flex-1 place-items-center overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center">
        {body[page]}
      </button>
    </div>,
    document.body
  );
};
