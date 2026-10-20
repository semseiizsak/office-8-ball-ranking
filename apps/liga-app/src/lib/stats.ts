// Player, head to head, pair and crown stats (R1.4, R1.7, R1.10, R2.2, R2.3, R4, R5, R6).
// Everything is derived from matches and match_players, so it always agrees with the history.
import { db } from '@/lib/api';
import { avg, eloPreview } from '@/lib/elo';
import type { DB, StoredMatch, StoredMP } from '@/lib/engine';
import { daysSince } from '@/lib/time';
import type { MatchRow, Member } from '@/lib/types';

export const PROVISIONAL = 5; // matches before a player joins the ladder (R1.7)
export const DORMANT_DAYS = 14; // days without a match before the dormant section (R1.6)
export const UPSET = 0.4; // winner's chance below this marks an upset
export const PAIR_MIN = 3; // matches together before a pair is ranked (R1.10)
const DAY = 86400000;

export type Res = 'W' | 'L';
export type Entry = {
  match: MatchRow; mp: StoredMP; won: boolean; at: string;
  partners: string[]; opponents: string[]; chance: number; upset: boolean; oppRating: number;
};
export type Point = { at: string; rating: number; delta: number; matchId: string | null };
export type Tally = { played: number; won: number; net: number };
export type Rival = Tally & { id: string; lost: number; last: string };

const played = (m: Member) => m.wins + m.losses;

// Ladder order: rating, then more wins, then who got there first (earlier last match), then name.
export function ladderSort(list: Member[]) {
  return [...list].sort((a, b) => b.rating - a.rating || b.wins - a.wins || (a.last_played_at ?? '').localeCompare(b.last_played_at ?? '') || a.display_name.localeCompare(b.display_name));
}

// R1 sections: the ladder, new players still settling in, and dormant players.
export function splitLadder(members: Member[]) {
  const all = ladderSort(members);
  const fresh = all.filter((m) => played(m) < PROVISIONAL);
  const dormant = all.filter((m) => played(m) >= PROVISIONAL && daysSince(m.last_played_at) >= DORMANT_DAYS);
  const ranked = all.filter((m) => played(m) >= PROVISIONAL && daysSince(m.last_played_at) < DORMANT_DAYS);
  return { ranked, fresh, dormant };
}

export type Standing = { kind: 'ranked'; rank: number; of: number } | { kind: 'new'; left: number } | { kind: 'dormant'; days: number };
export function standingOf(members: Member[], id: string): Standing | null {
  const m = members.find((x) => x.id === id);
  if (!m) return null;
  const { ranked } = splitLadder(members);
  const i = ranked.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'ranked', rank: i + 1, of: ranked.length };
  if (played(m) < PROVISIONAL) return { kind: 'new', left: PROVISIONAL - played(m) };
  return { kind: 'dormant', days: daysSince(m.last_played_at) };
}

/* ---------- shared readers ---------- */
function leagueRows(d: DB, leagueId: string) {
  const matches = d.matches.filter((m) => m.league_id === leagueId).sort((a, b) => a.played_at.localeCompare(b.played_at));
  const ids = new Set(matches.map((m) => m.id));
  const mps = new Map<string, StoredMP[]>();
  d.mps.forEach((p) => { if (ids.has(p.match_id)) mps.set(p.match_id, [...(mps.get(p.match_id) ?? []), p]); });
  return { matches, mps, league: d.leagues.find((l) => l.id === leagueId) };
}
const row = (m: StoredMatch, ps: StoredMP[]): MatchRow => ({ ...m, match_players: ps });

function entriesFor(matches: StoredMatch[], mps: Map<string, StoredMP[]>, memberId: string): Entry[] {
  const out: Entry[] = [];
  for (const m of matches) {
    const ps = mps.get(m.id) ?? [];
    const mp = ps.find((p) => p.member_id === memberId);
    if (!mp) continue;
    const mine = ps.filter((p) => p.side === mp.side), theirs = ps.filter((p) => p.side !== mp.side);
    const chance = eloPreview(avg(mine.map((p) => p.rating_before)), avg(theirs.map((p) => p.rating_before))).chanceA;
    const won = m.winner === mp.side;
    out.push({
      match: row(m, ps), mp, won, at: m.played_at,
      partners: mine.filter((p) => p.member_id !== memberId).map((p) => p.member_id),
      opponents: theirs.map((p) => p.member_id),
      chance, upset: won ? chance < UPSET : 1 - chance < UPSET,
      oppRating: avg(theirs.map((p) => p.rating_before)),
    });
  }
  return out;
}

function streaks(results: boolean[]) {
  let best = 0, worst = 0, run = 0;
  for (const w of results) {
    run = w ? Math.max(run, 0) + 1 : Math.min(run, 0) - 1;
    best = Math.max(best, run); worst = Math.min(worst, run);
  }
  return { best, worst: -worst };
}

const tally = (list: Entry[]): Tally => ({ played: list.length, won: list.filter((e) => e.won).length, net: list.reduce((s, e) => s + e.mp.delta, 0) });

/* ---------- R2, R3, R4: one player ---------- */
export type PlayerStats = Awaited<ReturnType<typeof playerStats>>;

export async function playerStats(leagueId: string, memberId: string) {
  const d = await db();
  const { matches, mps, league } = leagueRows(d, leagueId);
  const entries = entriesFor(matches, mps, memberId);
  const start = league?.start_rating ?? 1000;

  const history: Point[] = [{ at: entries[0] ? new Date(new Date(entries[0].at).getTime() - 1).toISOString() : (league?.created_at ?? new Date().toISOString()), rating: start, delta: 0, matchId: null }];
  entries.forEach((e) => history.push({ at: e.at, rating: e.mp.rating_after, delta: e.mp.delta, matchId: e.match.id }));
  const ratings = history.map((p) => p.rating);
  const gains = entries.map((e) => e.mp.delta);

  const { best, worst } = streaks(entries.map((e) => e.won));
  const form: Res[] = entries.slice(-10).map((e) => (e.won ? 'W' : 'L'));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const byFormat = { '1v1': tally(entries.filter((e) => e.match.format === '1v1')), '2v2': tally(entries.filter((e) => e.match.format === '2v2')) };
  const upsets = { won: entries.filter((e) => e.won && e.upset).length, lost: entries.filter((e) => !e.won && e.upset).length };

  const partnerMap = new Map<string, Entry[]>();
  entries.forEach((e) => e.partners.forEach((p) => partnerMap.set(p, [...(partnerMap.get(p) ?? []), e])));
  const byPartner = [...partnerMap].map(([id, list]) => ({ id, ...tally(list) })).sort((a, b) => b.played - a.played);
  const rated = byPartner.filter((p) => p.played >= PAIR_MIN);
  const bestPartner = [...rated].sort((a, b) => b.won / b.played - a.won / a.played || b.played - a.played)[0] ?? null;
  const toughestPartner = [...rated].sort((a, b) => a.won / a.played - b.won / b.played || b.played - a.played).find((p) => p.id !== bestPartner?.id && p.won / p.played < 0.5) ?? null;

  // Monday first.
  const byWeekday = Array.from({ length: 7 }, (_, i) => tally(entries.filter((e) => (new Date(e.at).getDay() + 6) % 7 === i)));

  const oppMap = new Map<string, Entry[]>();
  entries.forEach((e) => e.opponents.forEach((o) => oppMap.set(o, [...(oppMap.get(o) ?? []), e])));
  const rivals: Rival[] = [...oppMap].map(([id, list]) => ({ id, ...tally(list), lost: list.filter((e) => !e.won).length, last: list[list.length - 1].at }))
    .sort((a, b) => b.played - a.played || b.last.localeCompare(a.last));
  const eligible = rivals.filter((r) => r.played >= 3);
  const nemesis = [...eligible].filter((r) => r.lost > r.won).sort((a, b) => a.won / a.played - b.won / b.played || b.lost - a.lost)[0] ?? null;
  const victim = [...eligible].filter((r) => r.won > r.lost).sort((a, b) => b.won / b.played - a.won / a.played || b.won - a.won)[0] ?? null;
  const lastRun = (id: string) => {
    const list = (oppMap.get(id) ?? []).slice().reverse();
    const first = list[0]?.won;
    let n = 0;
    for (const e of list) { if (e.won !== first) break; n++; }
    return { won: !!first, n };
  };

  const biggestWin = entries.filter((e) => e.won).sort((a, b) => b.mp.delta - a.mp.delta)[0] ?? null;

  return {
    entries, history, form, byFormat, upsets, byPartner, bestPartner, toughestPartner, byWeekday, rivals, nemesis, victim, biggestWin,
    lastRun,
    played: entries.length,
    won: entries.filter((e) => e.won).length,
    peak: Math.max(...ratings),
    low: Math.min(...ratings),
    biggestGain: Math.max(0, ...gains),
    biggestDrop: Math.min(0, ...gains),
    bestStreak: best,
    worstStreak: worst,
    avgOpp: entries.length ? Math.round(avg(entries.map((e) => e.oppRating))) : null,
    today: entries.filter((e) => new Date(e.at) >= today).reduce((s, e) => s + e.mp.delta, 0),
    playedToday: entries.some((e) => new Date(e.at) >= today),
    k: league?.k_factor ?? 32,
    start,
  };
}

// Rating line for a period (R4): the last point before the window becomes the start, so the line never jumps.
export function historySince(history: Point[], days: number | null) {
  if (days === null || history.length < 2) return history;
  const from = Date.now() - days * DAY;
  const i = history.findIndex((p) => new Date(p.at).getTime() >= from);
  if (i < 0) return history.slice(-1);
  return history.slice(Math.max(0, i - 1));
}

/* ---------- R5: head to head ---------- */
export async function headToHead(leagueId: string, a: string, b: string) {
  const d = await db();
  const { matches, mps, league } = leagueRows(d, leagueId);
  const shared = entriesFor(matches, mps, a).filter((e) => e.opponents.includes(b));
  const aWins = shared.filter((e) => e.won).length;

  // Longest run of wins by one side inside the rivalry.
  let run = { who: '', n: 0, at: '' }, cur = { who: '', n: 0 };
  for (const e of shared) {
    const who = e.won ? a : b;
    cur = cur.who === who ? { who, n: cur.n + 1 } : { who, n: 1 };
    if (cur.n > run.n) run = { ...cur, at: e.at };
  }
  const upsets = shared.filter((e) => e.upset).map((e) => ({ who: e.won ? a : b, delta: Math.abs(e.mp.delta), at: e.at, matchId: e.match.id }));
  const biggestUpset = upsets.sort((x, y) => y.delta - x.delta)[0] ?? null;

  return {
    played: shared.length, aWins, bWins: shared.length - aWins,
    swing: shared.reduce((s, e) => s + e.mp.delta, 0),
    first: shared[0]?.at ?? null,
    form: shared.slice(-10).map((e) => (e.won ? 'W' : 'L') as Res),
    longest: run.n >= 2 ? run : null,
    biggestUpset,
    matches: shared.map((e) => e.match).reverse(),
    k: league?.k_factor ?? 32,
  };
}

/* ---------- R1.10, R1.10.1: pairs ---------- */
export type Pair = { key: string; a: string; b: string; rating: number; peak: number; played: number; won: number; last: string; bestStreak: number; history: number[] };
const pairKey = (x: string, y: string) => [x, y].sort().join('+');

// Pair ratings are replayed from every 2v2 match: each pair is its own Elo player, same K and start as the league.
export async function pairRatings(leagueId: string) {
  const d = await db();
  const { matches, mps, league } = leagueRows(d, leagueId);
  const start = league?.start_rating ?? 1000, k = league?.k_factor ?? 32;
  const pairs = new Map<string, Pair & { results: boolean[] }>();
  const vs = new Map<string, Map<string, { won: number; lost: number }>>();
  const get = (ids: string[]) => {
    const key = pairKey(ids[0], ids[1]);
    if (!pairs.has(key)) { const [a, b] = key.split('+'); pairs.set(key, { key, a, b, rating: start, peak: start, played: 0, won: 0, last: '', bestStreak: 0, history: [start], results: [] }); }
    return pairs.get(key)!;
  };
  for (const m of matches) {
    if (m.format !== '2v2') continue;
    const ps = mps.get(m.id) ?? [];
    const A = ps.filter((p) => p.side === 'a').map((p) => p.member_id), B = ps.filter((p) => p.side === 'b').map((p) => p.member_id);
    if (A.length !== 2 || B.length !== 2) continue;
    const pa = get(A), pb = get(B);
    const { aWins, bWins } = eloPreview(pa.rating, pb.rating, k);
    const da = m.winner === 'a' ? aWins : bWins;
    for (const [p, delta, won, other] of [[pa, da, m.winner === 'a', pb], [pb, -da, m.winner === 'b', pa]] as const) {
      p.rating += delta; p.peak = Math.max(p.peak, p.rating); p.played++; if (won) p.won++;
      p.last = m.played_at; p.history.push(p.rating); p.results.push(won);
      const row = vs.get(p.key) ?? new Map(); const r = row.get(other.key) ?? { won: 0, lost: 0 };
      if (won) r.won++; else r.lost++;
      row.set(other.key, r); vs.set(p.key, row);
    }
  }
  const list = [...pairs.values()].map(({ results, ...p }) => ({ ...p, bestStreak: streaks(results).best }));
  list.sort((x, y) => y.rating - x.rating || y.won - x.won);
  return {
    ranked: list.filter((p) => p.played >= PAIR_MIN),
    unranked: list.filter((p) => p.played < PAIR_MIN),
    opponents: (key: string) => [...(vs.get(key) ?? new Map<string, { won: number; lost: number }>())].map(([k2, r]) => ({ key: k2, ...r })),
    matches: (key: string) => matches.filter((m) => {
      const ps = mps.get(m.id) ?? [];
      const sides = (['a', 'b'] as const).map((s) => ps.filter((p) => p.side === s).map((p) => p.member_id));
      return m.format === '2v2' && sides.some((s) => s.length === 2 && pairKey(s[0], s[1]) === key);
    }).reverse().map((m) => row(m, mps.get(m.id) ?? [])),
    hasDoubles: matches.some((m) => m.format === '2v2'),
  };
}
export const splitPair = (key: string) => key.split('+') as [string, string];

/* ---------- R1.4: crown ---------- */
export type Reign = { holder: string; from: string; to: string | null; defences: number; takenBy: string | null };

// Replays the ladder after every match: the crown is #1 among players past their first PROVISIONAL matches.
// A defence is a match the holder wins while wearing the crown.
export async function crownHistory(leagueId: string, currentHolder: string | null) {
  const d = await db();
  const { matches, mps } = leagueRows(d, leagueId);
  const rating = new Map<string, number>(), count = new Map<string, number>(), wins = new Map<string, number>();
  const reigns: Reign[] = [];
  for (const m of matches) {
    const ps = mps.get(m.id) ?? [];
    const holder = reigns[reigns.length - 1]?.to === null ? reigns[reigns.length - 1].holder : null;
    ps.forEach((p) => { rating.set(p.member_id, p.rating_after); count.set(p.member_id, (count.get(p.member_id) ?? 0) + 1); if (p.side === m.winner) wins.set(p.member_id, (wins.get(p.member_id) ?? 0) + 1); });
    const top = [...rating].filter(([id]) => (count.get(id) ?? 0) >= PROVISIONAL)
      .sort((x, y) => y[1] - x[1] || (wins.get(y[0]) ?? 0) - (wins.get(x[0]) ?? 0))[0]?.[0] ?? null;
    if (top && top !== holder) {
      const last = reigns[reigns.length - 1];
      if (last && last.to === null) { last.to = m.played_at; last.takenBy = top; }
      reigns.push({ holder: top, from: m.played_at, to: null, defences: 0, takenBy: null });
    } else if (holder && ps.some((p) => p.member_id === holder && p.side === m.winner)) {
      reigns[reigns.length - 1].defences++;
    }
  }
  const live = reigns[reigns.length - 1];
  const current = live && live.to === null && live.holder === currentHolder ? live : null;
  return { current, past: reigns.filter((r) => r !== current).reverse().slice(0, 5) };
}
export const daysBetween = (from: string, to: string | null) => Math.max(0, Math.floor(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / DAY));
