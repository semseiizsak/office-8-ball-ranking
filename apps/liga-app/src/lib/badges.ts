// Badges, titles and the wall of shame (G4, G4.1 to G4.4, R2.4, R2.4.1, R1.5) plus the match hook for badges, XP and shame.
// Earned steps are stored per league so they never go away (an undo or edit never takes a badge back).
// Backfill: steps found in older history are saved quietly; only the match that just counted sends notices.
import { db, save, settled, wait, type User } from '@/lib/api';
import { ApiError, counts, notify, type DB, type StoredLeague } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import {
  BADGE, CATALOGUE, levelName, overallOf, progressOf, replay, stepKey, stepOf, TIER_LABEL, titlesOf,
  type BadgeDef, type Tier, type Title, type Track, type Unlock,
} from '@/lib/progress-engine';
import { computeSeasons } from '@/lib/seasons';

export type Earned = Unlock & { backfill?: boolean };
export type Celebration = { kind: 'badge'; id: string; step: number; at: string } | { kind: 'level'; level: number; at: string };
export type BadgeStore = {
  earned: Record<string, Earned[]>; synced: string | null;
  celebrate?: Record<string, Celebration[]>; pins?: Record<string, string[]>;
  fun?: boolean; shame?: number; cheers?: Record<string, string>; freezes?: Record<string, number>;
};
export const SHAME_STEPS = [3, 4, 5];
export const MAX_PINS = 3;

const storeOf = (d: DB, leagueId: string): BadgeStore => {
  d.badges = d.badges ?? {};
  return (d.badges[leagueId] = d.badges[leagueId] ?? { earned: {}, synced: null });
};
const funOn = (s: BadgeStore | undefined) => s?.fun !== false;
const active = (d: DB, leagueId: string) => d.members.filter((m) => m.league_id === leagueId && !m.status);

function podiums(d: DB, l: StoredLeague) {
  if (!isOn(l, 'seasons')) return [];
  try {
    return computeSeasons(d, l.id).filter((s) => s.closed && s.end)
      .flatMap((s) => s.rows.filter((r) => r.rank >= 1 && r.rank <= 3 && r.played > 0).map((r) => ({ member: r.id, at: s.end! })));
  } catch { return []; }
}

// Adds every newly reached step. Live ones (from this match, or found after the last sync) are returned for notices.
function sync(d: DB, l: StoredLeague, matchId: string | null) {
  const had = !!d.badges?.[l.id];
  const s = storeOf(d, l.id);
  const tracks = replay(d, l.id, { podiums: podiums(d, l) });
  const fresh: { member: string; u: Unlock }[] = [];
  let added = had ? 0 : 1;
  for (const [id, t] of tracks) {
    const list = (s.earned[id] = s.earned[id] ?? []);
    const have = new Set(list.map((e) => stepKey(e.id, e.step)));
    for (const u of t.unlocks) {
      if (have.has(stepKey(u.id, u.step))) continue;
      const live = (!!matchId && u.match === matchId) || (had && !!s.synced && u.at > s.synced);
      list.push(live ? u : { ...u, backfill: true });
      added++;
      if (live) fresh.push({ member: id, u });
    }
  }
  s.synced = new Date().toISOString();
  return { s, tracks, fresh, added };
}

function lossRunBefore(d: DB, memberId: string, matchId: string) {
  const mine = new Map(d.mps.filter((p) => p.member_id === memberId && p.match_id !== matchId).map((p) => [p.match_id, p.side]));
  const list = d.matches.filter((m) => mine.has(m.id) && counts(m)).sort((a, b) => b.played_at.localeCompare(a.played_at));
  let n = 0;
  for (const m of list) { if (m.winner === mine.get(m.id)) break; n++; }
  return n;
}

/* ---------- match hook (hooks.ts) ---------- */
export function progressAfterMatch(d: DB, matchId: string) {
  const m = d.matches.find((x) => x.id === matchId);
  const l = m && d.leagues.find((x) => x.id === m.league_id);
  if (!m || !l) return;
  const players = d.mps.filter((p) => p.match_id === matchId).map((p) => p.member_id);
  const member = (id: string) => d.members.find((x) => x.id === id);
  // The person who logged a match that counted right away sees the unlock moment, everyone else gets an inbox row.
  const inApp = (id: string) => !m.confirmed_at && !!member(id)?.user_id && member(id)?.user_id === m.created_by;
  const celebrate = (s: BadgeStore, id: string, c: Celebration) => { s.celebrate = s.celebrate ?? {}; s.celebrate[id] = [...(s.celebrate[id] ?? []), c]; };
  let tracks: Map<string, Track> | null = null;

  if (isOn(l, 'badges')) {
    const r = sync(d, l, matchId);
    tracks = r.tracks;
    const people = active(d, l.id).filter((x) => x.wins + x.losses > 0).length;
    for (const { member: id, u } of r.fresh) {
      const def = BADGE.get(u.id)!, who = member(id);
      if (!who?.user_id || who.status || (def.fun && !funOn(r.s))) continue;
      const tier = def.tiers[u.step];
      if (inApp(id)) celebrate(r.s, id, { kind: 'badge', id: u.id, step: u.step, at: u.at });
      else notify(d, { league_id: l.id, member_id: id, kind: 'badge.unlocked', title: `Badge unlocked: ${def.name}`, body: `${TIER_LABEL[tier]}. ${def.rule(def.goals[u.step])}.`, href: `/badges/${u.id}?member=${id}` });
      // G4.4: a rare step (under 10% of players) is news for the league too.
      const holders = Object.values(r.s.earned).filter((list) => list.some((e) => e.id === u.id && e.step === u.step)).length;
      if (people >= 10 && holders / people < 0.1) {
        for (const o of active(d, l.id)) if (o.id !== id && o.user_id) notify(d, { league_id: l.id, member_id: o.id, kind: 'badge.rare', title: `${who.display_name} earned ${def.name}`, body: `${TIER_LABEL[tier]}. ${def.rule(def.goals[u.step])}.`, href: `/badges/${u.id}?member=${id}` });
      }
    }
  }

  if (isOn(l, 'xp')) {
    const after = tracks ?? replay(d, l.id);
    const before = replay(d, l.id, { exclude: matchId });
    const s = storeOf(d, l.id);
    s.freezes = s.freezes ?? {};
    for (const id of players) {
      const who = member(id);
      if (!who?.user_id || who.guest) continue;
      const a = progressOf(d, l.id, id, after.get(id)), b = progressOf(d, l.id, id, before.get(id));
      if (a.level.level > b.level.level) {
        if (inApp(id)) celebrate(s, id, { kind: 'level', level: a.level.level, at: m.played_at });
        else notify(d, { league_id: l.id, member_id: id, kind: 'xp.level', title: `Level ${a.level.level} reached`, body: `${levelName(a.level.level)}. Keep it going.`, href: `/badges/progress?member=${id}` });
      }
      const noted = s.freezes[id];
      if (noted !== undefined && a.streak.used > noted) notify(d, { league_id: l.id, member_id: id, kind: 'xp.freeze', title: 'A freeze kept your streak alive', body: `Your streak is ${a.streak.current} ${a.streak.current === 1 ? 'week' : 'weeks'}. Freezes left ${a.streak.freezes} of 3.`, href: `/badges/progress?member=${id}` });
      s.freezes[id] = a.streak.used;
    }
  }

  if (isOn(l, 'shame')) {
    const limit = d.badges?.[l.id]?.shame ?? SHAME_STEPS[0];
    for (const id of players) {
      const who = member(id);
      if (!who?.user_id || who.status) continue;
      if (who.streak === -limit) notify(d, { league_id: l.id, member_id: id, kind: 'shame.on', title: 'You made the wall of shame 🤡', body: 'One win and the clown is gone.', href: '/badges/shame' });
      else if (who.streak === 1 && lossRunBefore(d, id, matchId) >= limit) notify(d, { league_id: l.id, member_id: id, kind: 'shame.off', title: 'Back from the wall', body: 'That win cleared it. Nice one.', href: '/badges/shame' });
    }
  }
}

/* ---------- reads ---------- */
export type BadgeView = {
  def: BadgeDef; steps: number; value: number; earned: Earned[];
  next: ReturnType<typeof stepOf>; top: Tier | null; holders: string[]; rarity: number; hidden: boolean;
};
export type Book = Awaited<ReturnType<typeof badgeBook>>;

export async function badgeBook(leagueId: string, memberId: string) {
  const d = await settled(leagueId);
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l || !isOn(l, 'badges')) return null;
  const { s, tracks, added } = sync(d, l, null);
  if (added) await save();
  const fun = funOn(s);
  const players = active(d, leagueId).filter((m) => (tracks.get(m.id)?.metrics.played ?? 0) > 0);
  const mine = s.earned[memberId] ?? [];
  const metrics = tracks.get(memberId)?.metrics;
  const holdersOf = (id: string, step: number) => players.filter((p) => (s.earned[p.id] ?? []).some((e) => e.id === id && e.step === step)).map((p) => p.id);
  const list: BadgeView[] = CATALOGUE.filter((b) => (!b.fun || fun) && (!b.module || isOn(l, b.module))).map((def) => {
    const earned = mine.filter((e) => e.id === def.id).sort((a, b) => a.step - b.step);
    const steps = earned.length;
    const value = metrics?.[def.metric] ?? 0;
    const shown = Math.max(0, steps - 1);
    const holders = holdersOf(def.id, shown);
    return {
      def, steps, value, earned, next: stepOf(def, steps, value), top: steps ? def.tiers[steps - 1] : null,
      holders, rarity: players.length ? holders.length / players.length : 0, hidden: !!def.secret && !steps,
    };
  });
  const timeline = list.flatMap((v) => v.earned.map((e) => {
    const h = holdersOf(e.id, e.step);
    return { ...e, def: v.def, tier: v.def.tiers[e.step], rarity: players.length ? h.length / players.length : 0 };
  })).sort((a, b) => b.at.localeCompare(a.at));
  const earnedCount = timeline.length;
  const total = list.reduce((n, v) => n + v.def.goals.length, 0);
  const tierCount = Object.fromEntries((['bronze', 'silver', 'gold', 'diamond', 'legend'] as Tier[]).map((t) => [t, timeline.filter((e) => e.tier === t).length])) as Record<Tier, number>;
  // Closest goal still open, by share done (G4.1 "Century, 64 of 100 matches").
  const next = list.filter((v) => !v.next.done && !v.hidden && v.value > 0).sort((a, b) => b.next.value / b.next.goal - a.next.value / a.next.goal)[0] ?? null;
  const titles: Title[] = titlesOf(tracks, new Set(active(d, leagueId).map((m) => m.id)), fun);
  const pins = (s.pins?.[memberId] ?? []).filter((id) => list.some((v) => v.def.id === id && v.steps));
  return { list, timeline, earnedCount, total, tierCount, overall: overallOf(earnedCount), next, titles, pins, fun, players: players.length, played: metrics?.played ?? 0 };
}

// Latest or pinned badges for the profile card (R2.1 item 6).
export function showcase(b: Book) {
  if (!b) return [];
  const pinned = b.pins.map((id) => b.list.find((v) => v.def.id === id)!).filter(Boolean);
  const latest = b.timeline.map((e) => b.list.find((v) => v.def.id === e.id)!).filter((v, i, a) => a.indexOf(v) === i);
  return [...pinned, ...latest.filter((v) => !pinned.includes(v))].slice(0, 3);
}

/* ---------- writes ---------- */
const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);

export async function togglePin(user: User, leagueId: string, badgeId: string) {
  await wait(80);
  const d = await db();
  const me = meIn(d, leagueId, user);
  if (!me) throw new ApiError('not a member');
  const s = storeOf(d, leagueId);
  s.pins = s.pins ?? {};
  const list = s.pins[me.id] ?? [];
  if (list.includes(badgeId)) s.pins[me.id] = list.filter((x) => x !== badgeId);
  else if (list.length >= MAX_PINS) throw new ApiError('pins full');
  else s.pins[me.id] = [...list, badgeId];
  await save();
}

const adminIn = (d: DB, leagueId: string, user: User) => { const me = meIn(d, leagueId, user); if (me?.role !== 'owner' && me?.role !== 'admin') throw new ApiError('admins only'); };

export async function setFunBadges(user: User, leagueId: string, on: boolean) {
  const d = await db();
  adminIn(d, leagueId, user);
  storeOf(d, leagueId).fun = on;
  await save();
}

export async function setShameLimit(user: User, leagueId: string, n: number) {
  const d = await db();
  adminIn(d, leagueId, user);
  storeOf(d, leagueId).shame = n;
  await save();
}

// Unlock moments waiting for this player (G4.4, G5.2). Reading clears them; older than a day are dropped.
export async function takeCelebrations(user: User, leagueId: string, peek = false) {
  const d = await db();
  const me = meIn(d, leagueId, user);
  const s = d.badges?.[leagueId];
  if (!me || !s?.celebrate?.[me.id]?.length) return [];
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const list = s.celebrate[me.id].filter((c) => c.at >= cutoff || c.kind === 'level');
  if (!peek) { delete s.celebrate[me.id]; await save(); }
  return list;
}

/* ---------- wall of shame (R1.5) ---------- */
export type ShameRow = { id: string; losses: number; since: string; beatBy: string | null };
export async function shameWall(leagueId: string, userId?: string) {
  const d = await settled(leagueId);
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l || !isOn(l, 'shame')) return null;
  const limit = d.badges?.[leagueId]?.shame ?? SHAME_STEPS[0];
  const rows: ShameRow[] = active(d, leagueId).filter((m) => m.streak <= -limit).sort((a, b) => a.streak - b.streak).map((m) => {
    const mine = new Map(d.mps.filter((p) => p.member_id === m.id).map((p) => [p.match_id, p.side]));
    const list = d.matches.filter((x) => mine.has(x.id) && counts(x)).sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, -m.streak);
    const lastLoss = list[0];
    const beatBy = lastLoss ? d.mps.find((p) => p.match_id === lastLoss.id && p.side === lastLoss.winner)?.member_id ?? null : null;
    return { id: m.id, losses: -m.streak, since: list[list.length - 1]?.played_at ?? m.last_played_at ?? '', beatBy };
  });
  let record: { name: string; n: number } | null = null;
  for (const [id, t] of replay(d, leagueId)) {
    if (t.metrics.lossRun >= limit && (!record || t.metrics.lossRun > record.n)) record = { name: d.members.find((m) => m.id === id)?.display_name ?? 'Former player', n: t.metrics.lossRun };
  }
  const me = userId ? meIn(d, leagueId, { id: userId, email: '' }) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const cheered = new Set(rows.filter((r) => me && d.badges?.[leagueId]?.cheers?.[`${me.id}>${r.id}`] === today).map((r) => r.id));
  return { limit, rows, record, cheered };
}

export async function cheer(user: User, leagueId: string, toId: string) {
  await wait(120);
  const d = await db();
  const me = meIn(d, leagueId, user);
  const to = d.members.find((m) => m.id === toId && m.league_id === leagueId);
  if (!me || !to || me.id === toId) throw new ApiError('not allowed');
  const s = storeOf(d, leagueId);
  s.cheers = s.cheers ?? {};
  const key = `${me.id}>${toId}`, today = new Date().toISOString().slice(0, 10);
  if (s.cheers[key] === today) return false;
  s.cheers[key] = today;
  if (to.user_id) notify(d, { league_id: leagueId, member_id: toId, kind: 'shame.cheer', title: `${me.display_name} sent you a cheer 📣`, body: 'One win and the clown is gone.', href: '/badges/shame' });
  await save();
  return true;
}
