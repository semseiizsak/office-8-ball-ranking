// Predictions module (M13.2 Call the winner; tips on open challenges and upcoming cup games; The Oracle board).
// Ethics (04): tips are for bragging rights or a tiny stake of earned coins, never money, never called a bet,
// and the whole module is hidden for players under 16. Every tip scores Oracle points by its odds; a coin stake
// is held on the ledger and paid back with the odds when the call is right, or refunded when nothing was played.
import { isUnder16 } from '@/lib/account';
import { db, save, wait, type User } from '@/lib/api';
import { resolve as resolveChallenges } from '@/lib/challenges';
import { balanceOf, credit, syncCoins, weekStart } from '@/lib/coins';
import { resolveCups } from '@/lib/cup';
import { avg, eloPreview } from '@/lib/elo';
import { ApiError, counts, notify, uid, type DB } from '@/lib/engine';
import { isActive, stepLive, type LiveMatch } from '@/lib/live';
import { isOn } from '@/lib/modules';
import type { League } from '@/lib/types';

export type TipTarget = 'live' | 'challenge' | 'cup' | 'match'; // match: settled history only (demo backfill)
export type Tip = {
  id: string; league_id: string; member_id: string; target: TipTarget; target_id: string;
  pick: string[]; pick_name: string; title: string; odds: number; stake: number;
  status: 'open' | 'won' | 'lost' | 'refunded'; payout: number; created_at: string; settled_at: string | null;
};
export type PredStore = { tips: Tip[]; seen: string[]; seeded: string[] };
export type Call = {
  target: Exclude<TipTarget, 'match'>; id: string; league_id: string; a: string[]; b: string[]; title: string; sub: string;
  open: boolean; closed: string | null; closes_at: string | null; odds: { a: number; b: number }; href: string;
  pool: { players: number; coins: number }; mine: Tip | null; playing: boolean; names: { a: string; b: string };
};

export const STAKES = [0, 20, 50, 100] as const; // 0: just for the bragging rights
export const WINDOW_MIN = 4; // live: tips close 4 minutes after the start
const H = 3600000;
const DEMO_ID = 'lg_demo';

export function predStore(d: DB): PredStore {
  const s = (d.predictions as PredStore | undefined) ?? { tips: [], seen: [], seeded: [] };
  d.predictions = s;
  return s;
}
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const iso = (t: number) => new Date(t).toISOString();
const nameOf = (d: DB, id: string) => d.members.find((m) => m.id === id)?.display_name ?? 'Someone';
const sideName = (d: DB, ids: string[]) => ids.map((id) => nameOf(d, id)).join(' and ');
const rating = (d: DB, id: string) => d.members.find((m) => m.id === id)?.rating ?? 1000;
const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);

// Odds from the Elo chance with a small house edge so a coin flip pays 1.9×, never below 1.1×.
export const oddsOf = (p: number) => Math.min(9.9, Math.max(1.1, Math.round((0.95 / Math.max(p, 0.01)) * 10) / 10));
export const pays = (stake: number, odds: number) => Math.round(stake * odds);
export const pointsOf = (t: Pick<Tip, 'status' | 'odds'>) => (t.status === 'won' ? Math.round(t.odds * 10) : 0);
export const oddsLabel = (o: number) => `${o.toFixed(1)}×`;

// The module is on and the user is 16 or older.
export async function predictionsOn(user: User | null | undefined, league: League | null | undefined) {
  if (!user || !league || !isOn(league, 'predictions')) return false;
  return !isUnder16(user.id, await db());
}

/* ---------- calls: what can be tipped right now ---------- */

type Raw = Omit<Call, 'pool' | 'mine' | 'playing' | 'names'>;

function liveCall(d: DB, x: LiveMatch, now: number): Raw | null {
  if (x.visibility !== 'league' || !isActive(x)) return null;
  const closesAt = x.started_at ? ms(x.started_at) + WINDOW_MIN * 60000 : null;
  const open = !closesAt || now < closesAt;
  const p = eloPreview(avg(x.a.map((id) => rating(d, id))), avg(x.b.map((id) => rating(d, id)))).chanceA;
  return {
    target: 'live', id: x.id, league_id: x.league_id, a: x.a, b: x.b, title: `${sideName(d, x.a)} vs ${sideName(d, x.b)}`,
    sub: x.state === 'ready' ? 'Live soon' : 'Live now', open, closed: open ? null : `Tips closed at ${WINDOW_MIN}:00.`,
    closes_at: closesAt ? iso(closesAt) : null, odds: { a: oddsOf(p), b: oddsOf(1 - p) }, href: `/live/watch/${x.id}`,
  };
}

function calls(d: DB, leagueId: string, now: number): Raw[] {
  const l = leagueOf(d, leagueId);
  const out: Raw[] = [];
  if (!l) return out;
  const live = (d.live ?? []).filter((x) => x.league_id === leagueId);
  if (isOn(l, 'live')) live.forEach((x) => { const c = liveCall(d, x, now); if (c) out.push(c); });
  // A challenge or cup game that went live closes with the live window.
  const wentLive = (key: 'challenge_id' | 'cup_game_id', id: string) => live.find((x) => x[key] === id && x.started_at && now >= ms(x.started_at) + WINDOW_MIN * 60000);
  if (isOn(l, 'challenges')) {
    for (const c of (d.challenges ?? []).filter((y) => y.league_id === leagueId && (y.status === 'pending' || y.status === 'accepted'))) {
      const closed = wentLive('challenge_id', c.id) ? 'Tips closed when the match went live.' : null;
      out.push({
        target: 'challenge', id: c.id, league_id: leagueId, a: [c.from], b: [c.to], title: `${nameOf(d, c.from)} vs ${nameOf(d, c.to)}`,
        sub: c.status === 'pending' ? 'Challenge sent' : 'Challenge on', open: !closed, closed, closes_at: null,
        odds: { a: oddsOf(c.stakes.chanceA), b: oddsOf(1 - c.stakes.chanceA) }, href: `/challenge/${c.id}`,
      });
    }
  }
  if (isOn(l, 'cup')) {
    for (const cup of (d.cups ?? []).filter((y) => y.league_id === leagueId && y.status === 'running')) {
      for (const g of cup.games.filter((y) => y.a && y.b && (y.status === 'open' || y.status === 'waiting'))) {
        const late = ms(g.deadline) <= now;
        const closed = late ? 'Tips closed at the deadline.' : wentLive('cup_game_id', g.id) ? 'Tips closed when the match went live.' : null;
        const p = eloPreview(rating(d, g.a!), rating(d, g.b!)).chanceA;
        out.push({
          target: 'cup', id: g.id, league_id: leagueId, a: [g.a!], b: [g.b!], title: `${nameOf(d, g.a!)} vs ${nameOf(d, g.b!)}`,
          sub: `Week ${cup.week_no} cup`, open: !closed, closed, closes_at: g.deadline, odds: { a: oddsOf(p), b: oddsOf(1 - p) }, href: `/cup/game/${g.id}`,
        });
      }
    }
  }
  return out;
}

function decorate(d: DB, c: Raw, meId: string | undefined): Call {
  const tips = predStore(d).tips.filter((t) => t.target === c.target && t.target_id === c.id);
  return {
    ...c, pool: { players: tips.length, coins: tips.reduce((s, t) => s + t.stake, 0) },
    mine: tips.find((t) => t.member_id === meId) ?? null, playing: !!meId && [...c.a, ...c.b].includes(meId), names: { a: sideName(d, c.a), b: sideName(d, c.b) },
  };
}

/* ---------- settlement ---------- */

type Outcome = { winner: string[]; loser: string[] } | 'refund' | null;

function matchOutcome(d: DB, matchId: string | null, a: string[], b: string[]): Outcome {
  const m = matchId ? d.matches.find((x) => x.id === matchId) : null;
  if (!m || m.status === 'void' || m.status === 'walkover') return 'refund';
  if (!counts(m)) return null; // waits for confirmation
  const sideOfA = d.mps.find((p) => p.match_id === m.id && p.member_id === a[0])?.side ?? 'a';
  return sideOfA === m.winner ? { winner: a, loser: b } : { winner: b, loser: a };
}

function outcomeOf(d: DB, t: Tip, now: number): Outcome {
  if (t.target === 'live') {
    const x = (d.live ?? []).find((y) => y.id === t.target_id);
    if (!x) return now - ms(t.created_at) > 24 * H ? 'refund' : null;
    if (x.state === 'abandoned') return 'refund';
    if (x.state !== 'done') return null;
    return matchOutcome(d, x.match_id, x.a, x.b);
  }
  if (t.target === 'challenge') {
    const c = (d.challenges ?? []).find((y) => y.id === t.target_id);
    if (!c || ['declined', 'expired', 'cancelled'].includes(c.status)) return 'refund';
    if (c.status !== 'played') return null;
    return matchOutcome(d, c.match_id, [c.from], [c.to]);
  }
  if (t.target === 'cup') {
    const cup = (d.cups ?? []).find((y) => y.games.some((g) => g.id === t.target_id));
    const g = cup?.games.find((y) => y.id === t.target_id);
    if (!cup || !g || cup.status === 'cancelled' || g.status === 'wo' || g.status === 'bye') return 'refund';
    if (g.status !== 'played' || !g.winner) return null;
    return { winner: [g.winner], loser: [g.a === g.winner ? g.b! : g.a!] };
  }
  return null;
}

function settle(d: DB, t: Tip, o: Exclude<Outcome, null>, at: string) {
  const real = !!d.members.find((m) => m.id === t.member_id)?.user_id;
  t.settled_at = at;
  if (o === 'refund') {
    t.status = 'refunded';
    if (t.stake) {
      credit(d, { league_id: t.league_id, member_id: t.member_id, amount: t.stake, reason: 'tip', label: `Tip refunded, ${t.title}`, ref: `tip:${t.id}`, href: '/predictions' });
      if (real) notify(d, { league_id: t.league_id, member_id: t.member_id, kind: 'tip.refund', title: 'Your tip is back', body: `${t.title} was not played. ${t.stake} coins returned.`, href: '/predictions' });
    }
    return;
  }
  const won = o.winner.includes(t.pick[0]);
  t.status = won ? 'won' : 'lost';
  t.payout = won ? pays(t.stake, t.odds) : 0;
  if (!won) return; // no loss notice, ever
  if (t.payout) credit(d, { league_id: t.league_id, member_id: t.member_id, amount: t.payout, reason: 'tip', label: `Called it, ${t.pick_name} won`, ref: `tip:${t.id}`, href: '/predictions' });
  if (real) notify(d, { league_id: t.league_id, member_id: t.member_id, kind: 'tip.won', title: t.payout ? `You called it, +${t.payout}` : 'You called it',
    body: `${sideName(d, o.winner)} beat ${sideName(d, o.loser)}. +${pointsOf(t)} Oracle points.`, href: '/predictions' });
}

// Bots who are not playing call some of the open matches, so the pool looks like a real office.
function botTips(d: DB, c: Raw, now: number) {
  const s = predStore(d);
  const key = `${c.target}:${c.id}`;
  if (s.seen.includes(key) || !c.open) return;
  s.seen.push(key);
  if (s.seen.length > 400) s.seen.splice(0, s.seen.length - 400);
  const l = leagueOf(d, c.league_id);
  const bots = d.members.filter((m) => m.league_id === c.league_id && m.user_id === null && !m.status && !m.guest && ![...c.a, ...c.b].includes(m.id))
    .sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
  for (const b of bots) {
    const side = Math.random() < 1 / c.odds.a / (1 / c.odds.a + 1 / c.odds.b) ? 'a' : 'b';
    const want = [0, 20, 20, 50][Math.floor(Math.random() * 4)];
    const stake = l && isOn(l, 'coins') && balanceOf(d, c.league_id, b.id) >= want ? want : 0;
    place(d, b.id, c, side, stake, now);
  }
}

function place(d: DB, memberId: string, c: Raw, side: 'a' | 'b', stake: number, now: number) {
  const pick = side === 'a' ? c.a : c.b;
  const t: Tip = {
    id: uid(), league_id: c.league_id, member_id: memberId, target: c.target, target_id: c.id, pick, pick_name: sideName(d, pick),
    title: c.title, odds: c.odds[side], stake, status: 'open', payout: 0, created_at: iso(now), settled_at: null,
  };
  predStore(d).tips.push(t);
  if (stake) credit(d, { league_id: c.league_id, member_id: memberId, amount: -stake, reason: 'tip', label: `Tip on ${t.pick_name}, ${c.title}`, ref: `tip:${t.id}`, href: '/predictions' });
  return t;
}

// Demo history: bots called some of the past matches, so The Oracle has a table on day one (points only, no coins).
function seedHistory(d: DB, leagueId: string) {
  const s = predStore(d);
  if (s.seeded.includes(leagueId)) return;
  s.seeded.push(leagueId);
  if (leagueId !== DEMO_ID) return;
  const bots = d.members.filter((m) => m.league_id === leagueId && m.user_id === null && !m.status && !m.guest);
  const past = d.matches.filter((m) => m.league_id === leagueId && counts(m) && m.format === '1v1').sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, 16);
  for (const m of past) {
    const rows = d.mps.filter((p) => p.match_id === m.id);
    const A = rows.filter((p) => p.side === 'a'), B = rows.filter((p) => p.side === 'b');
    if (!A.length || !B.length) continue;
    const p = eloPreview(avg(A.map((r) => r.rating_before)), avg(B.map((r) => r.rating_before))).chanceA;
    const a = A.map((r) => r.member_id), b = B.map((r) => r.member_id);
    const title = `${sideName(d, a)} vs ${sideName(d, b)}`;
    for (const bot of bots.filter((x) => !rows.some((r) => r.member_id === x.id))) {
      if (Math.random() > 0.45) continue;
      const side = Math.random() < p ? 'a' : 'b';
      const pick = side === 'a' ? a : b;
      const won = side === m.winner;
      const odds = oddsOf(side === 'a' ? p : 1 - p);
      const at = iso(ms(m.played_at) - 5 * 60000);
      s.tips.push({ id: uid(), league_id: leagueId, member_id: bot.id, target: 'match', target_id: m.id, pick, pick_name: sideName(d, pick), title, odds, stake: 0,
        status: won ? 'won' : 'lost', payout: 0, created_at: at, settled_at: m.played_at });
    }
  }
}

// Lazy step before any read: brings live, challenges and cups up to now, then settles and lets bots tip.
export function stepPredictions(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !isOn(l, 'predictions')) return false;
  const s = predStore(d);
  const snap = () => JSON.stringify([s.tips, d.cups ?? null, d.challenges ?? null]) + (d.notices?.length ?? 0);
  const before = snap();
  let changed = stepLive(d, leagueId, now);
  changed = resolveChallenges(d, now) || changed;
  if (isOn(l, 'cup')) resolveCups(d, leagueId, now);
  if (isOn(l, 'coins')) changed = syncCoins(d, leagueId, now) || changed;
  seedHistory(d, leagueId);
  for (const t of s.tips.filter((x) => x.league_id === leagueId && x.status === 'open')) {
    const o = outcomeOf(d, t, now);
    if (o) settle(d, t, o, iso(now));
  }
  calls(d, leagueId, now).forEach((c) => botTips(d, c, now));
  return changed || snap() !== before;
}

async function fresh(leagueId: string) {
  const d = await db();
  if (stepPredictions(d, leagueId)) await save();
  return d;
}
async function gate(user: User, leagueId: string) {
  const d0 = await db();
  const l = leagueOf(d0, leagueId);
  if (!l || !(await predictionsOn(user, l))) return null;
  const d = await fresh(leagueId);
  return { d, l, me: meIn(d, leagueId, user) };
}

/* ---------- reads ---------- */

// Open calls for the hub and the Arena card: live first, then challenges and cup games. Your own matches are left out.
export async function openCalls(user: User, leagueId: string): Promise<Call[]> {
  const g = await gate(user, leagueId);
  if (!g) return [];
  const rank = { live: 0, challenge: 1, cup: 2 } as const;
  return calls(g.d, leagueId, Date.now()).map((c) => decorate(g.d, c, g.me?.id)).filter((c) => !c.playing && (c.open || c.mine))
    .sort((p, q) => rank[p.target] - rank[q.target]);
}

export type CallView = { call: Call | null; coinsOn: boolean; balance: number; mine: Tip | null; stakes: number[] };
// One call for M13.2 and the cards on the live and cup screens. null: hidden (module off, under 16, nothing to tip).
export async function getCall(user: User, target: Call['target'], id: string): Promise<CallView | null> {
  const d0 = await db();
  const leagueId = target === 'live' ? d0.live?.find((x) => x.id === id)?.league_id
    : target === 'challenge' ? d0.challenges?.find((x) => x.id === id)?.league_id
    : d0.cups?.find((c) => c.games.some((x) => x.id === id))?.league_id;
  if (!leagueId) return null;
  const g = await gate(user, leagueId);
  if (!g) return null;
  const raw = calls(g.d, leagueId, Date.now()).find((c) => c.target === target && c.id === id);
  const mine = predStore(g.d).tips.find((t) => t.target === target && t.target_id === id && t.member_id === g.me?.id) ?? null;
  if (!raw) return mine ? { call: null, coinsOn: isOn(g.l, 'coins'), balance: 0, mine, stakes: [] } : null;
  const coinsOn = isOn(g.l, 'coins');
  return { call: decorate(g.d, raw, g.me?.id), coinsOn, balance: coinsOn && g.me ? balanceOf(g.d, leagueId, g.me.id) : 0, mine, stakes: coinsOn ? [...STAKES] : [0] };
}

export type TipView = Tip & { points: number };
export async function myTips(user: User, leagueId: string) {
  await wait(80);
  const g = await gate(user, leagueId);
  if (!g || !g.me) return null;
  const mine = predStore(g.d).tips.filter((t) => t.league_id === leagueId && t.member_id === g.me!.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const v = (t: Tip): TipView => ({ ...t, points: pointsOf(t) });
  const done = mine.filter((t) => t.status === 'won' || t.status === 'lost');
  return {
    open: mine.filter((t) => t.status === 'open').map(v), settled: mine.filter((t) => t.status !== 'open').slice(0, 30).map(v),
    called: done.filter((t) => t.status === 'won').length, total: done.length, points: done.reduce((s, t) => s + pointsOf(t), 0),
  };
}

export type OracleRow = { member_id: string; name: string; colour: string; jersey: number; points: number; called: number; total: number; net: number };
// The Oracle: best predictors by points (an underdog call is worth more). Refunded tips do not count.
export async function oracle(user: User, leagueId: string, period: 'week' | 'all') {
  await wait(80);
  const g = await gate(user, leagueId);
  if (!g) return null;
  const since = period === 'week' ? weekStart(g.d, leagueId) : 0;
  const by = new Map<string, OracleRow>();
  for (const t of predStore(g.d).tips) {
    if (t.league_id !== leagueId || (t.status !== 'won' && t.status !== 'lost') || ms(t.settled_at) < since) continue;
    const m = g.d.members.find((x) => x.id === t.member_id);
    if (!m || m.status) continue;
    const r = by.get(m.id) ?? { member_id: m.id, name: m.display_name, colour: m.colour, jersey: m.jersey, points: 0, called: 0, total: 0, net: 0 };
    r.total++; r.points += pointsOf(t); r.net += t.payout - t.stake;
    if (t.status === 'won') r.called++;
    by.set(m.id, r);
  }
  const rows = [...by.values()].sort((a, b) => b.points - a.points || b.called - a.called || a.name.localeCompare(b.name));
  return { rows, meId: g.me?.id ?? null, coinsOn: isOn(g.l, 'coins') };
}

/* ---------- write ---------- */

export async function placeTip(user: User, target: Call['target'], id: string, side: 'a' | 'b', stake: number) {
  await wait(200);
  const v = await getCall(user, target, id);
  if (!v?.call) throw new ApiError('Tips are closed for this match.');
  const d = await db();
  const me = meIn(d, v.call.league_id, user);
  const now = Date.now();
  const c = calls(d, v.call.league_id, now).find((x) => x.target === target && x.id === id);
  if (!me || !c) throw new ApiError('Tips are closed for this match.');
  if (!c.open) throw new ApiError(c.closed ?? 'Tips are closed for this match.');
  if ([...c.a, ...c.b].includes(me.id)) throw new ApiError("You're playing in this one, so no tip from you.");
  if (predStore(d).tips.some((t) => t.target === target && t.target_id === id && t.member_id === me.id)) throw new ApiError('You already called this one.');
  if (!(STAKES as readonly number[]).includes(stake) || (stake && !v.coinsOn)) throw new ApiError('Pick a stake from the list.');
  if (stake && balanceOf(d, c.league_id, me.id) < stake) throw new ApiError(`You have ${balanceOf(d, c.league_id, me.id)} coins. Pick a smaller stake or just call it.`);
  const t = place(d, me.id, c, side, stake, now);
  await save();
  return t;
}
