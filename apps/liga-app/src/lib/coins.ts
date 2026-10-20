// Coins module (G6 wallet, G6.1 history, G6.2 transaction, G6.3 richest).
// One append only ledger. Coins are earned by playing, never bought, refunded or traded (04, ethics).
// Match rewards are reconciled against the confirmed matches, so an undo, edit or void writes a visible
// correction row instead of silently changing history. Cup prizes are paid from finished cups (cup.ts).
import { db, save, wait, type User } from '@/lib/api';
import { avg, eloPreview } from '@/lib/elo';
import { ApiError, counts, notify, uid, type DB, type StoredMatch } from '@/lib/engine';
import { DAY, resolveCups, tzOf, weekOf, zoned } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { UPSET } from '@/lib/stats';

export type Reason = 'match' | 'win' | 'upset' | 'quest' | 'cup' | 'award' | 'shop' | 'cards' | 'pass' | 'chest' | 'tip'; // shop: spending in the shop
export type Entry = {
  id: string; league_id: string; member_id: string; amount: number; reason: Reason;
  label: string; ref: string; href: string | null; at: string; correction?: boolean;
};
export type CoinStore = { ledger: Entry[]; since: Record<string, string> };

export const REWARD = { match: 20, win: 20, upset: 25, quest: 75 } as const;
export const REASON_LABEL: Record<Reason, string> = { match: 'Matches', win: 'Wins', upset: 'Upsets', quest: 'Quests', cup: 'Cup', award: 'Awards', shop: 'Shop', cards: 'Cards', pass: 'Season pass', chest: 'Chests', tip: 'Tips' };
const DEMO_ID = 'lg_demo';

export const store = (d: DB): CoinStore => {
  const s = (d.coins as CoinStore | undefined) ?? { ledger: [], since: {} };
  d.coins = s;
  return s;
};
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);
const nameOf = (d: DB, id: string) => d.members.find((m) => m.id === id)?.display_name ?? 'someone';
const names = (d: DB, ids: string[]) => ids.map((id) => nameOf(d, id)).join(' and ');

// Writes one ledger row. Every coin movement in the app goes through here.
export function credit(d: DB, e: Omit<Entry, 'id' | 'at'> & { at?: string }) {
  if (!e.amount) return;
  store(d).ledger.push({ ...e, id: uid(), at: e.at ?? new Date().toISOString() });
}
export const balanceOf = (d: DB, leagueId: string, memberId: string) =>
  store(d).ledger.reduce((s, e) => (e.league_id === leagueId && e.member_id === memberId ? s + e.amount : s), 0);
export const paid = (d: DB, ref: string, memberId?: string) => store(d).ledger.some((e) => e.ref === ref && (!memberId || e.member_id === memberId));

/* ---------- match rewards ---------- */

// Winner's chance before the match, from the rating rows (an upset is a win below UPSET).
export function winChance(d: DB, m: StoredMatch) {
  const rows = d.mps.filter((p) => p.match_id === m.id);
  const w = rows.filter((p) => p.side === m.winner), l = rows.filter((p) => p.side !== m.winner);
  if (!w.length || !l.length) return 0.5;
  return eloPreview(avg(w.map((p) => p.rating_before)), avg(l.map((p) => p.rating_before))).chanceA;
}

function expected(d: DB, m: StoredMatch | undefined) {
  const out = new Map<string, number>(); // `${member}|${reason}` -> amount
  if (!m || !counts(m)) return out;
  const upset = winChance(d, m) < UPSET;
  for (const p of d.mps.filter((x) => x.match_id === m.id)) {
    out.set(`${p.member_id}|match`, REWARD.match);
    if (p.side === m.winner) {
      out.set(`${p.member_id}|win`, REWARD.win);
      if (upset) out.set(`${p.member_id}|upset`, REWARD.upset);
    }
  }
  return out;
}

function matchLabel(d: DB, m: StoredMatch, memberId: string, reason: Reason) {
  const rows = d.mps.filter((p) => p.match_id === m.id);
  const mine = rows.find((p) => p.member_id === memberId)?.side;
  const opp = names(d, rows.filter((p) => p.side !== mine).map((p) => p.member_id));
  return reason === 'win' ? `Won vs ${opp}` : reason === 'upset' ? `Upset win vs ${opp}` : `Played vs ${opp}`;
}

// Brings the ledger rows of one match in line with the match as it stands now.
function reconcileMatch(d: DB, leagueId: string, matchId: string) {
  const m = d.matches.find((x) => x.id === matchId);
  const ref = `match:${matchId}`;
  const want = expected(d, m);
  const have = new Map<string, number>();
  for (const e of store(d).ledger) if (e.ref === ref) have.set(`${e.member_id}|${e.reason}`, (have.get(`${e.member_id}|${e.reason}`) ?? 0) + e.amount);
  for (const key of new Set([...want.keys(), ...have.keys()])) {
    const diff = (want.get(key) ?? 0) - (have.get(key) ?? 0);
    if (!diff) continue;
    const [member, reason] = key.split('|') as [string, Reason];
    const first = !have.has(key);
    const label = first && m ? matchLabel(d, m, member, reason)
      : !m ? 'Match deleted, coins reversed' : !counts(m) ? 'Match voided, coins reversed' : 'Match corrected';
    credit(d, { league_id: leagueId, member_id: member, amount: diff, reason, label, ref, href: m ? `/match/${m.id}` : null,
      correction: !first, at: first && m ? (m.confirmed_at ?? m.played_at) : undefined });
  }
}

// Cup prizes from finished cups, reversed if a final is undone.
function reconcileCup(d: DB, leagueId: string, since: string) {
  for (const c of d.cups ?? []) {
    if (c.league_id !== leagueId || c.final_at < since) continue;
    const ref = `cup:${c.id}`;
    const want = new Map<string, number>();
    if (c.status === 'done' && c.champion_id) {
      want.set(c.champion_id, c.prizes.winner);
      if (c.runner_up_id) want.set(c.runner_up_id, (want.get(c.runner_up_id) ?? 0) + c.prizes.runner);
    }
    const have = new Map<string, number>();
    for (const e of store(d).ledger) if (e.ref === ref) have.set(e.member_id, (have.get(e.member_id) ?? 0) + e.amount);
    for (const id of new Set([...want.keys(), ...have.keys()])) {
      const diff = (want.get(id) ?? 0) - (have.get(id) ?? 0);
      if (!diff) continue;
      const first = !have.has(id);
      const champ = id === c.champion_id;
      credit(d, { league_id: leagueId, member_id: id, amount: diff, reason: 'cup', ref, href: `/cup/bracket?id=${c.id}`, correction: !first,
        label: first ? `Week ${c.week_no} cup, ${champ ? 'champion' : 'finalist'}` : `Week ${c.week_no} cup corrected`,
        at: first ? (c.games.find((g) => g.round === c.rounds - 1)?.ended_at ?? c.final_at) : undefined });
      if (first && diff > 0 && d.members.find((m) => m.id === id)?.user_id) {
        notify(d, { league_id: leagueId, member_id: id, kind: 'coins.cup', title: `+${diff} coins`, body: `Cup prize for week ${c.week_no}. Well played.`, href: '/coins' });
      }
    }
  }
}

// Lazy step before any coin read. Returns true when it wrote something.
export function syncCoins(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !isOn(l, 'coins')) return false;
  const s = store(d);
  const before = s.ledger.length + (d.notices?.length ?? 0);
  if (!s.since[leagueId]) s.since[leagueId] = l.id === DEMO_ID ? l.created_at : new Date(now).toISOString(); // demo: backfill from the start
  const since = s.since[leagueId];
  const ids = new Set<string>();
  for (const m of d.matches) if (m.league_id === leagueId && counts(m) && (m.confirmed_at ?? m.played_at) >= since) ids.add(m.id);
  for (const e of s.ledger) if (e.league_id === leagueId && e.ref.startsWith('match:')) ids.add(e.ref.slice(6));
  ids.forEach((id) => reconcileMatch(d, leagueId, id));
  if (isOn(l, 'cup')) { resolveCups(d, leagueId, now); reconcileCup(d, leagueId, since); }
  return s.ledger.length + (d.notices?.length ?? 0) !== before;
}

// afterMatchRecorded hook: pays the match right away (corrections happen in syncCoins).
export function coinsAfterMatch(d: DB, matchId: string) {
  const m = d.matches.find((x) => x.id === matchId);
  const l = m && leagueOf(d, m.league_id);
  if (!m || !l || !isOn(l, 'coins')) return;
  const s = store(d);
  if (!s.since[l.id]) s.since[l.id] = l.id === DEMO_ID ? l.created_at : (m.confirmed_at ?? m.played_at);
  reconcileMatch(d, l.id, matchId);
}

/* ---------- reads ---------- */

export async function freshCoins(leagueId: string) {
  const d = await db();
  if (syncCoins(d, leagueId)) await save();
  return d;
}
const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
export const weekStart = (d: DB, leagueId: string, now = Date.now()) => {
  const tz = tzOf(leagueOf(d, leagueId)); const w = weekOf(now, tz);
  return zoned(w.y, w.mo, w.d, 0, 0, tz);
};

export type Line = Entry & { running: number };
// Rows newest first with the balance after each row.
function linesOf(d: DB, leagueId: string, memberId: string): Line[] {
  let run = 0;
  return store(d).ledger.filter((e) => e.league_id === leagueId && e.member_id === memberId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => ({ ...e, running: (run += e.amount) }))
    .reverse();
}

export async function coinBalance(user: User, leagueId: string) {
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || !isOn(l, 'coins')) return null;
  if (syncCoins(d, leagueId)) await save();
  return balanceOf(d, leagueId, me.id);
}

export type Wallet = {
  on: boolean; memberId: string | null; balance: number; week: number;
  breakdown: { reason: Reason; amount: number }[]; recent: Line[]; line: number[];
};
export async function wallet(user: User, leagueId: string): Promise<Wallet> {
  await wait(80);
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || !isOn(l, 'coins')) return { on: false, memberId: me?.id ?? null, balance: 0, week: 0, breakdown: [], recent: [], line: [] };
  if (syncCoins(d, leagueId)) await save();
  const lines = linesOf(d, leagueId, me.id);
  const start = weekStart(d, leagueId);
  const by = new Map<Reason, number>();
  lines.forEach((e) => by.set(e.reason, (by.get(e.reason) ?? 0) + e.amount));
  // Weekly balance for the last 8 weeks, oldest first.
  const line = Array.from({ length: 8 }, (_, i) => {
    const end = start + (i - 6) * 7 * DAY;
    return lines.filter((e) => new Date(e.at).getTime() < end).reduce((s, e) => s + e.amount, 0);
  });
  return {
    on: true, memberId: me.id, balance: balanceOf(d, leagueId, me.id),
    week: lines.filter((e) => new Date(e.at).getTime() >= start).reduce((s, e) => s + e.amount, 0),
    breakdown: (['match', 'win', 'upset', 'cup', 'quest', 'award', 'cards', 'pass', 'chest'] as Reason[]).map((reason) => ({ reason, amount: by.get(reason) ?? 0 })).filter((x) => x.amount),
    recent: lines.slice(0, 5), line,
  };
}

export type Filter = 'all' | 'earned' | 'corrections' | 'matches' | 'cup' | 'quests' | 'awards';
const pass = (f: Filter, e: Entry) => f === 'all' || (f === 'earned' && e.amount > 0 && !e.correction) || (f === 'corrections' && !!e.correction)
  || (f === 'matches' && ['match', 'win', 'upset'].includes(e.reason)) || (f === 'cup' && e.reason === 'cup') || (f === 'quests' && e.reason === 'quest') || (f === 'awards' && e.reason === 'award');

// G6.1: own history only (an owner or admin may open someone else's for a dispute).
export async function coinHistory(user: User, leagueId: string, filter: Filter = 'all', limit = 30, memberId?: string) {
  await wait(80);
  const d = await freshCoins(leagueId);
  const me = meIn(d, leagueId, user);
  if (!me) throw new ApiError('not a member');
  const target = memberId ?? me.id;
  if (target !== me.id && me.role === 'member') throw new ApiError('not allowed');
  const all = linesOf(d, leagueId, target).filter((e) => pass(filter, e));
  return { rows: all.slice(0, limit), more: all.length > limit };
}

export async function richest(leagueId: string) {
  const d = await freshCoins(leagueId);
  const start = weekStart(d, leagueId);
  return d.members.filter((m) => m.league_id === leagueId && !m.status).map((m) => {
    const rows = store(d).ledger.filter((e) => e.league_id === leagueId && e.member_id === m.id);
    return { member: m, balance: rows.reduce((s, e) => s + e.amount, 0), week: rows.filter((e) => new Date(e.at).getTime() >= start).reduce((s, e) => s + e.amount, 0) };
  }).sort((a, b) => b.balance - a.balance || a.member.display_name.localeCompare(b.member.display_name));
}

// G6.2 Report a problem: a notice to the league's owner and admins.
export async function reportEntry(user: User, entryId: string, note: string) {
  await wait(150);
  const d = await db();
  const e = store(d).ledger.find((x) => x.id === entryId);
  const me = e && meIn(d, e.league_id, user);
  if (!e || !me) throw new ApiError('not found');
  for (const a of d.members.filter((m) => m.league_id === e.league_id && !m.status && (m.role === 'owner' || m.role === 'admin') && m.user_id && m.id !== me.id)) {
    notify(d, { league_id: e.league_id, member_id: a.id, kind: 'coins.report', title: `${me.display_name} asked about coins`,
      body: `${e.label}, ${e.amount > 0 ? '+' : ''}${e.amount}.${note ? ` ${note}` : ''}`, href: e.href ?? '/coins' });
  }
  await save();
}
