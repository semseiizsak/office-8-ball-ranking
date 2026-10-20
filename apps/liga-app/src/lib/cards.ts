// Collectible cards module (G8 Cards, G8.1 Album, G8.2 Pack opening, G8.3 Card detail, G8.4 Spares,
// G8.4.1 Redeem and upgrade, G8.5 Set complete, G8.6 Trades). Module id 'cards', needs 'coins'.
// Every active league member has a card at every rarity in every set (one set per season). The printed
// numbers come from how they play. Packs come free (welcome, weekly, cup, pass, chest) or for earned coins
// in the shop, never for money. Opening is seeded by the pack id, so a pack can never be rerolled.
// Special editions (Crown, Cup champion, Season champion) are never in packs, never redeemed for coins and never traded.
import { db, save, wait, type User } from '@/lib/api';
import { balanceOf, credit, paid, syncCoins } from '@/lib/coins';
import { tzOf, weekOf } from '@/lib/cup';
import { ApiError, counts, notify, uid, type DB, type StoredLeague } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import { computeSeasons, seasonsOf } from '@/lib/seasons';
import { PROVISIONAL } from '@/lib/stats';
import type { PlayerColour } from '@/theme';

/* ---------- rules ---------- */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
export const ALBUM_RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']; // a Mythic is 1 of 1, a bonus, never needed for the set
export const ODDS: Record<Rarity, number> = { common: 0.62, uncommon: 0.25, rare: 0.095, epic: 0.03, legendary: 0.0045, mythic: 0.0005 };
export const REDEEM: Record<Rarity, number> = { common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 200, mythic: 0 };
export const PER_PACK = 3;
export const PITY = 30; // packs without a Legendary before one is guaranteed
export const UPGRADE_COST = 3;
export const SET_REWARD = 250;
export const DAILY_PACKS = 3; // shop limit per day, against farming and compulsive opening
export const TRADE_MAX = 3; // cards per side
export const TRADE_OPEN = 5; // open offers per player
export const TRADE_HOURS = 48;
const BOT_REPLY = 90 * 1000;
const H = 3600000;
const rank = (r: Rarity) => RARITIES.indexOf(r);
export const nextRarity = (r: Rarity): Rarity | null => (rank(r) >= rank('legendary') ? null : RARITIES[rank(r) + 1]);

export type PackKind = 'player' | 'season' | 'retro' | 'legendary' | 'gold';
export const PACK: Record<PackKind, { name: string; body: string; min?: Rarity; retro?: boolean; price?: number }> = {
  player: { name: 'Player pack', body: '3 cards from this season', price: 150 },
  season: { name: 'Season pack', body: '3 cards, one Rare or better', min: 'rare', price: 400 },
  retro: { name: 'Retro pack', body: '3 cards from earlier seasons', retro: true, price: 500 },
  legendary: { name: 'Legendary pack', body: '3 cards, one Legendary or better', min: 'legendary', price: 1200 },
  gold: { name: 'Gold pack', body: '3 cards, one Rare or better', min: 'rare' },
};
export const SHOP_PACKS: PackKind[] = ['player', 'season', 'retro', 'legendary'];

export type SpecialType = 'crown' | 'cup' | 'season';
export const SPECIAL: Record<SpecialType, { label: string; rarity: Rarity }> = {
  crown: { label: 'Crown holder', rarity: 'epic' }, cup: { label: 'Cup champion', rarity: 'epic' }, season: { label: 'Season champion', rarity: 'legendary' },
};

/* ---------- store ---------- */
export type Pack = {
  id: string; league_id: string; member_id: string; kind: PackKind; set: number; reason: string; ref: string; at: string;
  opened_at?: string; cards?: string[]; fresh?: string[]; pity?: number;
};
export type Trade = {
  id: string; league_id: string; from: string; to: string; give: string[]; want: string[]; note: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'; at: string; done_at?: string; reason?: string;
};
export type SpecialCard = { type: SpecialType; member: string; note: string; at: string };
export type CardStore = {
  owned: Record<string, Record<string, number>>; // `${league}|${member}` -> card key -> count
  packs: Pack[];
  pity: Record<string, number>;
  serials: Record<string, number>; // `${league}|${key}` -> copies printed so far
  mythics: Record<string, string>; // `${league}|${key}` -> first owner (1 of 1)
  finished: Record<string, string[]>; // `${league}|${set}` -> members who completed the set, in order
  specials: Record<string, SpecialCard>; // `${league}|${key}`
  weekly: Record<string, string>; // `${league}|${member}` -> week key of the last free weekly pack
  welcomed: Record<string, true>;
  seasonsDone: Record<string, number>; // league -> last season whose champion card went out
  trades: Trade[];
};
export const cardStore = (d: DB): CardStore => {
  const s = (d.cards as CardStore | undefined) ?? { owned: {}, packs: [], pity: {}, serials: {}, mythics: {}, finished: {}, specials: {}, weekly: {}, welcomed: {}, seasonsDone: {}, trades: [] };
  d.cards = s;
  return s;
};
const mk = (leagueId: string, memberId: string) => `${leagueId}|${memberId}`;
export const ownedOf = (d: DB, leagueId: string, memberId: string) => {
  const s = cardStore(d);
  return (s.owned[mk(leagueId, memberId)] ??= {});
};
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);
export const cardsOn = (l: Parameters<typeof isOn>[0]) => isOn(l, 'coins') && isOn(l, 'cards');

/* ---------- keys ---------- */
export const playerKey = (set: number, memberId: string, r: Rarity) => `${set}:${memberId}:${r}`;
export type Parsed = { special: false; set: number; member: string; rarity: Rarity } | { special: true; type: SpecialType; member: string; ref: string; rarity: Rarity };
export function parseKey(key: string): Parsed {
  const p = key.split(':');
  if (p[0] === 'sp') return { special: true, type: p[1] as SpecialType, member: p[2], ref: p.slice(3).join(':'), rarity: SPECIAL[p[1] as SpecialType]?.rarity ?? 'epic' };
  return { special: false, set: Number(p[0]), member: p[1], rarity: p[2] as Rarity };
}
const specialKey = (type: SpecialType, memberId: string, ref: string) => `sp:${type}:${memberId}:${ref}`;

/* ---------- sets ---------- */
// One set per season when Seasons is on; otherwise the league has one long set.
export function currentSet(l: StoredLeague, now = Date.now()) {
  if (!isOn(l, 'seasons')) return 1;
  return seasonsOf(l, now).at(-1)?.n ?? 1;
}
export const collectors = (d: DB, leagueId: string) => d.members.filter((m) => m.league_id === leagueId && !m.status && !m.guest);
export const setKeys = (d: DB, leagueId: string, set: number) => collectors(d, leagueId).flatMap((m) => ALBUM_RARITIES.map((r) => playerKey(set, m.id, r)));

/* ---------- seeded random ---------- */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
// Odds over the rarities at or above min, renormalised (what a guaranteed slot uses).
export function oddsFrom(min?: Rarity): Record<Rarity, number> {
  const allowed = RARITIES.filter((r) => !min || rank(r) >= rank(min));
  const total = allowed.reduce((s, r) => s + ODDS[r], 0);
  return Object.fromEntries(RARITIES.map((r) => [r, allowed.includes(r) ? ODDS[r] / total : 0])) as Record<Rarity, number>;
}
export function roll(random: () => number, odds: Record<Rarity, number>): Rarity {
  let x = random();
  for (const r of [...RARITIES].reverse()) { if (x < odds[r]) return r; x -= odds[r]; }
  return RARITIES.find((r) => odds[r] > 0) ?? 'common';
}

// G7.1: exactly what the pack rolls, shown before buying.
export function packOdds(kind: PackKind) {
  const p = PACK[kind];
  const slots = p.min
    ? [{ label: 'Cards 1 and 2', odds: oddsFrom() }, { label: `Card 3, ${RARITY_LABEL[p.min]} or better`, odds: oddsFrom(p.min) }]
    : [{ label: 'Each card', odds: oddsFrom() }];
  return { slots, pity: PITY };
}

// Pure and deterministic: the same pack id always gives the same cards (tests, and no rerolls).
// pity: packs opened since the last Legendary; takenMythic says whether that player's Mythic in that set is gone.
export function rollPack(p: { id: string; kind: PackKind; sets: number[]; members: string[]; pity: number; takenMythic: (set: number, member: string) => boolean }) {
  const random = seeded(`pack:${p.id}`);
  const members = [...p.members].sort();
  const min = PACK[p.kind].min;
  const out = Array.from({ length: PER_PACK }, (_, i) => ({
    set: p.sets[Math.floor(random() * p.sets.length)],
    member: members[Math.floor(random() * members.length)],
    rarity: roll(random, oddsFrom(i === PER_PACK - 1 ? min : undefined)),
  }));
  const last = out[PER_PACK - 1];
  if (p.pity + 1 >= PITY && !out.some((c) => rank(c.rarity) >= rank('legendary'))) last.rarity = 'legendary';
  const seen = new Set<string>();
  for (const c of out) {
    if (c.rarity !== 'mythic') continue;
    const k = `${c.set}:${c.member}`;
    if (p.takenMythic(c.set, c.member) || seen.has(k)) c.rarity = 'legendary';
    seen.add(k);
  }
  return out.sort((a, b) => rank(a.rarity) - rank(b.rarity)); // the rarest is revealed last
}

/* ---------- printed numbers ---------- */
export type CardStats = { ovr: number; rating: number; win: number; form: number; clutch: number; streak: number; rival: string | null; played: number };
const BONUS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5, mythic: 8 };
export const ovrFor = (s: CardStats, r: Rarity) => Math.min(99, s.ovr + BONUS[r]);

// Rating 64 to 94 from the Elo, every stat from confirmed matches.
export function statsOf(d: DB, leagueId: string) {
  const ids = new Set(d.matches.filter((m) => m.league_id === leagueId && counts(m)).map((m) => m.id));
  const order = new Map(d.matches.filter((m) => ids.has(m.id)).map((m) => [m.id, m.played_at]));
  const rows = d.mps.filter((p) => ids.has(p.match_id)).sort((a, b) => (order.get(a.match_id) ?? '').localeCompare(order.get(b.match_id) ?? ''));
  const byMatch = new Map<string, typeof rows>();
  rows.forEach((p) => byMatch.set(p.match_id, [...(byMatch.get(p.match_id) ?? []), p]));
  const winner = new Map(d.matches.filter((m) => ids.has(m.id)).map((m) => [m.id, m.winner]));
  const name = (id: string) => d.members.find((m) => m.id === id)?.display_name ?? null;
  const out = new Map<string, CardStats>();
  for (const m of d.members.filter((x) => x.league_id === leagueId)) {
    const mine = rows.filter((p) => p.member_id === m.id);
    const won = mine.filter((p) => winner.get(p.match_id) === p.side);
    const close = mine.filter((p) => {
      const all = byMatch.get(p.match_id) ?? [];
      const avg = (side: boolean) => { const xs = all.filter((x) => (x.side === p.side) === side).map((x) => x.rating_before); return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length); };
      return Math.abs(avg(true) - avg(false)) <= 25;
    });
    let run = 0, best = 0;
    mine.forEach((p) => { run = winner.get(p.match_id) === p.side ? run + 1 : 0; best = Math.max(best, run); });
    const opp = new Map<string, number>();
    mine.forEach((p) => (byMatch.get(p.match_id) ?? []).filter((x) => x.side !== p.side).forEach((x) => opp.set(x.member_id, (opp.get(x.member_id) ?? 0) + 1)));
    const rival = [...opp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const rate = (w: number, n: number) => Math.round(((w + 2) / (n + 4)) * 100); // gentle start, never 0 or 100 on a few games
    const last5 = mine.slice(-5);
    out.set(m.id, {
      ovr: Math.max(64, Math.min(94, Math.round(74 + (m.rating - 1000) / 10))), rating: m.rating, played: mine.length,
      win: rate(won.length, mine.length), clutch: rate(close.filter((p) => winner.get(p.match_id) === p.side).length, close.length),
      form: last5.length ? Math.round((last5.filter((p) => winner.get(p.match_id) === p.side).length / last5.length) * 100) : 50,
      streak: best, rival: rival ? name(rival) : null,
    });
  }
  return out;
}

/* ---------- card views ---------- */
export type CardView = {
  key: string; rarity: Rarity; set: number | null; memberId: string; name: string; colour: PlayerColour; jersey: number; gone: boolean;
  special: SpecialType | null; label: string; note: string | null; ovr: number; stats: CardStats | null; count: number;
  serial: number | null; oneOfOne: boolean; tradeable: boolean; redeem: number;
};
export function viewOf(d: DB, leagueId: string, key: string, count: number, stats = statsOf(d, leagueId)): CardView {
  const p = parseKey(key);
  const m = d.members.find((x) => x.id === p.member && x.league_id === leagueId);
  const st = stats.get(p.member) ?? null;
  const sp = p.special ? cardStore(d).specials[`${leagueId}|${key}`] : null;
  const gone = !m || !!m.status;
  return {
    key, rarity: p.rarity, set: p.special ? null : p.set, memberId: p.member, name: gone && !m ? 'Deleted player' : m?.display_name ?? 'Player',
    colour: m?.colour ?? 'ink', jersey: m?.jersey ?? 0, gone, special: p.special ? p.type : null,
    label: p.special ? SPECIAL[p.type].label : p.rarity === 'mythic' ? 'Mythic, 1 of 1' : RARITY_LABEL[p.rarity],
    note: sp?.note ?? null, ovr: st ? ovrFor(st, p.rarity) : 64, stats: st, count,
    serial: cardStore(d).serials[`${leagueId}|${key}`] ?? null, oneOfOne: p.rarity === 'mythic',
    tradeable: !p.special && p.rarity !== 'mythic', redeem: p.special ? 0 : REDEEM[p.rarity],
  };
}

/* ---------- granting ---------- */
export function grantPack(d: DB, leagueId: string, memberId: string, kind: PackKind, reason: string, ref: string) {
  const l = leagueOf(d, leagueId);
  if (!l) return null;
  const pack: Pack = { id: uid(), league_id: leagueId, member_id: memberId, kind, set: currentSet(l), reason, ref, at: new Date().toISOString() };
  cardStore(d).packs.push(pack);
  return pack;
}
const hasPackRef = (d: DB, ref: string, memberId: string) => cardStore(d).packs.some((p) => p.ref === ref && p.member_id === memberId);

function addCard(d: DB, leagueId: string, memberId: string, key: string) {
  const s = cardStore(d), own = ownedOf(d, leagueId, memberId);
  const fresh = !own[key];
  own[key] = (own[key] ?? 0) + 1;
  s.serials[`${leagueId}|${key}`] = (s.serials[`${leagueId}|${key}`] ?? 0) + 1;
  if (parseKey(key).rarity === 'mythic') s.mythics[`${leagueId}|${key}`] ??= memberId;
  return fresh;
}

// Pays the set reward once, tells the league. Returns the place in the league when it just completed.
function checkSet(d: DB, leagueId: string, memberId: string, set: number) {
  const s = cardStore(d), own = ownedOf(d, leagueId, memberId);
  const keys = setKeys(d, leagueId, set);
  const ref = `cardset:${leagueId}:${set}`;
  if (!keys.length || keys.some((k) => !own[k]) || paid(d, ref, memberId)) return null;
  const list = (s.finished[`${leagueId}|${set}`] ??= []);
  if (!list.includes(memberId)) list.push(memberId);
  credit(d, { league_id: leagueId, member_id: memberId, amount: SET_REWARD, reason: 'cards', label: `Season ${set} album complete`, ref, href: '/cards/album' });
  const me = d.members.find((m) => m.id === memberId);
  for (const m of collectors(d, leagueId).filter((x) => x.user_id && x.id !== memberId)) {
    notify(d, { league_id: leagueId, member_id: m.id, kind: 'cards.set', title: `${me?.display_name ?? 'Someone'} completed the Season ${set} album`, body: 'Every card of the season, Common to Legendary.', href: '/cards/album' });
  }
  return list.length;
}

export type Opened = { pack: Pack; cards: CardView[]; fresh: string[]; pity: number; setDone: { set: number; place: number } | null };
function openIn(d: DB, pack: Pack): Opened {
  const s = cardStore(d);
  const pk = mk(pack.league_id, pack.member_id);
  const sets = PACK[pack.kind].retro ? Array.from({ length: Math.max(1, pack.set - 1) }, (_, i) => i + 1) : [pack.set];
  const members = collectors(d, pack.league_id).map((m) => m.id);
  const rolled = rollPack({ id: pack.id, kind: pack.kind, sets, members, pity: s.pity[pk] ?? 0,
    takenMythic: (set, m) => !!s.mythics[`${pack.league_id}|${playerKey(set, m, 'mythic')}`] });
  const keys = rolled.map((c) => playerKey(c.set, c.member, c.rarity));
  const fresh = keys.filter((k) => addCard(d, pack.league_id, pack.member_id, k));
  s.pity[pk] = rolled.some((c) => rank(c.rarity) >= rank('legendary')) ? 0 : (s.pity[pk] ?? 0) + 1;
  Object.assign(pack, { opened_at: new Date().toISOString(), cards: keys, fresh, pity: s.pity[pk] });
  const me = d.members.find((m) => m.id === pack.member_id);
  for (const c of rolled.filter((x) => rank(x.rarity) >= rank('legendary'))) {
    const who = d.members.find((m) => m.id === c.member)?.display_name ?? 'someone';
    for (const m of collectors(d, pack.league_id).filter((x) => x.user_id && x.id !== pack.member_id)) {
      notify(d, { league_id: pack.league_id, member_id: m.id, kind: 'cards.pull', title: `${me?.display_name ?? 'Someone'} pulled ${who} ${RARITY_LABEL[c.rarity]}`, body: c.rarity === 'mythic' ? 'The only one in the league this season.' : 'A rare one.', href: '/cards' });
    }
  }
  let setDone: Opened['setDone'] = null;
  for (const set of new Set(rolled.map((c) => c.set))) { const place = checkSet(d, pack.league_id, pack.member_id, set); if (place && !setDone) setDone = { set, place }; }
  const stats = statsOf(d, pack.league_id);
  const own = ownedOf(d, pack.league_id, pack.member_id);
  return { pack, cards: keys.map((k) => viewOf(d, pack.league_id, k, own[k] ?? 0, stats)), fresh, pity: s.pity[pk], setDone };
}

/* ---------- lazy sync: free packs, specials, bots ---------- */

function grantSpecial(d: DB, leagueId: string, type: SpecialType, memberId: string, ref: string, note: string, at: string) {
  const s = cardStore(d), key = specialKey(type, memberId, ref), sk = `${leagueId}|${key}`;
  if (s.specials[sk]) return false;
  s.specials[sk] = { type, member: memberId, note, at };
  addCard(d, leagueId, memberId, key);
  if (d.members.find((m) => m.id === memberId)?.user_id) {
    notify(d, { league_id: leagueId, member_id: memberId, kind: 'cards.special', title: `New ${SPECIAL[type].label} card`, body: `${note}. Special editions are never in packs.`, href: '/cards/album' });
  }
  return true;
}

export function syncCards(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !cardsOn(l)) return false;
  const s = cardStore(d);
  const sig = () => JSON.stringify(s).length + (d.notices?.length ?? 0);
  const before = sig();
  const coins = syncCoins(d, leagueId, now);
  const set = currentSet(l, now);
  const week = weekOf(now, tzOf(l)).key;
  for (const m of collectors(d, leagueId)) {
    const k = mk(leagueId, m.id);
    if (!s.welcomed[k]) {
      s.welcomed[k] = true;
      grantPack(d, leagueId, m.id, 'player', 'Your first pack is on us', `welcome:${leagueId}`);
      // Bots catch up on the weekly packs since the league started, so the demo has collections to trade with.
      if (!m.user_id) for (let i = Math.min(8, Math.floor((now - new Date(l.created_at).getTime()) / (7 * 24 * H))); i > 0; i--) grantPack(d, leagueId, m.id, 'player', 'Your weekly pack', `catchup:${leagueId}:${i}`);
    }
    if (s.weekly[k] !== week) {
      s.weekly[k] = week;
      grantPack(d, leagueId, m.id, 'player', 'Your weekly pack', `weekly:${leagueId}:${week}`);
      if (m.user_id) notify(d, { league_id: leagueId, member_id: m.id, kind: 'cards.weekly', title: 'Your weekly pack is ready', body: '3 cards from this season.', href: '/cards' });
    }
  }
  // Specials: the #1 of the ladder once per set, cup champions, season champions.
  const ranked = collectors(d, leagueId).filter((m) => m.wins + m.losses >= PROVISIONAL).sort((a, b) => b.rating - a.rating);
  if (ranked[0]) grantSpecial(d, leagueId, 'crown', ranked[0].id, `s${set}`, `Number 1 in season ${set}`, new Date(now).toISOString());
  for (const c of (d.cups ?? []).filter((x) => x.league_id === leagueId && x.status === 'done' && x.champion_id)) {
    if (grantSpecial(d, leagueId, 'cup', c.champion_id!, c.id, `Week ${c.week_no} cup`, c.final_at)) {
      if (!hasPackRef(d, `cup:${c.id}`, c.champion_id!)) grantPack(d, leagueId, c.champion_id!, 'gold', `Won the week ${c.week_no} cup`, `cup:${c.id}`);
    }
  }
  if (isOn(l, 'seasons') && set > 1 && (s.seasonsDone[leagueId] ?? 0) < set - 1) {
    for (const season of computeSeasons(d, leagueId, now).filter((x) => x.closed && x.n > (s.seasonsDone[leagueId] ?? 0))) {
      const top = season.rows.find((r) => r.rank === 1 && r.played > 0);
      if (top) grantSpecial(d, leagueId, 'season', top.id, `s${season.n}`, `Season ${season.n} champion`, season.end ?? new Date(now).toISOString());
    }
    s.seasonsDone[leagueId] = set - 1;
  }
  // Bots open their packs and answer trades after a short, human delay.
  for (const p of s.packs.filter((x) => x.league_id === leagueId && !x.opened_at)) {
    const m = d.members.find((x) => x.id === p.member_id);
    if (m && !m.user_id) openIn(d, p);
  }
  for (const t of s.trades.filter((x) => x.league_id === leagueId && x.status === 'pending')) {
    if (now - new Date(t.at).getTime() > TRADE_HOURS * H) { finishTrade(d, t, 'expired'); continue; }
    const to = d.members.find((m) => m.id === t.to);
    if (to && !to.user_id && now - new Date(t.at).getTime() > BOT_REPLY) {
      const value = (keys: string[]) => keys.reduce((sum, k) => sum + REDEEM[parseKey(k).rarity], 0);
      const own = ownedOf(d, leagueId, t.to);
      const wants = t.give.some((k) => !own[k]);
      if (value(t.give) >= value(t.want) && wants && validTrade(d, t) === null) acceptIn(d, t); else finishTrade(d, t, 'declined');
    }
  }
  return coins || sig() !== before;
}

async function fresh(leagueId: string) {
  const d = await db();
  if (syncCards(d, leagueId)) await save();
  return d;
}
const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
function mustMe(d: DB, leagueId: string, user: User) {
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || !cardsOn(l)) throw new ApiError('cards off');
  if (me.guest) throw new ApiError('guests do not collect');
  return { l, me };
}

/* ---------- reads ---------- */
export type Spare = { card: CardView; spare: number };
export type Hub = {
  on: boolean; guest: boolean; memberId: string | null; set: number; packs: Pack[]; pity: number; got: number; total: number; recent: CardView[];
  spares: number; spareValue: number; incoming: number; incomingFrom: string | null; balance: number; sets: number[];
};
export async function cardsHub(user: User, leagueId: string): Promise<Hub> {
  await wait(80);
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  const empty: Hub = { on: false, guest: false, memberId: me?.id ?? null, set: 1, packs: [], pity: 0, got: 0, total: 0, recent: [], spares: 0, spareValue: 0, incoming: 0, incomingFrom: null, balance: 0, sets: [1] };
  if (!l || !me || !cardsOn(l)) return empty;
  if (me.guest) return { ...empty, on: true, guest: true };
  if (syncCards(d, leagueId)) await save();
  const s = cardStore(d), set = currentSet(l), own = ownedOf(d, leagueId, me.id), stats = statsOf(d, leagueId);
  const keys = setKeys(d, leagueId, set);
  const opened = s.packs.filter((p) => p.league_id === leagueId && p.member_id === me.id && p.opened_at).sort((a, b) => b.opened_at!.localeCompare(a.opened_at!));
  const recentKeys = [...new Set(opened.flatMap((p) => [...(p.cards ?? [])].reverse()))].slice(0, 12);
  const sp = sparesIn(d, leagueId, me.id, stats);
  const incoming = s.trades.filter((t) => t.league_id === leagueId && t.to === me.id && t.status === 'pending');
  return {
    on: true, guest: false, memberId: me.id, set,
    packs: s.packs.filter((p) => p.league_id === leagueId && p.member_id === me.id && !p.opened_at).sort((a, b) => a.at.localeCompare(b.at)),
    pity: s.pity[mk(leagueId, me.id)] ?? 0, got: keys.filter((k) => own[k]).length, total: keys.length,
    recent: recentKeys.map((k) => viewOf(d, leagueId, k, own[k] ?? 0, stats)),
    spares: sp.reduce((n, x) => n + x.spare, 0), spareValue: sp.reduce((n, x) => n + x.spare * x.card.redeem, 0),
    incoming: incoming.length, incomingFrom: incoming[0] ? d.members.find((m) => m.id === incoming[0].from)?.display_name ?? null : null,
    balance: balanceOf(d, leagueId, me.id), sets: Array.from({ length: set }, (_, i) => i + 1),
  };
}

function sparesIn(d: DB, leagueId: string, memberId: string, stats = statsOf(d, leagueId)): Spare[] {
  const own = ownedOf(d, leagueId, memberId);
  return Object.entries(own).filter(([k, n]) => n > 1 && !parseKey(k).special)
    .map(([k, n]) => ({ card: viewOf(d, leagueId, k, n, stats), spare: n - 1 }))
    .sort((a, b) => rank(b.card.rarity) - rank(a.card.rarity) || a.card.name.localeCompare(b.card.name));
}

export type AlbumSlot = { key: string; card: CardView; got: boolean; no: number };
// G8.1: a set's full list (missing cards too), or the specials. Anyone may look at anyone's album.
export async function album(leagueId: string, memberId: string, set: number | 'specials') {
  const d = await fresh(leagueId);
  const own = ownedOf(d, leagueId, memberId), stats = statsOf(d, leagueId);
  const l = leagueOf(d, leagueId)!;
  if (set === 'specials') {
    const keys = Object.keys(own).filter((k) => parseKey(k).special);
    return { slots: keys.map((k, i) => ({ key: k, card: viewOf(d, leagueId, k, own[k], stats), got: true, no: i + 1 })), got: keys.length, total: keys.length, retro: false };
  }
  const keys = [...setKeys(d, leagueId, set), ...collectors(d, leagueId).map((m) => playerKey(set, m.id, 'mythic')).filter((k) => own[k])];
  const slots = keys.map((k, i) => ({ key: k, card: viewOf(d, leagueId, k, own[k] ?? 0, stats), got: !!own[k], no: i + 1 }));
  const base = slots.filter((x) => x.card.rarity !== 'mythic');
  return { slots, got: base.filter((x) => x.got).length, total: base.length, retro: set < currentSet(l) };
}

export async function cardDetail(leagueId: string, key: string, memberId: string | null) {
  const d = await fresh(leagueId);
  const own = memberId ? ownedOf(d, leagueId, memberId) : {};
  const owners = collectors(d, leagueId).filter((m) => (ownedOf(d, leagueId, m.id)[key] ?? 0) > 0).length;
  return { card: viewOf(d, leagueId, key, own[key] ?? 0, statsOf(d, leagueId)), owners, spare: Math.max(0, (own[key] ?? 0) - 1) };
}

export async function spares(user: User, leagueId: string) {
  const d = await fresh(leagueId);
  const { me } = mustMe(d, leagueId, user);
  return sparesIn(d, leagueId, me.id);
}

export async function packInfo(user: User, leagueId: string) {
  const d = await fresh(leagueId);
  const { me } = mustMe(d, leagueId, user);
  return { pity: cardStore(d).pity[mk(leagueId, me.id)] ?? 0 };
}

/* ---------- writes ---------- */
export async function openPack(user: User, leagueId: string, packId: string): Promise<Opened> {
  await wait(250);
  const d = await db();
  const { me } = mustMe(d, leagueId, user);
  const p = cardStore(d).packs.find((x) => x.id === packId && x.member_id === me.id && x.league_id === leagueId);
  if (!p || p.opened_at) throw new ApiError('pack not found');
  const out = openIn(d, p);
  await save();
  return out;
}
export async function packById(user: User, leagueId: string, id: string) {
  const d = await db();
  const me = meIn(d, leagueId, user);
  return cardStore(d).packs.find((p) => p.id === id && p.league_id === leagueId && p.member_id === me?.id && !p.opened_at) ?? null;
}
export async function nextPack(user: User, leagueId: string) {
  const d = await db();
  const me = meIn(d, leagueId, user);
  return me ? cardStore(d).packs.filter((p) => p.league_id === leagueId && p.member_id === me.id && !p.opened_at).sort((a, b) => a.at.localeCompare(b.at))[0] ?? null : null;
}

// G8.4.1 Redeem: spares only (one copy always stays), player cards only. Specials can never be sold.
export async function redeem(user: User, leagueId: string, items: { key: string; n: number }[]) {
  await wait(200);
  const d = await db();
  const { me } = mustMe(d, leagueId, user);
  const own = ownedOf(d, leagueId, me.id);
  let coins = 0, cards = 0;
  for (const { key, n } of items) {
    const p = parseKey(key);
    if (p.special || p.rarity === 'mythic') throw new ApiError('special cards cannot be redeemed');
    if (n < 1 || (own[key] ?? 0) - n < 1) throw new ApiError('not a spare');
  }
  for (const { key, n } of items) { own[key] -= n; coins += REDEEM[parseKey(key).rarity] * n; cards += n; }
  credit(d, { league_id: leagueId, member_id: me.id, amount: coins, reason: 'cards', label: `Redeemed ${cards} ${cards === 1 ? 'spare' : 'spares'}`, ref: `redeem:${uid()}`, href: '/cards/spares' });
  await save();
  return coins;
}

// G8.4.1 Upgrade: 3 spares of one rarity from one set for 1 random card a step up from that set, equal chance per player.
export function upgradeTargets(d: DB, leagueId: string, set: number, from: Rarity) {
  const to = nextRarity(from);
  return to ? collectors(d, leagueId).map((m) => playerKey(set, m.id, to)) : [];
}
export async function upgradeOptions(leagueId: string, set: number, from: Rarity) {
  const d = await db();
  const stats = statsOf(d, leagueId);
  return upgradeTargets(d, leagueId, set, from).map((k) => viewOf(d, leagueId, k, 0, stats));
}
export async function upgrade(user: User, leagueId: string, keys: string[]) {
  await wait(250);
  const d = await db();
  const { me } = mustMe(d, leagueId, user);
  const own = ownedOf(d, leagueId, me.id);
  const parsed = keys.map(parseKey);
  if (keys.length !== UPGRADE_COST) throw new ApiError('pick 3');
  const first = parsed[0];
  if (first.special || parsed.some((p) => p.special || p.rarity !== first.rarity || (!p.special && p.set !== first.set))) throw new ApiError('same rarity and season');
  const use = new Map<string, number>();
  keys.forEach((k) => use.set(k, (use.get(k) ?? 0) + 1));
  for (const [k, n] of use) if ((own[k] ?? 0) - n < 1) throw new ApiError('not a spare');
  const targets = upgradeTargets(d, leagueId, first.set, first.rarity);
  if (!targets.length) throw new ApiError('top rarity');
  for (const [k, n] of use) own[k] -= n;
  const got = targets[Math.floor(seeded(`upgrade:${uid()}`)() * targets.length)];
  addCard(d, leagueId, me.id, got);
  const place = checkSet(d, leagueId, me.id, first.set);
  await save();
  return { card: viewOf(d, leagueId, got, own[got]), setDone: place ? { set: first.set, place } : null };
}

/* ---------- trades: card for card only, never coins ---------- */
function validTrade(d: DB, t: Pick<Trade, 'league_id' | 'from' | 'to' | 'give' | 'want'>): string | null {
  if (!t.give.length && !t.want.length) return 'Pick at least one card';
  if (t.give.length > TRADE_MAX || t.want.length > TRADE_MAX) return `Up to ${TRADE_MAX} cards each side`;
  if ([...t.give, ...t.want].some((k) => { const p = parseKey(k); return p.special || p.rarity === 'mythic'; })) return 'Special editions can’t be traded';
  const has = (who: string, keys: string[]) => { const own = ownedOf(d, t.league_id, who); const use = new Map<string, number>(); keys.forEach((k) => use.set(k, (use.get(k) ?? 0) + 1)); return [...use].every(([k, n]) => (own[k] ?? 0) >= n); };
  if (!has(t.from, t.give)) return 'You no longer have this card';
  if (!has(t.to, t.want)) return 'They no longer have this card';
  return null;
}
function finishTrade(d: DB, t: Trade, status: Trade['status'], reason?: string) {
  t.status = status; t.done_at = new Date().toISOString(); if (reason) t.reason = reason;
  const from = d.members.find((m) => m.id === t.from), to = d.members.find((m) => m.id === t.to);
  if (from?.user_id && (status === 'accepted' || status === 'declined')) {
    notify(d, { league_id: t.league_id, member_id: t.from, kind: 'cards.trade', title: status === 'accepted' ? `${to?.display_name ?? 'They'} accepted your trade` : `${to?.display_name ?? 'They'} passed on your trade`, body: status === 'accepted' ? 'The cards are in your album.' : 'Your cards stay with you.', href: `/cards/trade?id=${t.id}` });
  }
}
function acceptIn(d: DB, t: Trade) {
  const a = ownedOf(d, t.league_id, t.from), b = ownedOf(d, t.league_id, t.to);
  t.give.forEach((k) => { a[k] -= 1; b[k] = (b[k] ?? 0) + 1; });
  t.want.forEach((k) => { b[k] -= 1; a[k] = (a[k] ?? 0) + 1; });
  finishTrade(d, t, 'accepted');
  const sets = new Set([...t.give, ...t.want].map((k) => (parseKey(k) as { set: number }).set));
  sets.forEach((s) => { checkSet(d, t.league_id, t.from, s); checkSet(d, t.league_id, t.to, s); });
}

export type TradeView = Trade & { fromName: string; toName: string; giveCards: CardView[]; wantCards: CardView[]; problem: string | null; mine: boolean };
function tradeView(d: DB, t: Trade, meId: string, stats = statsOf(d, t.league_id)): TradeView {
  const name = (id: string) => d.members.find((m) => m.id === id)?.display_name ?? 'Someone';
  return { ...t, fromName: name(t.from), toName: name(t.to), mine: t.from === meId,
    giveCards: t.give.map((k) => viewOf(d, t.league_id, k, 0, stats)), wantCards: t.want.map((k) => viewOf(d, t.league_id, k, 0, stats)),
    problem: t.status === 'pending' ? validTrade(d, t) : null };
}
export async function trades(user: User, leagueId: string) {
  const d = await fresh(leagueId);
  const { me } = mustMe(d, leagueId, user);
  const stats = statsOf(d, leagueId);
  const all = cardStore(d).trades.filter((t) => t.league_id === leagueId && (t.from === me.id || t.to === me.id)).sort((a, b) => b.at.localeCompare(a.at)).map((t) => tradeView(d, t, me.id, stats));
  return { incoming: all.filter((t) => t.status === 'pending' && t.to === me.id), sent: all.filter((t) => t.status === 'pending' && t.from === me.id), history: all.filter((t) => t.status !== 'pending') };
}
export async function getTrade(user: User, leagueId: string, id: string) {
  const d = await fresh(leagueId);
  const { me } = mustMe(d, leagueId, user);
  const t = cardStore(d).trades.find((x) => x.id === id && x.league_id === leagueId && (x.from === me.id || x.to === me.id));
  return t ? tradeView(d, t, me.id) : null;
}
// G8.6.1: own tradeable cards (spares first, with what the partner needs), and the partner's spares (what I need first).
export async function tradeOptions(user: User, leagueId: string, partnerId: string) {
  const d = await fresh(leagueId);
  const { me } = mustMe(d, leagueId, user);
  const stats = statsOf(d, leagueId);
  const mine = ownedOf(d, leagueId, me.id), theirs = ownedOf(d, leagueId, partnerId);
  const list = (own: Record<string, number>, other: Record<string, number>, sparesOnly: boolean) => Object.entries(own)
    .filter(([k, n]) => n > (sparesOnly ? 1 : 0) && !parseKey(k).special && parseKey(k).rarity !== 'mythic')
    .map(([k, n]) => ({ card: viewOf(d, leagueId, k, n, stats), spare: n - 1, needed: !other[k] }))
    .sort((a, b) => Number(b.needed) - Number(a.needed) || Number(b.spare > 0) - Number(a.spare > 0) || rank(b.card.rarity) - rank(a.card.rarity));
  return { give: list(mine, theirs, false), get: list(theirs, mine, true) };
}
export async function sendTrade(user: User, leagueId: string, p: { to: string; give: string[]; want: string[]; note?: string }) {
  await wait(200);
  const d = await db();
  const { me } = mustMe(d, leagueId, user);
  const s = cardStore(d);
  const to = collectors(d, leagueId).find((m) => m.id === p.to);
  if (!to || to.id === me.id) throw new ApiError('pick a teammate');
  if (s.trades.filter((t) => t.league_id === leagueId && t.from === me.id && t.status === 'pending').length >= TRADE_OPEN) throw new ApiError(`Up to ${TRADE_OPEN} open offers at a time`);
  const t: Trade = { id: uid(), league_id: leagueId, from: me.id, to: to.id, give: p.give, want: p.want, note: (p.note ?? '').trim().slice(0, 140), status: 'pending', at: new Date().toISOString() };
  const problem = validTrade(d, t);
  if (problem) throw new ApiError(problem);
  s.trades.push(t);
  if (to.user_id) notify(d, { league_id: leagueId, member_id: to.id, kind: 'cards.trade', title: `${me.display_name} sent you a trade`, body: `${t.give.length} for ${t.want.length}${t.note ? `. ${t.note}` : ''}`, href: `/cards/trade?id=${t.id}` });
  await save();
  return t.id;
}
export async function answerTrade(user: User, leagueId: string, id: string, action: 'accept' | 'decline' | 'cancel') {
  await wait(200);
  const d = await db();
  const { me } = mustMe(d, leagueId, user);
  const t = cardStore(d).trades.find((x) => x.id === id && x.league_id === leagueId);
  if (!t || t.status !== 'pending') throw new ApiError('This offer is closed');
  if (action === 'cancel') { if (t.from !== me.id) throw new ApiError('not yours'); finishTrade(d, t, 'cancelled'); }
  else {
    if (t.to !== me.id) throw new ApiError('not for you');
    if (action === 'decline') finishTrade(d, t, 'declined');
    else { const problem = validTrade(d, t); if (problem) { finishTrade(d, t, 'expired', problem); await save(); throw new ApiError(problem); } acceptIn(d, t); }
  }
  await save();
}

// Shop and pass helpers (shop.ts, pass.ts) use these inside their own writes.
export function packsBoughtToday(d: DB, leagueId: string, memberId: string, now = Date.now()) {
  const day = new Date(now).toDateString();
  return cardStore(d).packs.filter((p) => p.league_id === leagueId && p.member_id === memberId && p.ref.startsWith('shop:') && new Date(p.at).toDateString() === day).length;
}
export const retroOpen = (l: StoredLeague) => currentSet(l) > 1;
