// Weekly awards (G10 ceremony, G10.1 and M6.6 archive). Every Friday 16:00 league time the week since the
// previous ceremony is closed: player of the week, biggest upset, best newcomer, most matches, iron man and
// match of the week. Computed lazily on the first read after the ceremony time and stored, so it never changes later.
import { db, save } from '@/lib/api';
import { credit, winChance } from '@/lib/coins';
import { DAY, dayKey, H, tzOf, weekOf, zoned } from '@/lib/cup';
import { counts, notify, uid, type DB, type StoredLeague, type StoredMatch } from '@/lib/engine';
import { isOn } from '@/lib/modules';

export type AwardKey = 'mvp' | 'upset' | 'newcomer' | 'busiest' | 'iron' | 'motw';
export type AwardItem = { key: AwardKey; label: string; members: string[]; value: string; match_id?: string; coins: number };
export type Award = {
  id: string; league_id: string; week_key: string; week_no: number; from: string; at: string;
  matches: number; quiet: boolean; items: AwardItem[];
};
export const CEREMONY = { day: 5, hour: 16 }; // Friday 16:00
export const QUIET_MIN = 5;
const NEWCOMER_DAYS = 28;
const BACK_WEEKS = 8; // first read in a league computes at most this many past weeks
const COINS: Record<AwardKey, number> = { mvp: 100, upset: 50, newcomer: 50, busiest: 50, iron: 50, motw: 0 };
export const LABEL: Record<AwardKey, string> = {
  mvp: 'Player of the week', upset: 'Biggest upset', newcomer: 'Best newcomer', busiest: 'Most matches', iron: 'Iron man', motw: 'Match of the week',
};

const list = (d: DB) => (d.awards = (d.awards as Award[] | undefined) ?? []) as Award[];
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);
const nameOf = (d: DB, id: string) => d.members.find((m) => m.id === id)?.display_name ?? 'Someone';

type Week = ReturnType<typeof weekOf>;
const fri = (w: Week, tz: string) => zoned(w.y, w.mo, w.d + CEREMONY.day - 1, CEREMONY.hour, 0, tz);
// The latest ceremony at or before `now`, and the next one after it.
export function ceremonyAt(now: number, tz: string, back = 0) {
  let w = weekOf(now - back * 7 * DAY, tz);
  if (fri(w, tz) > now - back * 7 * DAY) w = weekOf(now - (back + 1) * 7 * DAY, tz);
  return { w, at: fri(w, tz), from: zoned(w.y, w.mo, w.d + CEREMONY.day - 8, CEREMONY.hour, 0, tz) };
}
export const nextCeremony = (now: number, tz: string) => { const w = weekOf(now, tz); const f = fri(w, tz); return f > now ? f : fri(weekOf(now + 7 * DAY, tz), tz); };

function compute(d: DB, l: StoredLeague, w: Week, from: number, at: number): Award {
  let inWeek = d.matches.filter((m) => m.league_id === l.id && counts(m)).filter((m) => { const t = new Date(m.played_at).getTime(); return t >= from && t < at; });
  // Demo league: if the week was quiet, the ceremony looks back at the last 7 days that had matches, so it is never empty.
  if (l.id === 'lg_demo' && inWeek.length < QUIET_MIN) {
    const before = d.matches.filter((m) => m.league_id === l.id && counts(m) && new Date(m.played_at).getTime() < at).sort((a, b) => b.played_at.localeCompare(a.played_at));
    const last = before[0] ? new Date(before[0].played_at).getTime() : 0;
    inWeek = before.filter((m) => new Date(m.played_at).getTime() > last - 7 * DAY);
  }
  const award: Award = { id: uid(), league_id: l.id, week_key: w.key, week_no: w.no, from: new Date(from).toISOString(), at: new Date(at).toISOString(), matches: inWeek.length, quiet: inWeek.length < QUIET_MIN, items: [] };
  if (award.quiet) return award;

  const rows = (m: StoredMatch) => d.mps.filter((p) => p.match_id === m.id);
  type S = { id: string; played: number; won: number; lost: number; gain: number; days: Set<string> };
  const st = new Map<string, S>();
  const tz = tzOf(l);
  for (const m of inWeek) for (const p of rows(m)) {
    const s = st.get(p.member_id) ?? { id: p.member_id, played: 0, won: 0, lost: 0, gain: 0, days: new Set<string>() };
    s.played++; if (p.side === m.winner) s.won++; else s.lost++; s.gain += p.delta;
    s.days.add(dayKey(new Date(m.played_at).getTime(), tz));
    st.set(p.member_id, s);
  }
  const all = [...st.values()].filter((s) => d.members.some((m) => m.id === s.id && !m.status));
  const got = new Set<string>();
  const add = (key: AwardKey, members: string[], value: string, match_id?: string) => {
    award.items.push({ key, label: LABEL[key], members, value, match_id, coins: COINS[key] });
    members.forEach((x) => got.add(x));
  };
  // Best by score; on a tie someone without an award yet goes first, so the awards spread out.
  const best = (pool: S[], score: (s: S) => number) =>
    [...pool].sort((a, b) => score(b) - score(a) || Number(got.has(a.id)) - Number(got.has(b.id)) || b.gain - a.gain)[0] ?? null;

  const mvp = best(all, (s) => (s.won - s.lost) * 100 + s.won);
  if (mvp && mvp.won > 0) add('mvp', [mvp.id], `${mvp.won} W, ${mvp.lost} L`);

  const upset = inWeek.map((m) => ({ m, c: winChance(d, m) })).filter((x) => x.c < 0.5).sort((a, b) => a.c - b.c)[0];
  if (upset) {
    const r = rows(upset.m);
    add('upset', r.filter((p) => p.side === upset.m.winner).map((p) => p.member_id),
      `${Math.round(upset.c * 100)}% chance, beat ${r.filter((p) => p.side !== upset.m.winner).map((p) => nameOf(d, p.member_id)).join(' and ')}`, upset.m.id);
  }

  const firstMatch = (id: string) => d.matches.filter((m) => m.league_id === l.id && counts(m) && d.mps.some((p) => p.match_id === m.id && p.member_id === id))
    .reduce((x, m) => (m.played_at < x ? m.played_at : x), '9999');
  // A newcomer played their first match in the last 4 weeks, and not in the league's first week (founders are not new).
  const joinedLate = (t: number) => t >= at - NEWCOMER_DAYS * DAY && t >= new Date(l.created_at).getTime() + 7 * DAY;
  const fresh = all.filter((s) => s.played >= 2 && joinedLate(new Date(firstMatch(s.id)).getTime()));
  const nc = best(fresh, (s) => s.won * 100 + Math.round((s.won / s.played) * 99));
  if (nc) add('newcomer', [nc.id], `${nc.won} of ${nc.played} won`);

  const busy = best(all, (s) => s.played);
  if (busy) add('busiest', [busy.id], `${busy.played} played`);

  const iron = best(all.filter((s) => !got.has(s.id)), (s) => s.days.size); // spreads the awards: someone new gets it
  if (iron && iron.days.size >= 3) add('iron', [iron.id], `Played on ${iron.days.size} days`);

  const reacts = (m: StoredMatch) => (d.reactions ?? []).filter((r) => r.match_id === m.id).length + (d.chat?.comments ?? []).filter((c) => c.match_id === m.id && !c.deleted_at).length;
  const motw = [...inWeek].sort((a, b) => reacts(b) - reacts(a))[0];
  if (motw && reacts(motw) >= 2) {
    const r = rows(motw);
    add('motw', r.filter((p) => p.side === motw.winner).map((p) => p.member_id), `${reacts(motw)} reactions, vs ${r.filter((p) => p.side !== motw.winner).map((p) => nameOf(d, p.member_id)).join(' and ')}`, motw.id);
  }
  return award;
}

function pay(d: DB, l: StoredLeague, a: Award) {
  if (!isOn(l, 'coins')) return;
  for (const it of a.items) for (const id of it.members) {
    if (!it.coins || !d.members.some((m) => m.id === id && !m.status)) continue;
    credit(d, { league_id: l.id, member_id: id, amount: it.coins, reason: 'award', label: `Week ${a.week_no}: ${it.label}`, ref: `award:${a.id}:${it.key}`, href: `/awards/${a.id}`, at: a.at });
  }
}

function announce(d: DB, l: StoredLeague, a: Award) {
  const mvp = a.items.find((x) => x.key === 'mvp');
  for (const m of d.members.filter((x) => x.league_id === l.id && x.user_id && !x.status)) {
    const mine = a.items.filter((x) => x.members.includes(m.id));
    if (mine.length) notify(d, { league_id: l.id, member_id: m.id, kind: 'awards.won', title: `You won ${mine[0].label} 🏅`, body: `Week ${a.week_no} awards are in.`, href: `/awards/${a.id}` });
    else notify(d, { league_id: l.id, member_id: m.id, kind: 'awards.new', title: `Week ${a.week_no} awards are in 🏅`, body: mvp ? `${nameOf(d, mvp.members[0])} is player of the week.` : 'See who won what.', href: `/awards/${a.id}` });
  }
}

// Lazy step: closes every ceremony that is due. Returns true when it wrote something.
export function resolveAwards(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !isOn(l, 'awards')) return false;
  const tz = tzOf(l);
  const done = new Set(list(d).filter((a) => a.league_id === l.id).map((a) => a.week_key));
  const created = new Date(l.created_at).getTime();
  let changed = false;
  for (let k = BACK_WEEKS - 1; k >= 0; k--) {
    const c = ceremonyAt(now, tz, k);
    if (c.at <= created || done.has(c.w.key)) continue;
    if (k > 0 && list(d).some((a) => a.league_id === l.id && new Date(a.at).getTime() > c.at)) continue;
    const a = compute(d, l, c.w, c.from, c.at);
    list(d).push(a); done.add(c.w.key); changed = true;
    pay(d, l, a);
    if (k === 0 && !a.quiet && now - c.at < 48 * H) announce(d, l, a);
  }
  return changed;
}

/* ---------- reads ---------- */

async function fresh(leagueId: string) {
  const d = await db();
  if (resolveAwards(d, leagueId)) await save();
  return d;
}

export type AwardsHome = { on: boolean; list: Award[]; latest: Award | null; next: number; mostMvp: { id: string; n: number } | null; tz: string };
export async function awardsHome(leagueId: string): Promise<AwardsHome> {
  const d = await fresh(leagueId);
  const l = leagueOf(d, leagueId);
  const tz = tzOf(l);
  const own = list(d).filter((a) => a.league_id === leagueId).sort((a, b) => b.at.localeCompare(a.at));
  const mv = new Map<string, number>();
  own.forEach((a) => a.items.filter((x) => x.key === 'mvp').forEach((x) => x.members.forEach((id) => mv.set(id, (mv.get(id) ?? 0) + 1))));
  const top = [...mv.entries()].sort((a, b) => b[1] - a[1])[0];
  return { on: !!l && isOn(l, 'awards'), list: own, latest: own[0] ?? null, next: nextCeremony(Date.now(), tz), mostMvp: top ? { id: top[0], n: top[1] } : null, tz };
}

export async function getAward(leagueId: string, id: string) {
  const d = await fresh(leagueId);
  return list(d).find((a) => a.id === id && a.league_id === leagueId) ?? null;
}

// Hero card on the Arena for 48 hours after a ceremony that had awards.
export const heroOf = (a: Award | null) => (a && !a.quiet && Date.now() - new Date(a.at).getTime() < 48 * H ? a : null);

export const weekRange = (a: Pick<Award, 'from' | 'at'>, tz: string) => {
  const f = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
  return `${f(a.from)} to ${f(a.at)}`;
};
