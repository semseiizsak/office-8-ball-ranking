import { MatchRecord, Season } from '../types';
import { resolveCup, Tournament } from './tournament';

/** What a player finished the season before a card's season on: shown on the card, never stored on it. */
export interface PrevSeason {
  rank: number;
  winPct: number;
  cups: number;
}

export type PrevLookup = (seasonId: string, playerId: string) => PrevSeason | null;

/**
 * Reads the closed season right before a card's season: the final table gives the
 * rank and the record, the weekly cups that opened inside it give the titles.
 * A season's table is worked out once, the first time a card asks for it.
 */
export function buildPrevLookup(seasons: Season[], matches: MatchRecord[], tournaments: Tournament[]): PrevLookup {
  const cache = new Map<string, Map<string, PrevSeason>>();

  const tableOf = (season: Season) => {
    const known = cache.get(season.id);
    if (known) return known;
    const table = new Map<string, PrevSeason>();
    const end = season.endedAt ?? Infinity;
    const now = Date.now();
    const cups = new Map<string, number>();
    for (const cup of tournaments) {
      const monday = new Date(`${cup.week}T12:00:00`).getTime();
      if (!(monday >= season.startedAt && monday < end)) continue;
      try {
        const champion = resolveCup(cup, matches, now)?.champion;
        if (champion) cups.set(champion, (cups.get(champion) ?? 0) + 1);
      } catch {
        // A cup that cannot be resolved just does not count.
      }
    }
    for (const row of season.standings) {
      const played = row.wins + row.losses;
      table.set(row.playerId, { rank: row.rank, winPct: played ? Math.round((row.wins * 100) / played) : 0, cups: cups.get(row.playerId) ?? 0 });
    }
    cache.set(season.id, table);
    return table;
  };

  return (seasonId, playerId) => {
    const current = seasons.find((season) => season.id === seasonId);
    if (!current) return null;
    const previous = seasons.find((season) => season.number === current.number - 1 && season.endedAt !== null);
    return previous ? tableOf(previous).get(playerId) ?? null : null;
  };
}
