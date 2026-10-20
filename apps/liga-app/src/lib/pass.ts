// Season pass (G3.2, G3.2.1) and the weekly chest (G5.5). Module id 'pass', needs 'seasons'.
// The pass fills from season XP (the same numbers as the XP module: 20 a match, 10 more for a win, 15 more
// for an upset), so it works with or without the XP module. 30 tiers. The free row pays coins and packs,
// the Pro row is cosmetics only (frames, card backs, titles): never coins, packs or anything that plays.
// Nothing is ever lost: free rewards not claimed within 7 days of the season end are credited automatically.
// The chest has fixed, listed contents and opens when all three weekly quests are claimed. No timers to skip.
import { db, save, wait, type User } from '@/lib/api';
import { hasPro } from '@/lib/billing';
import { credit, paid, syncCoins, winChance } from '@/lib/coins';
import { cardsOn, grantPack, PACK, type PackKind } from '@/lib/cards';
import { DAY } from '@/lib/cup';
import { ApiError, counts, type DB, type StoredLeague } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import { questsFor, questsOn, weekKey } from '@/lib/quests';
import { configOf, seasonsOf, type Season, type SeasonLength } from '@/lib/seasons';
import { giveItem, ITEM, type Item } from '@/lib/shop';
import { UPSET } from '@/lib/stats';

export const TIERS = 30;
export const CLAIM_DAYS = 7;
const PER_TIER: Record<SeasonLength, number> = { weekly: 25, monthly: 60, '8w': 100, quarterly: 150, manual: 150 };
export const POINTS = { played: 20, win: 10, upset: 15 };

export type Reward = { kind: 'coins'; coins: number } | { kind: 'pack'; pack: PackKind } | { kind: 'item'; item: Item };
// Free row: coins growing 50 to 300, a pack every 5th tier (coins instead when Cards is off).
export function freeReward(tier: number, cards: boolean): Reward {
  if (tier % 5 === 0) return cards ? { kind: 'pack', pack: tier % 10 === 0 ? 'season' : 'player' } : { kind: 'coins', coins: 200 + tier * 5 };
  return { kind: 'coins', coins: 50 + Math.floor((tier - 1) / 6) * 50 + (tier >= 29 ? 50 : 0) };
}
// Pro row: 18 cosmetic tiers.
const PRO_LIST: [number, string][] = [
  [1, 'frame_court'], [2, 'back_maroon'], [4, 'title_regular'], [6, 'frame_ember'], [8, 'back_ice'], [10, 'title_grinder'],
  [12, 'frame_ice'], [14, 'back_purple'], [16, 'frame_royal'], [18, 'title_clutch'], [20, 'frame_red'], [22, 'back_ember'],
  [24, 'frame_maroon'], [25, 'title_underdog'], [26, 'back_gold'], [27, 'title_finisher'], [28, 'frame_crown'], [30, 'title_king'],
];
export const PRO_TIERS = new Map(PRO_LIST.map(([t, id]) => [t, ITEM.get(id)!]));
export const PRO_COUNT = PRO_TIERS.size;
export const rewardLabel = (r: Reward) => (r.kind === 'coins' ? `${r.coins} coins` : r.kind === 'pack' ? PACK[r.pack].name : r.item.name);

export type PassStore = { claimed: Record<string, { free: number[]; pro: number[] }> }; // `${league}|${member}|${season}`
const ps = (d: DB): PassStore => { const s = (d.pass as PassStore | undefined) ?? { claimed: {} }; d.pass = s; return s; };
const ck = (leagueId: string, memberId: string, n: number) => `${leagueId}|${memberId}|${n}`;
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);
export const passOn = (l: Parameters<typeof isOn>[0]) => isOn(l, 'pass') && isOn(l, 'seasons');

export function pointsIn(d: DB, l: StoredLeague, memberId: string, s: Season) {
  let pts = 0;
  for (const m of d.matches) {
    if (m.league_id !== l.id || !counts(m) || m.played_at < s.start || (s.end && m.played_at >= s.end)) continue;
    const row = d.mps.find((p) => p.match_id === m.id && p.member_id === memberId);
    if (!row) continue;
    const won = row.side === m.winner;
    pts += POINTS.played + (won ? POINTS.win : 0) + (won && winChance(d, m) < UPSET ? POINTS.upset : 0);
  }
  return pts;
}
export const perTier = (l: StoredLeague) => PER_TIER[configOf(l).length];

function claimOne(d: DB, l: StoredLeague, memberId: string, n: number, tier: number, row: 'free' | 'pro', auto = false) {
  const c = (ps(d).claimed[ck(l.id, memberId, n)] ??= { free: [], pro: [] });
  if (c[row].includes(tier)) return;
  if (row === 'free') {
    const r = freeReward(tier, cardsOn(l));
    const ref = `pass:${l.id}:${n}:${tier}`;
    if (r.kind === 'coins' && !paid(d, ref, memberId)) credit(d, { league_id: l.id, member_id: memberId, amount: r.coins, reason: 'pass', label: `Season ${n} pass, tier ${tier}${auto ? ', credited' : ''}`, ref, href: '/pass' });
    if (r.kind === 'pack') grantPack(d, l.id, memberId, r.pack, `Season ${n} pass, tier ${tier}`, ref);
  } else {
    const item = PRO_TIERS.get(tier);
    if (!item) return;
    giveItem(d, l.id, memberId, item.id);
  }
  c[row].push(tier);
}

// Lazy step: free rewards nobody claimed within 7 days of a season end are credited, nothing is lost.
export function syncPass(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !passOn(l)) return false;
  const before = JSON.stringify(ps(d)).length;
  const closed = seasonsOf(l, now).filter((s) => s.closed && s.end && now - new Date(s.end).getTime() > CLAIM_DAYS * DAY).slice(-2);
  for (const s of closed) for (const m of d.members.filter((x) => x.league_id === leagueId && !x.status && !x.guest)) {
    const tier = Math.min(TIERS, Math.floor(pointsIn(d, l, m.id, s) / perTier(l)));
    for (let t = 1; t <= tier; t++) claimOne(d, l, m.id, s.n, t, 'free', true);
  }
  return JSON.stringify(ps(d)).length !== before;
}

const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);

export type PassTile = { tier: number; free: Reward; pro: Item | null; reached: boolean; freeClaimed: boolean; proClaimed: boolean };
export type PassView = {
  on: boolean; guest: boolean; pro: boolean; season: Season | null; claimBy: string | null; points: number; perTier: number; tier: number;
  tiles: PassTile[]; ready: number; xpOn: boolean; daysLeft: number;
};
// G3.2 for the current season, or the season that closed within the last 7 days while it can still be claimed.
export async function passView(user: User, leagueId: string, now = Date.now()): Promise<PassView> {
  await wait(80);
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  const off: PassView = { on: false, guest: false, pro: false, season: null, claimBy: null, points: 0, perTier: 1, tier: 0, tiles: [], ready: 0, xpOn: false, daysLeft: 0 };
  if (!l || !me || !passOn(l)) return off;
  if (me.guest) return { ...off, on: true, guest: true };
  if (syncPass(d, leagueId, now) || syncCoins(d, leagueId, now)) await save();
  const list = seasonsOf(l, now);
  const prev = list.filter((s) => s.closed && s.end && now - new Date(s.end).getTime() <= CLAIM_DAYS * DAY).at(-1);
  const pending = (s: Season) => { const pts = pointsIn(d, l, me.id, s); const c = ps(d).claimed[ck(leagueId, me.id, s.n)]; const tier = Math.min(TIERS, Math.floor(pts / perTier(l))); return tier > (c?.free.length ?? 0); };
  const season = prev && pending(prev) ? prev : list[list.length - 1];
  const points = pointsIn(d, l, me.id, season), per = perTier(l), tier = Math.min(TIERS, Math.floor(points / per));
  const c = ps(d).claimed[ck(leagueId, me.id, season.n)] ?? { free: [], pro: [] };
  const pro = hasPro(l);
  const tiles = Array.from({ length: TIERS }, (_, i) => i + 1).map((t) => ({
    tier: t, free: freeReward(t, cardsOn(l)), pro: PRO_TIERS.get(t) ?? null, reached: t <= tier, freeClaimed: c.free.includes(t), proClaimed: c.pro.includes(t),
  }));
  const ready = tiles.filter((x) => x.reached && (!x.freeClaimed || (pro && x.pro && !x.proClaimed))).length;
  return {
    on: true, guest: false, pro, season, claimBy: season.closed && season.end ? new Date(new Date(season.end).getTime() + CLAIM_DAYS * DAY).toISOString() : null,
    points, perTier: per, tier, tiles, ready, xpOn: isOn(l, 'xp'), daysLeft: season.end ? Math.max(0, Math.ceil((new Date(season.end).getTime() - now) / DAY)) : 0,
  };
}

export async function claimPass(user: User, leagueId: string, n: number, which: { tier: number; row: 'free' | 'pro' } | 'all') {
  await wait(200);
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || !passOn(l)) throw new ApiError('pass off');
  if (me.guest) throw new ApiError('Guests don’t collect');
  const s = seasonsOf(l).find((x) => x.n === n);
  if (!s || (s.closed && s.end && Date.now() - new Date(s.end).getTime() > CLAIM_DAYS * DAY)) throw new ApiError('This pass is closed');
  const tier = Math.min(TIERS, Math.floor(pointsIn(d, l, me.id, s) / perTier(l)));
  const pro = hasPro(l);
  const todo = which === 'all'
    ? Array.from({ length: tier }, (_, i) => i + 1).flatMap((t) => [{ tier: t, row: 'free' as const }, ...(pro && PRO_TIERS.has(t) ? [{ tier: t, row: 'pro' as const }] : [])])
    : [which];
  for (const x of todo) {
    if (x.tier > tier) throw new ApiError('Not reached yet');
    if (x.row === 'pro' && !pro) throw new ApiError('Pro row needs Liga Pro');
    claimOne(d, l, me.id, n, x.tier, x.row);
  }
  await save();
}

/* ---------- G5.5 weekly chest: fixed contents ---------- */
export const CHEST = { coins: 150, pack: 'player' as PackKind };
export type ChestView = { on: boolean; ready: boolean; opened: boolean; done: number; total: number; contents: string[] };
export async function chestState(user: User, leagueId: string): Promise<ChestView> {
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  const contents = (cards: boolean) => [`${CHEST.coins} coins`, ...(cards ? [`1 ${PACK[CHEST.pack].name}`] : [])];
  if (!l || !me || me.guest || !questsOn(l)) return { on: false, ready: false, opened: false, done: 0, total: 3, contents: [] };
  const qs = questsFor(d, leagueId, me.id);
  const opened = paid(d, `chest:${leagueId}:${weekKey(d, leagueId)}`, me.id);
  const done = qs.filter((q) => q.state === 'claimed').length;
  return { on: true, ready: !opened && done === qs.length, opened, done, total: qs.length, contents: contents(cardsOn(l)) };
}
export async function openChest(user: User, leagueId: string) {
  await wait(200);
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || me.guest || !questsOn(l)) throw new ApiError('quests off');
  const ref = `chest:${leagueId}:${weekKey(d, leagueId)}`;
  if (paid(d, ref, me.id)) throw new ApiError('Already opened this week');
  if (questsFor(d, leagueId, me.id).some((q) => q.state !== 'claimed')) throw new ApiError('Claim all three quests first');
  credit(d, { league_id: leagueId, member_id: me.id, amount: CHEST.coins, reason: 'chest', label: 'Weekly chest', ref, href: '/chest' });
  const pack = cardsOn(l) ? grantPack(d, leagueId, me.id, CHEST.pack, 'From the weekly chest', ref) : null;
  await save();
  return { coins: CHEST.coins, packId: pack?.id ?? null };
}
