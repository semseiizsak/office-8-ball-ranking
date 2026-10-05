import React, { useMemo } from 'react';
import { MatchRecord, Player } from '../types';
import { ballColor, playerBall } from '../utils/balls';

const first = (name: string) => name.split(' ')[0];

/**
 * The whole season as one chart: every player's rating after each match,
 * starting where they started. The leader runs in gold. Used by the season
 * wrap and by the wall tablet while it sits idle.
 */
export const SeasonRaceChart: React.FC<{
  /** The season's matches, oldest first. */
  games: MatchRecord[];
  startingElo: Record<string, number>;
  players: Player[];
  /** Drawn in gold; the highest rating at the end when left out. */
  leaderId?: string;
  /** Drawn a little heavier, for the viewer's own line. */
  highlightId?: string;
  /** Only these players' lines, e.g. the top few for a small chart. */
  onlyIds?: string[];
  /** Name and rating at the end of each line. */
  labels?: boolean;
  width?: number;
  height?: number;
  /** Room on the right for the end labels, in chart units. */
  labelWidth?: number;
  /** Slow the line drawing down for a big screen. */
  drawMs?: number;
}> = ({ games, startingElo, players, leaderId, highlightId, onlyIds, labels = true, width = 340, height = 300, labelWidth = 58, drawMs = 2200 }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const race = useMemo(() => {
    const ids = [...new Set(games.flatMap((m) => [m.playerAId, m.playerBId]))];
    const now = new Map(ids.map((id) => [id, startingElo[id] ?? 1000]));
    const series = new Map(ids.map((id) => [id, [now.get(id)!]]));
    for (const m of games) {
      // A record without the ratings after keeps the line where it was.
      if (m.playerAEloAfter) now.set(m.playerAId, m.playerAEloAfter);
      if (m.playerBEloAfter) now.set(m.playerBId, m.playerBEloAfter);
      for (const id of ids) series.get(id)!.push(now.get(id)!);
    }
    const shown = onlyIds ? ids.filter((id) => onlyIds.includes(id)) : ids;
    return { ids: shown, series };
  }, [games, startingElo, onlyIds]);

  if (race.ids.length === 0) return null;

  const W = width, H = height, L = 4, R = labels ? labelWidth : 4, T = 10, B = 10;
  const all = race.ids.flatMap((id) => race.series.get(id)!);
  const lo = Math.min(...all) - 10;
  const hi = Math.max(...all) + 10;
  const steps = Math.max(1, games.length);
  const x = (i: number) => L + (i * (W - L - R)) / steps;
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
  // End labels, nudged apart so no two names sit on top of each other.
  const ends = race.ids
    .map((id) => ({ id, v: race.series.get(id)!.at(-1)! }))
    .sort((a, b) => b.v - a.v)
    .map((end) => ({ ...end, ty: y(end.v) }));
  for (let i = 1; i < ends.length; i++) if (ends[i].ty - ends[i - 1].ty < 13) ends[i].ty = ends[i - 1].ty + 13;
  const leader = leaderId ?? ends[0]?.id;

  return (
    <svg
      viewBox={`0 0 ${W} ${Math.max(H, labels ? (ends.at(-1)?.ty ?? 0) + 12 : H)}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label="Every rating across the season"
    >
      {race.ids.map((id, index) => {
        const values = race.series.get(id)!;
        const player = byId.get(id);
        const colour = player ? ballColor(playerBall(player)).c : '#fff';
        const top = id === leader;
        const mine = id === highlightId;
        const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        return (
          <path
            key={id}
            d={d}
            fill="none"
            stroke={top ? '#F2B705' : colour}
            strokeWidth={top ? 3.2 : mine ? 2.6 : 1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={top || mine ? 1 : 0.8}
            pathLength={1}
            className="draw-line"
            style={{ animationDuration: `${drawMs}ms`, animationDelay: `${300 + index * 90}ms` }}
          />
        );
      })}
      {labels &&
        ends.map((end, index) => (
          <text
            key={end.id}
            x={W - R + 6}
            y={end.ty + 4}
            fill={end.id === leader ? '#F2B705' : end.id === highlightId ? '#fff' : 'rgba(255,255,255,.65)'}
            fontSize="10.5"
            fontWeight="800"
            className="anim-fade"
            style={{ animationDelay: `${drawMs + index * 60}ms` }}
          >
            {first(byId.get(end.id)?.name ?? '?')} {end.v}
          </text>
        ))}
    </svg>
  );
};
