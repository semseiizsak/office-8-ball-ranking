// N2 Global search, M6.2 Search matches: players, matches by opponent or score, leagues. Local store only.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { db } from '@/lib/api';
import type { Member } from '@/lib/types';

export type PlayerHit = { member: Member; league: string; leagueId: string; mine: boolean };
export type MatchHit = { id: string; leagueId: string; title: string; score: string | null; played_at: string; result: 'W' | 'L' | null };
export type LeagueHit = { id: string; name: string; team: string; players: number };
export type Results = { players: PlayerHit[]; matches: MatchHit[]; leagues: LeagueHit[] };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const MIN_QUERY = 2;

export async function search(userId: string, query: string, scope: { leagueId: string | null; all: boolean }): Promise<Results> {
  const q = norm(query);
  const empty: Results = { players: [], matches: [], leagues: [] };
  if (q.length < MIN_QUERY) return empty;
  const d = await db();
  const mine = d.members.filter((m) => m.user_id === userId);
  const leagueIds = new Set(mine.map((m) => m.league_id).filter((id) => scope.all || id === scope.leagueId));
  const leagueName = (id: string) => d.leagues.find((l) => l.id === id)?.name ?? '';
  const hit = (s: string) => norm(s).includes(q);
  const rank = (s: string) => (norm(s).startsWith(q) ? 0 : 1);

  const players = d.members
    .filter((m) => leagueIds.has(m.league_id) && !m.status && hit(m.display_name))
    .sort((a, b) => rank(a.display_name) - rank(b.display_name) || b.rating - a.rating)
    .map((m) => ({ member: m, league: leagueName(m.league_id), leagueId: m.league_id, mine: m.user_id === userId }));

  // Matches by a player's name, or by score typed as 10:7, 10 7 or 10-7.
  const scoreQ = /^(\d{1,2})\D+(\d{1,2})$/.exec(q);
  const byId = new Map(d.members.map((m) => [m.id, m]));
  const matches: MatchHit[] = [];
  const sorted = d.matches.filter((m) => leagueIds.has(m.league_id)).sort((a, b) => b.played_at.localeCompare(a.played_at));
  for (const m of sorted) {
    const ps = d.mps.filter((p) => p.match_id === m.id);
    const me = ps.find((p) => byId.get(p.member_id)?.user_id === userId);
    const scoreHit = scoreQ && m.score_a != null && m.score_b != null
      && ((m.score_a === +scoreQ[1] && m.score_b === +scoreQ[2]) || (m.score_a === +scoreQ[2] && m.score_b === +scoreQ[1]));
    const nameHit = ps.some((p) => { const x = byId.get(p.member_id); return x && x.user_id !== userId && hit(x.display_name); });
    if (!scoreHit && !nameHit) continue;
    const label = (side: 'a' | 'b') => ps.filter((p) => p.side === side).map((p) => (p === me ? 'You' : byId.get(p.member_id)?.display_name ?? 'Former player')).join(' and ');
    const first = me?.side ?? 'a', second = first === 'a' ? 'b' : 'a';
    const s = m.score_a != null && m.score_b != null ? (first === 'a' ? `${m.score_a} : ${m.score_b}` : `${m.score_b} : ${m.score_a}`) : null;
    matches.push({ id: m.id, leagueId: m.league_id, title: `${label(first)} vs ${label(second)}`, score: s, played_at: m.played_at, result: me ? (m.winner === me.side ? 'W' : 'L') : null });
    if (matches.length >= 30) break;
  }

  const leagues = d.leagues
    .filter((l) => mine.some((m) => m.league_id === l.id) && (hit(l.name) || hit(d.teams.find((t) => t.id === l.team_id)?.name ?? '')))
    .map((l) => ({ id: l.id, name: l.name, team: d.teams.find((t) => t.id === l.team_id)?.name ?? '', players: d.members.filter((m) => m.league_id === l.id && !m.status).length }));

  return { players, matches, leagues };
}

/* ---------- recent searches (this phone only) ---------- */
const KEY = 'liga.search.recent';
export async function recentSearches(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as string[]; } catch { return []; }
}
export async function rememberSearch(q: string) {
  const v = q.trim();
  if (v.length < MIN_QUERY) return;
  const list = [v, ...(await recentSearches()).filter((x) => norm(x) !== norm(v))].slice(0, 6);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}
export async function clearRecent() { await AsyncStorage.removeItem(KEY); }
