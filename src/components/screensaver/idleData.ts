import { MatchRecord, Player } from '../../types';
import { CupState, Tournament, resolveCup, weekTournament } from '../../utils/tournament';

export const firstName = (name: string) => name.split(' ')[0];

export const clockOf = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** This week's cup as the wall sees it, plus the last one that crowned someone. */
export function idleCups(tournaments: Tournament[], matches: MatchRecord[], now: number) {
  const week = weekTournament(now).week;
  const current = tournaments.find((cup) => cup.week === week) ?? null;
  const currentState = current ? resolveCup(current, matches, now) : null;
  const past = tournaments
    .filter((cup) => cup.week !== week)
    .sort((a, b) => b.week.localeCompare(a.week))
    .map((cup) => ({ cup, state: resolveCup(cup, matches, now) }))
    .filter((entry): entry is { cup: Tournament; state: CupState } => entry.state !== null);
  const lastChampion = past.find((entry) => entry.state.champion) ?? null;
  return { current, currentState, lastPlayed: past[0] ?? null, lastChampion };
}

/** Everyone who has played this season, best rating first. */
export const ladderOf = (players: Player[], seasonMatches: MatchRecord[]) => {
  const played = new Set(seasonMatches.flatMap((m) => [m.playerAId, m.playerBId]));
  return players.filter((p) => played.has(p.id)).sort((a, b) => b.elo - a.elo);
};

/** Rating won or lost per player over the last seven days. */
export function weekSwings(seasonMatches: MatchRecord[], now: number) {
  const since = now - 7 * 86_400_000;
  const swing = new Map<string, number>();
  for (const m of seasonMatches) {
    if (m.timestamp < since) continue;
    swing.set(m.playerAId, (swing.get(m.playerAId) ?? 0) + (m.playerAEloAfter - m.playerAEloBefore));
    swing.set(m.playerBId, (swing.get(m.playerBId) ?? 0) + (m.playerBEloAfter - m.playerBEloBefore));
  }
  return [...swing].map(([id, delta]) => ({ id, delta: Math.round(delta) })).sort((a, b) => b.delta - a.delta);
}
