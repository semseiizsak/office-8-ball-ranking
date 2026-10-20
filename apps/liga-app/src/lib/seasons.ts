// Seasons module (G3, G3.1, G3.4, G3.6, G3.7, M6.3, M6.4, R1.9, B4.6, K7.2) plus dormant notices (R1.6).
// Seasons are derived, never stored: boundaries come from the league's creation date, its timezone and
// the season length; standings replay the season's matches with a soft reset (carry over) at every start.
// Only closed boundaries from manual ends or length changes are saved, in league.season.ends.
import { db, save, wait, type User } from '@/lib/api';
import { avg, eloPreview } from '@/lib/elo';
import { ApiError, notify, type DB, type StoredLeague, type StoredMatch, type StoredMP } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import { DORMANT_DAYS, PROVISIONAL, UPSET } from '@/lib/stats';
import type { Member } from '@/lib/types';

export type SeasonLength = 'weekly' | 'monthly' | '8w' | 'quarterly' | 'manual';
export type SeasonConfig = {
  length?: SeasonLength;
  carry?: { at: string; pct: number }[]; // carry over log; a season uses the last entry set before it started
  wrap?: boolean;
  ends?: string[]; // frozen season ends (manual end, length change), ascending
  notified?: number; // last season whose wrap notice went out
  lastWeek?: number; // last season whose "last week" notice went out
};
export const LENGTHS: { value: SeasonLength; label: string }[] = [
  { value: 'monthly', label: 'Monthly' }, { value: '8w', label: '8 weeks' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'manual', label: 'Manual' },
];
export const CARRY_STEPS = [0, 25, 50, 75, 100];
export const DEFAULT_CARRY = 50;
export const WRAP_DAYS = 14; // the hub shows the wrap hero card this long after a season closes
export const WRAP_MIN = 5; // fewer matches get the short wrap
const DAY = 86400000;
const DEMO_ID = 'lg_demo';

// The demo league runs weekly test seasons so a fresh install shows a live race and finished seasons.
export function configOf(l: Pick<StoredLeague, 'id'> & { season?: SeasonConfig }): Required<Omit<SeasonConfig, 'notified' | 'lastWeek'>> & SeasonConfig {
  const c = l.season ?? {};
  return { ...c, length: c.length ?? (l.id === DEMO_ID ? 'weekly' : 'quarterly'), carry: c.carry ?? [], wrap: c.wrap ?? true, ends: c.ends ?? [] };
}
export const carryNow = (c: SeasonConfig) => c.carry?.[c.carry.length - 1]?.pct ?? DEFAULT_CARRY;

/* ---------- time in the league's timezone ---------- */
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };
function offset(ms: number, tz?: string) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz ?? deviceTz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(ms / 1000) * 1000;
  } catch { return -new Date(ms).getTimezoneOffset() * 60000; }
}
function wall(ms: number, tz?: string) { const d = new Date(ms + offset(ms, tz)); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
// Local midnight of a calendar day in the timezone (month and day may overflow).
function midnight(y: number, m: number, d: number, tz?: string) {
  const guess = Date.UTC(y, m, d);
  const first = guess - offset(guess, tz);
  return guess - offset(first, tz);
}
function nextEnd(start: number, length: SeasonLength, tz?: string): number | null {
  const { y, m, d } = wall(start, tz);
  switch (length) {
    case 'weekly': return midnight(y, m, d + 7, tz);
    case '8w': return midnight(y, m, d + 56, tz);
    case 'monthly': return midnight(y, m + 1, 1, tz);
    case 'quarterly': return midnight(y, Math.floor(m / 3) * 3 + 3, 1, tz);
    default: return null;
  }
}

/* ---------- boundaries ---------- */
export type Season = { n: number; start: string; end: string | null; closed: boolean };

export function seasonsOf(l: StoredLeague, now = Date.now()): Season[] {
  const c = configOf(l);
  const out: Season[] = [];
  let cur = new Date(l.created_at).getTime();
  for (const e of c.ends) { const t = new Date(e).getTime(); if (t > cur && t <= now) { out.push({ n: out.length + 1, start: new Date(cur).toISOString(), end: e, closed: true }); cur = t; } }
  for (let e = nextEnd(cur, c.length, l.timezone); ; e = nextEnd(cur, c.length, l.timezone)) {
    if (e === null || e > now) { out.push({ n: out.length + 1, start: new Date(cur).toISOString(), end: e === null ? null : new Date(e).toISOString(), closed: false }); break; }
    out.push({ n: out.length + 1, start: new Date(cur).toISOString(), end: new Date(e).toISOString(), closed: true });
    cur = e;
  }
  return out;
}

/* ---------- standings (soft reset replay) ---------- */
export type Row = {
  id: string; rank: number; rating: number; start: number; peak: number; played: number; won: number; lost: number;
  change: number; bestStreak: number; upsets: number; opponents: number;
};
export type Title = { key: string; label: string; who: string; value: string };
type Seen = { matchId: string; at: string; won: boolean; delta: number; after: number; chance: number; opps: string[]; oppRating: number; rank: number };
export type SeasonResult = Season & {
  carry: number; rows: Row[]; matches: StoredMatch[]; titles: Title[];
  race: { at: string; ratings: Record<string, number> }[];
  log: Map<string, Seen[]>; // per member, their season matches in order
  rankLog: Map<string, number[]>; // per member, their rank after every season match (anyone's)
  busiestDay: { day: string; count: number } | null;
};

function carryFor(c: SeasonConfig, startIso: string) {
  let pct = DEFAULT_CARRY;
  for (const e of c.carry ?? []) if (e.at <= startIso) pct = e.pct;
  return pct;
}

function titlesOf(rows: Row[]): Title[] {
  const out: Title[] = [];
  const top = (key: string, label: string, list: Row[], score: (r: Row) => number, value: (r: Row) => string, min = 1) => {
    const best = [...list].sort((a, b) => score(b) - score(a) || a.rank - b.rank)[0];
    if (best && score(best) >= min) out.push({ key, label, who: best.id, value: value(best) });
  };
  top('iron', 'Iron Man', rows, (r) => r.played, (r) => `${r.played} matches`);
  top('giant', 'Giant Killer', rows, (r) => r.upsets, (r) => `${r.upsets} ${r.upsets === 1 ? 'upset' : 'upsets'}`);
  top('streak', 'Hot Streak', rows, (r) => r.bestStreak, (r) => `${r.bestStreak} wins in a row`, 3);
  top('climber', 'Climber', rows, (r) => r.change, (r) => `${r.change > 0 ? '+' : ''}${r.change} this season`);
  top('sharp', 'Sharpshooter', rows.filter((r) => r.played >= WRAP_MIN), (r) => r.won / r.played, (r) => `${Math.round((r.won / r.played) * 100)}% wins`, 0.01);
  top('social', 'Socialite', rows, (r) => r.opponents, (r) => `${r.opponents} different opponents`, 2);
  return out;
}

// One pass over the league: every season with its replayed standings.
export function computeSeasons(d: DB, leagueId: string, now = Date.now()): SeasonResult[] {
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return [];
  const c = configOf(l);
  const base = l.start_rating;
  const all = d.matches.filter((m) => m.league_id === leagueId).sort((a, b) => a.played_at.localeCompare(b.played_at));
  const mps = new Map<string, StoredMP[]>();
  const ids = new Set(all.map((m) => m.id));
  d.mps.forEach((p) => { if (ids.has(p.match_id)) mps.set(p.match_id, [...(mps.get(p.match_id) ?? []), p]); });
  const rating = new Map<string, number>(); // season ratings, carried between seasons
  const seasons = seasonsOf(l, now);
  const dayMs = (iso: string) => { const w = wall(new Date(iso).getTime(), l.timezone); return Date.UTC(w.y, w.m, w.d); };

  return seasons.map((s, si) => {
    const from = s.start, to = s.end && s.closed ? s.end : null;
    const carry = carryFor(c, from);
    if (si > 0) for (const [id, r] of rating) rating.set(id, Math.round(base + (r - base) * (carry / 100)));
    const inSeason = all.filter((m) => m.played_at >= from && (!to || m.played_at < to));
    const st = new Map<string, Row & { run: number; opps: Set<string> }>();
    const log = new Map<string, Seen[]>(), rankLog = new Map<string, number[]>();
    const get = (id: string) => {
      if (!st.has(id)) { const r0 = rating.get(id) ?? base; st.set(id, { id, rank: 0, rating: r0, start: r0, peak: r0, played: 0, won: 0, lost: 0, change: 0, bestStreak: 0, upsets: 0, opponents: 0, run: 0, opps: new Set() }); }
      return st.get(id)!;
    };
    const ranked = () => [...st.values()].sort((a, b) => b.rating - a.rating || b.won - a.won || a.id.localeCompare(b.id));
    const race: SeasonResult['race'] = [];
    const span = (to ? new Date(to).getTime() : now) - new Date(from).getTime();
    const step = span > 35 * DAY ? 7 : 1;
    const startW = wall(new Date(from).getTime(), l.timezone);
    let k = step;
    let tick = midnight(startW.y, startW.m, startW.d + k, l.timezone);
    const snap = (at: number) => race.push({ at: new Date(at).toISOString(), ratings: Object.fromEntries([...st.values()].map((r) => [r.id, r.rating])) });
    snap(new Date(from).getTime());
    const days = new Map<number, number>();

    for (const m of inSeason) {
      const t = new Date(m.played_at).getTime();
      while (tick <= t) { snap(tick); k += step; tick = midnight(startW.y, startW.m, startW.d + k, l.timezone); }
      const ps = mps.get(m.id) ?? [];
      const A = ps.filter((p) => p.side === 'a').map((p) => get(p.member_id)), B = ps.filter((p) => p.side === 'b').map((p) => get(p.member_id));
      if (!A.length || !B.length) continue;
      const ra = avg(A.map((r) => r.rating)), rb = avg(B.map((r) => r.rating));
      const { aWins, bWins, chanceA } = eloPreview(ra, rb, m.k ?? l.k_factor);
      const da = m.winner === 'a' ? aWins : bWins;
      const moves: [typeof A, number, boolean, number, typeof B, number][] = [[A, da, m.winner === 'a', chanceA, B, rb], [B, -da, m.winner === 'b', 1 - chanceA, A, ra]];
      for (const [list, delta, won, chance, other, oppRating] of moves) {
        for (const r of list) {
          r.rating += delta; r.peak = Math.max(r.peak, r.rating); r.played++;
          if (won) { r.won++; r.run = Math.max(r.run, 0) + 1; if (chance < UPSET) r.upsets++; } else { r.lost++; r.run = Math.min(r.run, 0) - 1; }
          r.bestStreak = Math.max(r.bestStreak, r.run);
          other.forEach((o) => r.opps.add(o.id));
          log.set(r.id, [...(log.get(r.id) ?? []), { matchId: m.id, at: m.played_at, won, delta, after: r.rating, chance, opps: other.map((o) => o.id), oppRating: Math.round(oppRating), rank: 0 }]);
        }
      }
      const order = ranked();
      order.forEach((r, i) => rankLog.set(r.id, [...(rankLog.get(r.id) ?? []), i + 1]));
      ps.forEach((p) => { const seen = log.get(p.member_id); if (seen) seen[seen.length - 1].rank = order.findIndex((r) => r.id === p.member_id) + 1; });
      const day = dayMs(m.played_at); days.set(day, (days.get(day) ?? 0) + 1);
    }
    const endAt = to ? new Date(to).getTime() : now;
    while (tick < endAt) { snap(tick); k += step; tick = midnight(startW.y, startW.m, startW.d + k, l.timezone); }
    snap(endAt);

    const rows: Row[] = ranked().map(({ run: _run, opps, ...r }, i) => ({ ...r, rank: i + 1, change: r.rating - r.start, opponents: opps.size }));
    rows.forEach((r) => rating.set(r.id, r.rating));
    const busiest = [...days].sort((a, b) => b[1] - a[1])[0];
    return {
      ...s, carry, rows, matches: inSeason, titles: titlesOf(rows), race, log, rankLog,
      busiestDay: busiest ? { day: new Date(busiest[0]).toISOString(), count: busiest[1] } : null,
    };
  });
}

/* ---------- reads for screens ---------- */
export type Progress = { day: number; days: number | null; left: number | null; lastWeek: boolean };
export function progressOf(s: Season, now = Date.now()): Progress {
  const start = new Date(s.start).getTime();
  const day = Math.floor((now - start) / DAY) + 1;
  if (!s.end) return { day, days: null, left: null, lastWeek: false };
  const end = new Date(s.end).getTime();
  return { day, days: Math.max(1, Math.round((end - start) / DAY)), left: Math.max(0, end - now), lastWeek: end - now < 7 * DAY };
}

export async function seasonData(leagueId: string) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return null;
  const list = computeSeasons(d, leagueId);
  const closed = list.filter((s) => s.closed).reverse();
  const fresh = !!closed[0] && Date.now() - new Date(closed[0].end!).getTime() < WRAP_DAYS * DAY; // wrap hero card window
  return { league: l, config: configOf(l), carry: carryNow(configOf(l)), on: isOn(l, 'seasons'), list, current: list[list.length - 1], closed, fresh };
}
export type SeasonData = NonNullable<Awaited<ReturnType<typeof seasonData>>>;

/* ---------- G3.6 wrap ---------- */
export type Wrap = {
  n: number; league: string; matches: number; players: number; played: number; won: number;
  started: number | null; peak: number | null; final: number | null; of: number;
  rating: number | null; change: number; peakRating: number | null; bestStreak: number;
  rival: { id: string; won: number; lost: number } | null;
  bestWin: { matchId: string; opps: string[]; oppRating: number; delta: number } | null;
  upset: { matchId: string; opps: string[]; chance: number; delta: number } | null;
  moment: { matchId: string; kind: 'upset' | 'reactions' | 'win'; reactions: number } | null;
  line: number[]; podium: string[]; titles: Title[]; short: boolean;
};

export function wrapOf(d: DB, l: StoredLeague, s: SeasonResult, memberId: string | null): Wrap {
  const seen = (memberId && s.log.get(memberId)) || [];
  const row = s.rows.find((r) => r.id === memberId) ?? null;
  const ranks = (memberId && s.rankLog.get(memberId)) || [];
  const rivals = new Map<string, { won: number; lost: number }>();
  seen.forEach((e) => e.opps.forEach((o) => { const r = rivals.get(o) ?? { won: 0, lost: 0 }; if (e.won) r.won++; else r.lost++; rivals.set(o, r); }));
  const rival = [...rivals].sort((a, b) => b[1].won + b[1].lost - (a[1].won + a[1].lost))[0];
  const wins = seen.filter((e) => e.won);
  const bestWin = [...wins].sort((a, b) => b.oppRating - a.oppRating || b.delta - a.delta)[0];
  const upset = wins.filter((e) => e.chance < UPSET).sort((a, b) => a.chance - b.chance)[0];
  const reacts = (id: string) => (d.reactions ?? []).filter((r) => r.match_id === id).length;
  const loved = [...seen].sort((a, b) => reacts(b.matchId) - reacts(a.matchId))[0];
  const moment = upset ? { matchId: upset.matchId, kind: 'upset' as const, reactions: reacts(upset.matchId) }
    : loved && reacts(loved.matchId) >= 2 ? { matchId: loved.matchId, kind: 'reactions' as const, reactions: reacts(loved.matchId) }
      : bestWin ? { matchId: bestWin.matchId, kind: 'win' as const, reactions: reacts(bestWin.matchId) } : null;
  return {
    n: s.n, league: l.name, matches: s.matches.length, players: s.rows.length, played: seen.length, won: wins.length,
    started: ranks[0] ?? null, peak: ranks.length ? Math.min(...ranks) : null, final: row?.rank ?? null, of: s.rows.length,
    rating: row?.rating ?? null, change: row?.change ?? 0, peakRating: row?.peak ?? null, bestStreak: row?.bestStreak ?? 0,
    rival: rival ? { id: rival[0], ...rival[1] } : null,
    bestWin: bestWin ? { matchId: bestWin.matchId, opps: bestWin.opps, oppRating: bestWin.oppRating, delta: bestWin.delta } : null,
    upset: upset ? { matchId: upset.matchId, opps: upset.opps, chance: upset.chance, delta: upset.delta } : null,
    moment, line: row ? [row.start, ...seen.map((e) => e.after)] : [], podium: s.rows.slice(0, 3).map((r) => r.id),
    titles: s.titles, short: seen.length < WRAP_MIN,
  };
}

export async function seasonWrap(leagueId: string, n: number, memberId: string | null) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const s = computeSeasons(d, leagueId).find((x) => x.n === n);
  if (!s || !l) return null;
  return { wrap: wrapOf(d, l, s, memberId), season: s, wrapOn: configOf(l).wrap };
}

/* ---------- G3.4 tiers (core Elo, thresholds follow the league's starting rating) ---------- */
export const TIERS = [
  { key: 'bronze', label: 'Bronze', from: -Infinity }, { key: 'silver', label: 'Silver', from: 0 },
  { key: 'gold', label: 'Gold', from: 150 }, { key: 'diamond', label: 'Diamond', from: 300 }, { key: 'legend', label: 'Legend', from: 450 },
] as const;
export function tierOf(rating: number, base = 1000) {
  let i = 0;
  TIERS.forEach((t, j) => { if (rating >= base + t.from) i = j; });
  const next = TIERS[i + 1];
  return { i, tier: TIERS[i], next: next ?? null, toNext: next ? base + next.from - rating : 0 };
}
// When the player last entered their current tier, from their rating history.
export async function tierSince(leagueId: string, memberId: string) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const base = l?.start_rating ?? 1000;
  const ms = new Map(d.matches.filter((m) => m.league_id === leagueId).map((m) => [m.id, m.played_at]));
  const hist = d.mps.filter((p) => p.member_id === memberId && ms.has(p.match_id)).map((p) => ({ at: ms.get(p.match_id)!, r: p.rating_after })).sort((a, b) => a.at.localeCompare(b.at));
  if (!hist.length) return null;
  const now = tierOf(hist[hist.length - 1].r, base).i;
  let since = hist[0].at;
  for (let i = hist.length - 1; i >= 0; i--) { if (tierOf(hist[i].r, base).i !== now) break; since = hist[i].at; }
  return since;
}

/* ---------- M6.3 all time, M6.4 records ---------- */
export async function allTime(leagueId: string) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const base = l?.start_rating ?? 1000;
  const matches = d.matches.filter((m) => m.league_id === leagueId).sort((a, b) => a.played_at.localeCompare(b.played_at));
  const ids = new Set(matches.map((m) => m.id));
  const peak = new Map<string, number>(), run = new Map<string, number>(), best = new Map<string, number>();
  const byMatch = new Map<string, StoredMP[]>();
  d.mps.forEach((p) => { if (ids.has(p.match_id)) byMatch.set(p.match_id, [...(byMatch.get(p.match_id) ?? []), p]); });
  let upset: { winners: string[]; gap: number; matchId: string; at: string } | null = null;
  for (const m of matches) {
    const ps = byMatch.get(m.id) ?? [];
    ps.forEach((p) => {
      peak.set(p.member_id, Math.max(peak.get(p.member_id) ?? base, p.rating_after));
      const r = p.side === m.winner ? Math.max(run.get(p.member_id) ?? 0, 0) + 1 : Math.min(run.get(p.member_id) ?? 0, 0) - 1;
      run.set(p.member_id, r); best.set(p.member_id, Math.max(best.get(p.member_id) ?? 0, r));
    });
    const w = ps.filter((p) => p.side === m.winner), lo = ps.filter((p) => p.side !== m.winner);
    if (w.length && lo.length) {
      const gap = Math.round(avg(lo.map((p) => p.rating_before)) - avg(w.map((p) => p.rating_before)));
      if (gap > 0 && (!upset || gap > upset.gap)) upset = { winners: w.map((p) => p.member_id), gap, matchId: m.id, at: m.played_at };
    }
  }
  const members = d.members.filter((m) => m.league_id === leagueId && !m.status);
  const rows = members.map((m) => ({ m, played: m.wins + m.losses, rate: m.wins + m.losses ? m.wins / (m.wins + m.losses) : 0, peak: peak.get(m.id) ?? m.rating, best: best.get(m.id) ?? 0 }));
  const streak = [...rows].sort((a, b) => b.best - a.best)[0];
  return { rows, records: { streak: streak && streak.best >= 2 ? { id: streak.m.id, n: streak.best } : null, upset } };
}

/* ---------- admin (B4.6, B4.6.1) ---------- */
function requireAdmin(d: DB, user: User, leagueId: string) {
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) throw new ApiError('not allowed');
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l || l.archived_at) throw new ApiError('league archived');
  return { me, l };
}
// Freeze every boundary up to now, so a new length only shapes the seasons still to come.
function freeze(l: StoredLeague) {
  const c = configOf(l);
  l.season = { ...l.season, length: c.length, ends: seasonsOf(l).filter((s) => s.closed).map((s) => s.end!) };
}

export async function setSeasonSettings(user: User, leagueId: string, p: { length?: SeasonLength; carry?: number; wrap?: boolean }) {
  await wait(150);
  const d = await db();
  const { l } = requireAdmin(d, user, leagueId);
  freeze(l);
  const c = l.season!;
  if (p.length) c.length = p.length;
  if (p.wrap !== undefined) c.wrap = p.wrap;
  if (p.carry !== undefined && p.carry !== carryNow(c)) c.carry = [...(c.carry ?? []), { at: new Date().toISOString(), pct: p.carry }];
  await save();
}

export async function endSeasonNow(user: User, leagueId: string) {
  await wait(300);
  const d = await db();
  const { l } = requireAdmin(d, user, leagueId);
  freeze(l);
  l.season!.ends = [...(l.season!.ends ?? []), new Date().toISOString()];
  syncSeasons(d, leagueId);
  await save();
}

export async function turnOnSeasons(user: User, leagueId: string) {
  const d = await db();
  const { l } = requireAdmin(d, user, leagueId);
  l.modules = { ...l.modules, seasons: true };
  // Seasons that closed while the module was off are not announced.
  l.season = { ...l.season, notified: seasonsOf(l).filter((s) => s.closed).length };
  await save();
}

/* ---------- notices: season end, last week, dormant (R1.6) ---------- */
const real = (d: DB, leagueId: string) => d.members.filter((m) => m.league_id === leagueId && !m.status && m.user_id);
const nameOf = (d: DB, id: string | undefined) => d.members.find((m) => m.id === id)?.display_name ?? 'Someone';

export function syncSeasons(d: DB, leagueId: string, now = Date.now()) {
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l || !isOn(l, 'seasons')) return false;
  const c = configOf(l);
  const list = computeSeasons(d, leagueId, now);
  const closed = list.filter((s) => s.closed);
  const last = closed[closed.length - 1];
  let changed = false;
  if (last && last.n > (c.notified ?? 0)) {
    // Only the newest closed season is announced, and only while it is fresh.
    if (now - new Date(last.end!).getTime() < WRAP_DAYS * DAY && last.rows.length) {
      const champ = nameOf(d, last.rows[0]?.id);
      for (const m of real(d, leagueId)) {
        const played = last.rows.some((r) => r.id === m.id);
        notify(d, {
          league_id: leagueId, member_id: m.id, kind: 'season.wrapped',
          title: c.wrap && played ? `Season ${last.n} is wrapped. See your story 🎬` : `Season ${last.n} is over`,
          body: `${last.rows[0]?.id === m.id ? 'You win' : `${champ} wins`} the season. Season ${last.n + 1} has started.`,
          href: c.wrap && played ? `/season/wrap/${last.n}` : `/season/${last.n}`,
        });
      }
    }
    l.season = { ...l.season, notified: last.n };
    changed = true;
  }
  const cur = list[list.length - 1];
  const pr = cur ? progressOf(cur, now) : null;
  // Last week notice only for seasons longer than two weeks; a weekly season is always in its last week.
  if (cur && pr?.lastWeek && pr.days && pr.days > 14 && cur.n > (c.lastWeek ?? 0)) {
    const third = cur.rows[2];
    for (const m of real(d, leagueId)) {
      const r = cur.rows.find((x) => x.id === m.id);
      const body = !r ? 'One match puts you in the race.' : r.rank <= 3 ? `You're #${r.rank}. Hold on to the podium.` : `You're ${third ? third.rating - r.rating + 1 : 1} points off the podium.`;
      notify(d, { league_id: leagueId, member_id: m.id, kind: 'season.lastweek', title: `Last week of Season ${cur.n}`, body, href: '/season' });
    }
    l.season = { ...l.season, lastWeek: cur.n };
    changed = true;
  }
  return changed;
}

// R1.6: a heads up 3 days before going dormant, and a calm inbox note once dormant. Real members only.
export function syncDormant(d: DB, leagueId: string, now = Date.now()) {
  let changed = false;
  const notices = d.notices ?? [];
  for (const m of real(d, leagueId)) {
    if (!m.last_played_at || m.wins + m.losses < PROVISIONAL) continue;
    const days = Math.floor((now - new Date(m.last_played_at).getTime()) / DAY);
    const since = (kind: string) => notices.some((n) => n.kind === kind && n.member_id === m.id && n.created_at > m.last_played_at!);
    if (days >= DORMANT_DAYS && !since('rank.dormant')) {
      notify(d, { league_id: leagueId, member_id: m.id, kind: 'rank.dormant', title: 'You are on a break', body: 'Your rating is safe. Play one match to rejoin the ladder.', href: '/dormant' });
      changed = true;
    } else if (days >= DORMANT_DAYS - 3 && days < DORMANT_DAYS && !since('rank.dormant_soon')) {
      const left = DORMANT_DAYS - days;
      notify(d, { league_id: leagueId, member_id: m.id, kind: 'rank.dormant_soon', title: `${left} ${left === 1 ? 'day' : 'days'} until you go dormant`, body: 'One match keeps you on the ladder.', href: '/log' });
      changed = true;
    }
  }
  return changed;
}

export async function syncLeague(leagueId: string) {
  const d = await db();
  const a = syncSeasons(d, leagueId), b = syncDormant(d, leagueId);
  if (a || b) await save();
}

// afterMatchRecorded hook: a match can be the first one after a boundary, so announce closed seasons.
export function seasonsAfterMatch(d: DB, matchId: string) {
  const m = d.matches.find((x) => x.id === matchId);
  if (m) syncSeasons(d, m.league_id);
}

/* ---------- copy helpers ---------- */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// End dates are exclusive midnights; show the last day of the season.
export const lastDay = (iso: string) => shortDate(new Date(new Date(iso).getTime() - 1).toISOString());
export const range = (s: Season) => (s.end ? `${shortDate(s.start)} to ${lastDay(s.end)}` : `Since ${shortDate(s.start)}`);
export function countdown(ms: number) {
  const h = Math.floor(ms / 3600000), dd = Math.floor(h / 24);
  return dd ? `${dd} d ${h % 24} h` : `${h} h ${Math.floor((ms % 3600000) / 60000)} min`;
}
export const nameIn = (members: Member[], id: string | null | undefined, meId?: string) =>
  !id ? '' : id === meId ? 'You' : members.find((m) => m.id === id)?.display_name ?? 'Former player';
