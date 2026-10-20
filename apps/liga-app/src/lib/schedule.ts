// Scheduling module: match of the day (M7.3), who's free (M7.5), time slots (M10.1) and the week plan (M10.5).
// Table booking and the queue (M10.2 to M10.4) are P3. Match of the day pairs are a deterministic daily seed,
// so every phone shows the same pairs without a read; bots go "free" in deterministic 30 minute blocks.
import { notify, type DB } from '@/lib/engine';
import { db, save, wait, type User } from '@/lib/api';
import { DAY, dayKey, h01, H, parts, resolveCups, roundName, tzOf, weekday, weekOf, zoned } from '@/lib/cup';
import { eloPreview } from '@/lib/elo';
import { isOn } from '@/lib/modules';
import type { Member } from '@/lib/types';

export type ScheduleStore = { free: { league_id: string; member_id: string; until: string }[]; motdSent: Record<string, string> };
const store = (d: DB): ScheduleStore => (d.schedule = d.schedule ?? { free: [], motdSent: {} });
const iso = (n: number) => new Date(n).toISOString();
const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);

// Office leagues play on workdays, so the match of the day rests at the weekend.
const restDay = (template: string | undefined, at: number, tz: string) => (template ?? 'office') === 'office' && weekday(at, tz) > 5;

export function motdPairs(leagueId: string, members: Member[], key: string) {
  const ids = members.filter((m) => !m.status).map((m) => m.id).sort().sort((a, b) => h01(key + leagueId + a) - h01(key + leagueId + b));
  const pairs = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 2) { pairs.set(ids[i], ids[i + 1] ?? null); if (ids[i + 1]) pairs.set(ids[i + 1], ids[i]); }
  return pairs;
}

const playedOn = (d: DB, leagueId: string, a: string, b: string, key: string, tz: string) =>
  d.matches.some((m) => m.league_id === leagueId && m.format === '1v1' && dayKey(t(m.played_at), tz) === key &&
    [a, b].every((id) => d.mps.some((p) => p.match_id === m.id && p.member_id === id)));

export type Motd = { hidden: boolean; off: boolean; opp: Member | null; chance: number; win: number; done: boolean; streak: number };

export async function matchOfTheDay(user: User, leagueId: string): Promise<Motd | null> {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
  if (!l || !me || !isOn(l, 'schedule')) return null;
  const tz = tzOf(l), now = Date.now();
  const members = d.members.filter((m) => m.league_id === leagueId && !m.status);
  if (restDay(l.template, now, tz)) return { hidden: true, off: false, opp: null, chance: 0, win: 0, done: false, streak: 0 };
  const key = dayKey(now, tz);
  const oppId = motdPairs(leagueId, members, key).get(me.id) ?? null;
  const opp = members.find((m) => m.id === oppId) ?? null;
  const done = !!opp && playedOn(d, leagueId, me.id, opp.id, key, tz);
  // Day streak: consecutive play days with the match of the day done, today counts once it is done.
  let streak = done ? 1 : 0;
  for (let i = 1, back = now - DAY; i < 60; i++, back -= DAY) {
    if (restDay(l.template, back, tz)) continue;
    const k = dayKey(back, tz);
    const o = motdPairs(leagueId, members, k).get(me.id);
    if (!o || !playedOn(d, leagueId, me.id, o, k, tz)) break;
    streak++;
  }
  const p = opp ? eloPreview(me.rating, opp.rating, l.k_factor) : null;
  // Morning notice at 9:00 league time, once a day.
  const sentKey = `${leagueId}:${me.id}`;
  if (opp && !done && parts(now, tz).h >= 9 && store(d).motdSent[sentKey] !== key) {
    store(d).motdSent[sentKey] = key;
    notify(d, { league_id: leagueId, member_id: me.id, kind: 'schedule.motd', title: `Today you play ${opp.display_name}`, body: `${Math.round(p!.chanceA * 100)}% to win. Your match of the day.`, href: '/arena' });
    await save();
  }
  return { hidden: false, off: !opp, opp, chance: p?.chanceA ?? 0, win: p?.aWins ?? 0, done, streak };
}

/* ---------- who's free (M7.5) ---------- */

export const FREE_FOR = [15, 30, 60] as const;
export type Free = { member: Member; until: string; mine: boolean };

export async function whosFree(user: User, leagueId: string): Promise<{ list: Free[]; mine: string | null }> {
  const d = await db();
  const now = Date.now();
  const members = d.members.filter((m) => m.league_id === leagueId && !m.status);
  const me = members.find((m) => m.user_id === user.id);
  const s = store(d);
  const real = s.free.filter((f) => f.league_id === leagueId && t(f.until) > now);
  const block = Math.floor(now / (30 * 60000));
  const list: Free[] = [];
  for (const m of members) {
    const r = real.find((f) => f.member_id === m.id);
    if (r) list.push({ member: m, until: r.until, mine: m.id === me?.id });
    else if (m.user_id === null && h01(`${block}${m.id}free`) < 0.3) list.push({ member: m, until: iso((block + 1) * 30 * 60000), mine: false });
  }
  return { list: list.sort((a, b) => Number(b.mine) - Number(a.mine) || b.until.localeCompare(a.until)), mine: real.find((f) => f.member_id === me?.id)?.until ?? null };
}

export async function setFree(user: User, leagueId: string, minutes: number) {
  await wait(120);
  const d = await db();
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
  if (!me) return;
  const s = store(d);
  s.free = s.free.filter((f) => !(f.league_id === leagueId && f.member_id === me.id) && t(f.until) > Date.now());
  if (minutes > 0) s.free.push({ league_id: leagueId, member_id: me.id, until: iso(Date.now() + minutes * 60000) });
  await save();
}

/* ---------- time slots (M10.1) ---------- */

export const SLOT_MIN = 15;
export const OPEN_HOUR = 8, CLOSE_HOUR = 20;

// Quick picks in the league time zone: Now, In 30 min, After lunch 13:00, Tomorrow 12:30.
export function quickTimes(tz: string, now = Date.now()) {
  const p = parts(now, tz);
  const lunch = zoned(p.y, p.mo, p.d, 13, 0, tz);
  const tomorrow = zoned(p.y, p.mo, p.d + 1, 12, 30, tz);
  const round = Math.ceil(now / (5 * 60000)) * 5 * 60000;
  return [
    { label: 'Now', at: round },
    { label: 'In 30 min', at: round + 30 * 60000 },
    { label: 'After lunch 13:00', at: lunch > now ? lunch : null },
    { label: 'Tomorrow 12:30', at: tomorrow },
  ].filter((x): x is { label: string; at: number } => x.at !== null);
}

// The next 7 days and their 15 minute slots between 8:00 and 20:00, league time.
export function dayStarts(tz: string, now = Date.now()) {
  const p = parts(now, tz);
  return Array.from({ length: 7 }, (_, i) => zoned(p.y, p.mo, p.d + i, 0, 0, tz));
}
export function slotsFor(dayStart: number, tz: string) {
  const p = parts(dayStart + 2 * H, tz);
  const out: number[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) for (let m = 0; m < 60; m += SLOT_MIN) out.push(zoned(p.y, p.mo, p.d, h, m, tz));
  return out;
}
// "Budapest time" when the phone runs in another zone.
export function zoneNote(tz: string) {
  try {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return here && here !== tz ? `${tz.split('/').pop()?.replace(/_/g, ' ')} time` : null;
  } catch { return null; }
}

/* ---------- week plan (M10.5) ---------- */

export type PlanItem = { at: string; kind: 'challenge' | 'cup' | 'deadline' | 'motd'; title: string; body: string; href: string; mine: boolean; colour: Member['colour'] | null };

export async function weekPlan(user: User, leagueId: string, offset = 0) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return { days: [] as { start: number; items: PlanItem[] }[], tz: 'Europe/Budapest' };
  const tz = tzOf(l);
  if (resolveCups(d, leagueId)) await save();
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
  const members = d.members.filter((m) => m.league_id === leagueId && !m.status);
  const name = (id: string | null) => (id === me?.id ? 'You' : members.find((m) => m.id === id)?.display_name ?? 'Someone');
  const w = weekOf(Date.now() + offset * 7 * DAY, tz);
  const starts = Array.from({ length: 8 }, (_, i) => zoned(w.y, w.mo, w.d + i, 0, 0, tz));
  const items: PlanItem[] = [];
  if (isOn(l, 'challenges')) {
    for (const c of (d.challenges ?? []).filter((x) => x.league_id === leagueId && x.status === 'accepted' && x.scheduled_at)) {
      const mine = c.from === me?.id || c.to === me?.id;
      items.push({ at: c.scheduled_at!, kind: 'challenge', title: `${name(c.from)} vs ${name(c.to)}`, body: 'Challenge', href: `/challenge/${c.id}`, mine,
        colour: members.find((m) => m.id === c.from)?.colour ?? null });
    }
  }
  if (isOn(l, 'cup')) {
    for (const c of (d.cups ?? []).filter((x) => x.league_id === leagueId && x.status === 'running')) {
      for (const g of c.games.filter((x) => x.status === 'open' || x.status === 'waiting')) {
        const mine = g.a === me?.id || g.b === me?.id;
        const rn = roundName(g.round, c.rounds);
        const vs = g.a && g.b ? `${name(g.a)} vs ${name(g.b)}` : rn;
        if (g.planned_at) items.push({ at: g.planned_at, kind: 'cup', title: vs, body: `Cup ${rn.toLowerCase()}`, href: `/cup/game/${g.id}`, mine, colour: null });
        if (mine) {
          const opp = g.a === me?.id ? g.b : g.a;
          items.push({ at: g.deadline, kind: 'deadline', title: `${rn} deadline`, body: opp ? `Play ${name(opp)} before then, or it ends in a walkover.` : 'Your opponent is still being decided.', href: `/cup/game/${g.id}`, mine, colour: null });
        }
      }
    }
  }
  if (isOn(l, 'schedule') && me) {
    for (let i = 0; i < 7; i++) {
      const at = starts[i] + 9 * H;
      if (restDay(l.template, at, tz)) continue;
      const opp = motdPairs(leagueId, members, dayKey(at, tz)).get(me.id);
      if (opp) items.push({ at: iso(at), kind: 'motd', title: `You vs ${name(opp)}`, body: 'Match of the day', href: '/arena', mine: true, colour: null });
    }
  }
  const days = starts.slice(0, 7).map((start, i) => ({
    start, items: items.filter((x) => t(x.at) >= start && t(x.at) < starts[i + 1]).sort((a, b) => a.at.localeCompare(b.at)),
  }));
  return { days, tz, week: w.no };
}
