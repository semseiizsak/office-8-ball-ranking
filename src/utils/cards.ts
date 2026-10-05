import { Challenge, MatchRecord, Player } from '../types';
import { dayKeyOf } from './daily';
import { mondayOf } from './tournament';

/**
 * Player cards: FIFA style, collected from packs and traded between players.
 *
 * Every card is a stored instance with an owner, so it can change hands. What
 * a pack holds is fixed by a seed on the pack's id when it is opened, so
 * refreshing cannot reroll it. Packs are capped at two a week: a free weekly
 * pack, plus one earned pack for the first of five wins that week, a new
 * achievement tier that week, or three matches of the day in a row. The cup
 * champion also gets three champion packs, the season champion five reward packs. Unopened packs expire with their week.
 *
 * Special editions (crown, cup, team of the week, clown, moment, rivalry) never
 * come out of a pack: they go to the player who earned them, once per event.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** Chance per card slot; they add up to 1. */
export const ODDS: Record<Rarity, number> = {
  common: 0.62,
  uncommon: 0.25,
  rare: 0.095,
  epic: 0.03,
  legendary: 0.0045,
  mythic: 0.0005,
};

/** Chips a duplicate turns into. A mythic can never be a duplicate. */
export const DUPLICATE_CHIPS: Record<Rarity, number> = { common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 200, mythic: 0 };

export const CARDS_PER_PACK = 3;
/** Packs opened without a legendary before the next one is guaranteed one. */
export const LEGENDARY_PITY = 30;

/** Themed cards: only ever given for one special achievement each. */
export type ThemedType = 'giant' | 'onfire' | 'ironman' | 'grinder' | 'dynasty' | 'oracle' | 'jackpot' | 'kingslayer' | 'underdog' | 'sniper' | 'sweep' | 'highroller';
export type CardType = 'player' | 'crown' | 'cup' | 'season' | 'totw' | 'clown' | 'moment' | 'rivalry' | ThemedType;

/** The fixed rarity of each special edition. */
export const SPECIAL_RARITY: Record<Exclude<CardType, 'player'>, Rarity> = {
  crown: 'epic',
  cup: 'epic',
  season: 'legendary',
  totw: 'rare',
  clown: 'rare',
  moment: 'rare',
  rivalry: 'epic',
  giant: 'epic',
  onfire: 'epic',
  ironman: 'epic',
  grinder: 'rare',
  dynasty: 'legendary',
  oracle: 'epic',
  jackpot: 'epic',
  kingslayer: 'epic',
  underdog: 'rare',
  sniper: 'rare',
  sweep: 'epic',
  highroller: 'legendary',
};

export const TYPE_LABEL: Record<CardType, string> = {
  player: 'Player',
  crown: 'Crown holder',
  cup: 'Cup champion',
  season: 'Season champion',
  totw: 'Team of the week',
  clown: 'Wall of shame',
  moment: 'Moment',
  rivalry: 'Rivalry',
  giant: 'Giant slayer',
  onfire: 'On fire',
  ironman: 'Iron man',
  grinder: 'Daily grinder',
  dynasty: 'Dynasty',
  oracle: 'Oracle',
  jackpot: 'Jackpot',
  kingslayer: 'Kingslayer',
  underdog: 'Underdog',
  sniper: 'Hot hand',
  sweep: 'Clean sweep',
  highroller: 'High roller',
};

export interface CardStats {
  ovr: number;
  WIN: number;
  CLU: number;
  FRM: number;
  BRK: number;
  CAL: number;
  GRT: number;
}

export interface Card {
  id: string;
  ownerId: string;
  /** Whose face is on it. */
  playerId: string;
  /** The second player on a rivalry card. */
  otherId?: string;
  type: CardType;
  rarity: Rarity;
  stats: CardStats;
  /** Printed number of this design: No 7 is the seventh ever pulled. */
  serial: number;
  /** What it was for, on special editions: "8 on the break, 24 Sep". */
  note?: string;
  /** Season label printed on the card. */
  season: string;
  /** Every season is its own set: serials, mythics and the album start over. */
  seasonId: string;
  /** The subject's profile photo when it was pulled, so a new photo only shows on new cards. */
  photoId?: string;
  /** The photo itself, filled in on the client from the photo store. */
  photo?: string;
  source: 'pack' | 'award' | 'trade' | 'craft';
  packId?: string;
  createdAt: number;
}

export type PackKind = 'weekly' | 'earned' | 'champion' | 'reward' | 'bought';

/**
 * The pack shop, paid in coins. Priced well above what a pack cashes in for
 * (about 32 coins on average), so buying is for collecting, never for profit,
 * and a premium pack takes a few weeks of good calls to save up for.
 */
export type ShopTier = 'standard' | 'premium' | 'retro' | 'player';
export const SHOP_PRICE: Record<ShopTier, number> = { standard: 400, premium: 1200, retro: 500, player: 600 };
export const SHOP_LABEL: Record<ShopTier, string> = { standard: 'Season pack', premium: 'Premium pack', retro: 'Retro pack', player: 'Player pack' };

/** The day's player pack: one player for everyone, drawn by the day. All three cards are them. */
export const dailyDealPlayer = (playerIds: string[], dayKey: string) => {
  const ids = [...playerIds].sort();
  return ids.length ? ids[Math.floor(seeded(`deal-${dayKey}`)() * ids.length)] : null;
};

/** A full set of one player in a season, common to legendary, pays once. */
export const SET_REWARD_COINS = 250;
export const SET_RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Three spares of one rarity upgrade to one card a step up; a mythic is never made. */
export const UPGRADE_COST = 3;
export const nextRarity = (rarity: Rarity): Rarity | null =>
  rarity === 'legendary' || rarity === 'mythic' ? null : RARITIES[RARITIES.indexOf(rarity) + 1];

export interface Pack {
  id: string;
  ownerId: string;
  kind: PackKind;
  /** The Monday of the week it belongs to, YYYY-MM-DD. */
  week: string;
  /** Why an earned or reward pack was given. */
  reason?: string;
  /** A reward pack's guarantee: its best card is at least this. */
  minRarity?: Rarity;
  createdAt: number;
  openedAt: number | null;
  cardIds: string[];
  /** Duplicates turned into chips when it was opened. */
  duplicateChips: number;
  /** A bought pack: the season its cards are printed in, what it cost and which shelf. */
  seasonId?: string;
  price?: number;
  tier?: ShopTier;
  /** A player pack: the one player all three cards show. */
  subjectId?: string;
}

export interface Collector {
  id: string;
  /** How many of each design this player holds, by design key. */
  counts: Record<string, number>;
  /** Packs opened since the last legendary. */
  pity: number;
  /** Chips from duplicates, added to their stack. */
  duplicateChips: number;
  /** Coins spent in the pack shop, taken off their stack. */
  spentChips: number;
  /** Coins from rewards such as a completed player set. */
  rewardChips: number;
  opened: number;
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface Trade {
  id: string;
  fromId: string;
  toId: string;
  /** Cards the sender hands over. */
  give: string[];
  /** Cards the sender asks for back; empty for a gift. */
  want: string[];
  note?: string;
  status: TradeStatus;
  createdAt: number;
  respondedAt: number | null;
}

/** A card design: the same player, type and rarity is the same slot in the album. */
export const designKey = (card: Pick<Card, 'type' | 'playerId' | 'rarity' | 'otherId'>) =>
  `${card.type}:${card.playerId}${card.otherId ? `+${card.otherId}` : ''}:${card.rarity}`;

/** The printing key: the same design in a new season is a new print run. */
export const printKey = (seasonId: string, card: Pick<Card, 'type' | 'playerId' | 'rarity' | 'otherId'>) => `${seasonId}|${designKey(card)}`;

/** A short stable id for a photo, so the same photo is stored once. */
export function photoIdOf(data: string): string {
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  return `p${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${data.length.toString(36)}`;
}

export const seeded = (seed: string) => {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
};

/** The week key a moment falls in. */
export const weekKeyOf = (at: number) => dayKeyOf(mondayOf(at).getTime());

const clamp = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

/**
 * The numbers printed on a player's card, from how they actually play.
 * OVR follows Elo: 1000 is 70, every 10 Elo is a point.
 */
export function cardStats(player: Player, matches: MatchRecord[], challenges: Challenge[]): CardStats {
  const mine = matches.filter((m) => m.playerAId === player.id || m.playerBId === player.id).sort((a, b) => a.timestamp - b.timestamp);
  const won = mine.filter((m) => m.winnerId === player.id);
  const eloBefore = (m: MatchRecord, id: string) => (m.playerAId === id ? m.playerAEloBefore : m.playerBEloBefore);
  const close = mine.filter((m) => Math.abs(m.playerAEloBefore - m.playerBEloBefore) <= 25);
  const upsets = won.filter((m) => m.isUpset).length;
  const breaks = won.filter((m) => m.modifiers?.eightOnBreak || m.modifiers?.tableRun).length;
  const last5 = mine.slice(-5);
  const form = last5.reduce((sum, m, i) => sum + (m.winnerId === player.id ? i + 1 : 0), 0) / 15;
  let calls = 0;
  let hits = 0;
  for (const challenge of challenges) {
    if (challenge.status !== 'played' || !challenge.resolvedWinnerId) continue;
    const call = challenge.predictions.find((p) => p.predictorId === player.id);
    if (!call) continue;
    calls++;
    if (call.predictedWinnerId === challenge.resolvedWinnerId) hits++;
  }
  const rate = (w: number, n: number, prior = 0.5) => (w + prior * 4) / (n + 4);
  const underdogWins = won.filter((m) => eloBefore(m, player.id) < eloBefore(m, m.loserId)).length;
  return {
    ovr: clamp(70 + (player.elo - 1000) / 10),
    WIN: clamp(rate(won.length, mine.length) * 100),
    CLU: clamp(rate(close.filter((m) => m.winnerId === player.id).length, close.length) * 100),
    FRM: clamp(last5.length ? form * 100 : 50),
    BRK: clamp(40 + breaks * 8),
    CAL: clamp(rate(hits, calls) * 100),
    GRT: clamp(35 + upsets * 9 + underdogWins * 3 + Math.max(0, player.bestWinStreak - 2) * 4),
  };
}

/** One rarity roll against the odds. */
export function rollRarity(random: () => number): Rarity {
  let roll = random();
  for (const rarity of [...RARITIES].reverse()) {
    if (roll < ODDS[rarity]) return rarity;
    roll -= ODDS[rarity];
  }
  return 'common';
}

const rank = (rarity: Rarity) => RARITIES.indexOf(rarity);

/**
 * What comes out of a pack: three random players (the opener included) at
 * rolled rarities. At least one uncommon or better; a champion pack has an
 * epic or better; pity turns the best card legendary; a mythic already
 * pulled for that player becomes a legendary instead.
 */
export function rollPack(params: {
  packId: string;
  kind: PackKind;
  playerIds: string[];
  pity: number;
  takenMythics: Set<string>;
  minRarity?: Rarity;
}): Array<{ playerId: string; rarity: Rarity }> {
  const random = seeded(`pack-${params.packId}`);
  const ids = [...params.playerIds].sort();
  const slots = Array.from({ length: CARDS_PER_PACK }, () => ({ playerId: ids[Math.floor(random() * ids.length)], rarity: rollRarity(random) }));
  const best = () => slots.reduce((top, slot, i) => (rank(slot.rarity) > rank(slots[top].rarity) ? i : top), 0);
  if (slots.every((slot) => slot.rarity === 'common')) slots[CARDS_PER_PACK - 1].rarity = 'uncommon';
  if (params.kind === 'champion' && rank(slots[best()].rarity) < rank('epic')) slots[best()].rarity = 'epic';
  if (params.minRarity && rank(slots[best()].rarity) < rank(params.minRarity)) slots[best()].rarity = params.minRarity;
  if (params.pity + 1 >= LEGENDARY_PITY && !slots.some((slot) => rank(slot.rarity) >= rank('legendary'))) slots[best()].rarity = 'legendary';
  const mythicsHere = new Set<string>();
  for (const slot of slots) {
    if (slot.rarity !== 'mythic') continue;
    if (params.takenMythics.has(slot.playerId) || mythicsHere.has(slot.playerId)) slot.rarity = 'legendary';
    else mythicsHere.add(slot.playerId);
  }
  return slots;
}

export interface EarnedPack {
  reason: string;
}

/**
 * Whether a player has earned their extra pack this week, and for what: five
 * wins, a new achievement tier, or three matches of the day in a row.
 */
export function earnedPackReason(params: {
  playerId: string;
  matches: MatchRecord[];
  now: number;
  newTierThisWeek: boolean;
  dailyDaysPlayed: string[];
}): EarnedPack | null {
  const from = mondayOf(params.now).getTime();
  const wins = params.matches.filter((m) => m.timestamp >= from && m.winnerId === params.playerId).length;
  if (wins >= 5) return { reason: '5 wins this week' };
  if (params.newTierThisWeek) return { reason: 'A new achievement tier' };
  const days = new Set(params.dailyDaysPlayed.filter((day) => day >= dayKeyOf(from)));
  const sorted = [...days].sort();
  for (let i = 0; i + 2 < sorted.length; i++) {
    const a = new Date(`${sorted[i]}T12:00:00`).getTime();
    const c = new Date(`${sorted[i + 2]}T12:00:00`).getTime();
    if (Math.round((c - a) / 86_400_000) === 2) return { reason: 'Match of the day, 3 days running' };
  }
  return null;
}

/** Progress towards the earned pack, for the Collection tab. */
export const winsThisWeek = (playerId: string, matches: MatchRecord[], now: number) => {
  const from = mondayOf(now).getTime();
  return matches.filter((m) => m.timestamp >= from && m.winnerId === playerId).length;
};

export interface SpecialAward {
  /** Stable per event, so the same event never pays twice. */
  id: string;
  type: Exclude<CardType, 'player'>;
  playerId: string;
  otherId?: string;
  note: string;
}

/**
 * Special editions a player has earned: holding the crown (once per reign),
 * a cup title, a weekly award, landing on the wall of shame (once per trip),
 * 8 on the break or a table run, and a rivalry reaching ten meetings.
 */
export function specialAwards(params: {
  playerId: string;
  matches: MatchRecord[];
  crownHolderId: string | null;
  crownSince: number | null;
  cupTitles: Array<{ week: string }>;
  /** Seasons this player finished first in. */
  seasonTitles?: Array<{ seasonId: string; name: string }>;
  /** Cup cards say which week of the season they were won in. */
  seasonStartedAt?: number;
  weeklyAwards: Array<{ week: string; key: string }>;
  /** Closed seasons this player finished top three in coins. */
  highRollerSeasons?: Array<{ seasonId: string; name: string; rank: number }>;
}): SpecialAward[] {
  const { playerId } = params;
  const out: SpecialAward[] = [];
  const date = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (params.crownHolderId === playerId && params.crownSince !== null) {
    out.push({ id: `crown-${playerId}-${params.crownSince}`, type: 'crown', playerId, note: `Took the crown ${date(params.crownSince)}` });
  }
  for (const title of params.seasonTitles ?? []) out.push({ id: `season-${playerId}-${title.seasonId}`, type: 'season', playerId, note: title.name });
  for (const roller of params.highRollerSeasons ?? []) {
    out.push({ id: `highroller-${playerId}-${roller.seasonId}`, type: 'highroller', playerId, note: `${roller.name}, number ${roller.rank} in coins` });
  }
  for (const cup of params.cupTitles) {
    const n = params.seasonStartedAt ? Math.round((mondayOf(new Date(`${cup.week}T12:00:00`).getTime()).getTime() - mondayOf(params.seasonStartedAt).getTime()) / (7 * 86_400_000)) + 1 : 0;
    out.push({ id: `cup-${playerId}-${cup.week}`, type: 'cup', playerId, note: n >= 1 ? `Week ${n}` : `Weekly cup, week of ${cup.week}` });
  }
  const weeks = new Set(params.weeklyAwards.filter((award) => !['clown', 'ghost', 'freefall', 'butter', 'burner', 'jinx'].includes(award.key)).map((award) => award.week));
  for (const week of weeks) out.push({ id: `totw-${playerId}-${week}`, type: 'totw', playerId, note: `Team of the week, ${week}` });

  const mine = params.matches.filter((m) => m.playerAId === playerId || m.playerBId === playerId).sort((a, b) => a.timestamp - b.timestamp);
  let losing = 0;
  for (const m of mine) {
    if (m.winnerId === playerId) {
      losing = 0;
      if (m.modifiers?.eightOnBreak || m.modifiers?.tableRun) {
        out.push({ id: `moment-${playerId}-${m.id}`, type: 'moment', playerId, note: `${m.modifiers.eightOnBreak ? '8 on the break' : 'Ran the table'}, ${date(m.timestamp)}` });
      }
    } else if (++losing === 3) {
      out.push({ id: `clown-${playerId}-${m.id}`, type: 'clown', playerId, note: `Three in a row, ${date(m.timestamp)}` });
    }
  }
  const meetings = new Map<string, MatchRecord[]>();
  for (const m of mine) {
    const other = m.playerAId === playerId ? m.playerBId : m.playerAId;
    meetings.set(other, [...(meetings.get(other) ?? []), m]);
  }
  for (const [other, list] of meetings) {
    if (list.length < 10) continue;
    const wins = list.filter((m) => m.winnerId === playerId).length;
    out.push({ id: `rivalry-${[playerId, other].sort().join('-')}-${playerId}`, type: 'rivalry', playerId, otherId: other, note: `${list.length} meetings, ${wins} to ${list.length - wins}` });
  }
  return out;
}

/** The album: every player at every rarity, plus the specials that exist. */
export function albumSize(playerCount: number) {
  return playerCount * RARITIES.length;
}
