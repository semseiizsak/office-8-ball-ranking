import { Challenge, MatchRecord, Player } from '../types';

/**
 * Badges and tiered achievements, all derived from what is already stored:
 * matches, challenges and the calls on them. Nothing here is written anywhere,
 * so a corrected or deleted match moves them the same way it moves ratings.
 */

const DAY = 86_400_000;
const DORMANT_GAP = 14 * DAY;
const BOUNTY_CAP = 60;

export interface MatchEntry {
  m: MatchRecord;
  won: boolean;
  gain: number;
  opp: string;
  d: Date;
  group: 'solids' | 'stripes' | null;
  eloAfter: number;
  eloBefore: number;
  oppBefore: number;
  /** The winner already sat top of the ladder. */
  defended: boolean;
  /** The winner took the top spot with this result. */
  took: boolean;
}

export interface BadgeContext {
  player: Player;
  my: MatchEntry[];
  calls: { total: number; hits: number; locks: number; lockHits: number; against: number };
  ducks: number;
  startElo: number;
}

const other = (group: 'solids' | 'stripes') => (group === 'solids' ? 'stripes' : 'solids');

/**
 * Walks every match in order, keeping each player's latest rating, so it can
 * say who sat top of the ladder going into each result.
 */
function crownFlags(matches: MatchRecord[]): Map<string, { defended: boolean; took: boolean }> {
  const elo = new Map<string, number>();
  const flags = new Map<string, { defended: boolean; took: boolean }>();
  const top = () => {
    let best: string | null = null;
    let bestElo = -Infinity;
    for (const [id, value] of elo) if (value > bestElo || (value === bestElo && best !== null && id < best)) { best = id; bestElo = value; }
    return best;
  };
  for (const match of [...matches].sort((a, b) => a.timestamp - b.timestamp)) {
    const before = top();
    elo.set(match.playerAId, match.playerAEloAfter);
    elo.set(match.playerBId, match.playerBEloAfter);
    const after = top();
    flags.set(match.id, { defended: before === match.winnerId, took: after === match.winnerId && before !== match.winnerId });
  }
  return flags;
}

export function buildBadgeContext(
  player: Player,
  matches: MatchRecord[],
  challenges: Challenge[],
  startElo = 1000,
  flags = crownFlags(matches)
): BadgeContext {
  const my = matches
    .filter((match) => match.playerAId === player.id || match.playerBId === player.id)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((match): MatchEntry => {
      const won = match.winnerId === player.id;
      const isA = match.playerAId === player.id;
      const gain = match.eloDelta + match.bountyCollected;
      const flag = flags.get(match.id) ?? { defended: false, took: false };
      return {
        m: match,
        won,
        gain,
        opp: isA ? match.playerBId : match.playerAId,
        d: new Date(match.timestamp),
        group: match.winnerBall ? (won ? match.winnerBall : other(match.winnerBall)) : null,
        eloAfter: isA ? match.playerAEloAfter : match.playerBEloAfter,
        eloBefore: isA ? match.playerAEloBefore : match.playerBEloBefore,
        oppBefore: isA ? match.playerBEloBefore : match.playerAEloBefore,
        defended: flag.defended,
        took: flag.took,
      };
    });

  const calls = { total: 0, hits: 0, locks: 0, lockHits: 0, against: 0 };
  for (const challenge of challenges) {
    if (challenge.status !== 'played' || !challenge.resolvedWinnerId) continue;
    const mine = challenge.predictions.find((prediction) => prediction.predictorId === player.id);
    if (!mine) continue;
    const right = mine.predictedWinnerId === challenge.resolvedWinnerId;
    const same = challenge.predictions.filter((prediction) => prediction.predictedWinnerId === mine.predictedWinnerId).length;
    calls.total++;
    if (right) calls.hits++;
    if (mine.isLock) { calls.locks++; if (right) calls.lockHits++; }
    if (same < challenge.predictions.length - same) calls.against++;
  }

  const ducks = challenges.filter((challenge) => challenge.status === 'declined' && challenge.opponentId === player.id).length;
  return { player, my, calls, ducks, startElo };
}

const runOf = <T,>(items: T[], test: (item: T) => boolean) => {
  let run = 0;
  let best = 0;
  for (const item of items) { run = test(item) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
};

function byDay(my: MatchEntry[]) {
  const out: Record<string, { w: number; l: number; net: number; up: number; opps: Set<string> }> = {};
  for (const x of my) {
    const day = (out[x.d.toDateString()] ??= { w: 0, l: 0, net: 0, up: 0, opps: new Set() });
    if (x.won) day.w++; else day.l++;
    day.net += x.won ? x.gain : -x.gain;
    day.opps.add(x.opp);
    if (x.won && x.m.isUpset) day.up++;
  }
  return out;
}
const byOpp = (my: MatchEntry[]) =>
  my.reduce<Record<string, MatchEntry[]>>((acc, x) => ((acc[x.opp] ??= []).push(x), acc), {});
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface Badge {
  id: string;
  e: string;
  name: string;
  desc: string;
  secret?: boolean;
  test: (c: BadgeContext) => boolean;
}

export const BADGES: Badge[] = [
  { id: 'first', e: '🐣', name: 'First Blood', desc: 'Win your first match.', test: (c) => c.my.some((x) => x.won) },
  { id: 'solid', e: '🟡', name: 'Solid Citizen', desc: 'Win 5 on solids.', test: (c) => c.my.filter((x) => x.won && x.group === 'solids').length >= 5 },
  { id: 'zebra', e: '🦓', name: 'Zebra Crossing', desc: 'Win 5 on stripes.', test: (c) => c.my.filter((x) => x.won && x.group === 'stripes').length >= 5 },
  { id: 'switch', e: '🔀', name: 'Switch Hitter', desc: 'Three wins in a row, switching balls every time.', test: (c) => c.my.some((x, i) => i >= 2 && [x, c.my[i - 1], c.my[i - 2]].every((y) => y.won && y.group) && x.group !== c.my[i - 1].group && c.my[i - 1].group !== c.my[i - 2].group) },
  { id: 'candy', e: '🍭', name: 'Candy Cane', desc: 'Three stripe wins in a row.', test: (c) => runOf(c.my, (x) => x.won && x.group === 'stripes') >= 3 },
  { id: 'brick', e: '🧱', name: 'Brick by Brick', desc: 'Three solid wins in a row.', test: (c) => runOf(c.my, (x) => x.won && x.group === 'solids') >= 3 },
  { id: 'fire', e: '🔥', name: 'On Fire', desc: 'Win 5 in a row.', test: (c) => runOf(c.my, (x) => x.won) >= 5 },
  { id: 'ice', e: '🧊', name: 'Ice Cold', desc: 'Lose 5 in a row. It happens to the best.', test: (c) => runOf(c.my, (x) => !x.won) >= 5 },
  { id: 'david', e: '🪨', name: 'David', desc: 'Beat someone 150 Elo above you.', test: (c) => c.my.some((x) => x.won && x.oppBefore - x.eloBefore >= 150) },
  { id: 'snail', e: '🐌', name: 'Participation Trophy', desc: 'Win and gain 5 points or fewer.', test: (c) => c.my.some((x) => x.won && x.gain <= 5) },
  { id: 'jackpot', e: '💸', name: 'Jackpot', desc: 'Collect a bounty of 30 or more.', test: (c) => c.my.some((x) => x.won && x.m.bountyCollected >= 30) },
  { id: 'crown3', e: '👑', name: 'Heavy Is the Head', desc: 'Defend the crown 3 times.', test: (c) => c.my.filter((x) => x.won && x.defended).length >= 3 },
  { id: 'night', e: '🌙', name: 'Night Shift', desc: 'Play a match after 6:30 pm. Go home.', test: (c) => c.my.some((x) => minutesOfDay(x.d) >= 18 * 60 + 30) },
  { id: 'monday', e: '🥲', name: 'Monday Blues', desc: 'Lose 3 matches on Mondays. It is always a Monday.', test: (c) => c.my.filter((x) => !x.won && x.d.getDay() === 1).length >= 3 },
  { id: 'friday', e: '🍻', name: 'Friday Hero', desc: 'Win on a Friday after 3 pm.', test: (c) => c.my.some((x) => x.won && x.d.getDay() === 5 && x.d.getHours() >= 15) },
  { id: 'marathon', e: '🏃', name: 'Marathon', desc: 'Play 5 matches in one day.', test: (c) => Object.values(byDay(c.my)).some((d) => d.w + d.l >= 5) },
  { id: 'revenge', e: '🪃', name: 'Revenge Served', desc: 'Beat someone the same day they beat you.', test: (c) => { const last: Record<string, MatchEntry> = {}; return c.my.some((x) => { const l = last[x.opp]; const hit = x.won && !!l && !l.won && l.d.toDateString() === x.d.toDateString(); last[x.opp] = x; return hit; }); } },
  { id: 'zombie', e: '🧟', name: 'Back From the Dead', desc: 'Win right after losing 4 in a row.', test: (c) => c.my.some((x, i) => x.won && i >= 4 && c.my.slice(i - 4, i).every((y) => !y.won)) },
  { id: 'frenemies', e: '🤝', name: 'Frenemies', desc: 'Play the same person 10 times.', test: (c) => Object.values(byOpp(c.my)).some((seq) => seq.length >= 10) },
  { id: 'coin', e: '🪙', name: 'Coin Flip', desc: 'Beat and lose to the same person on the same day.', test: (c) => { const k: Record<string, string> = {}; c.my.forEach((x) => { const key = x.opp + x.d.toDateString(); k[key] = (k[key] ?? '') + (x.won ? 'W' : 'L'); }); return Object.values(k).some((v) => v.includes('W') && v.includes('L')); } },
  { id: 'regular', e: '📅', name: 'Regular', desc: 'Play 25 matches.', test: (c) => c.my.length >= 25 },
  { id: 'duck', e: '🦆', name: 'Professional Duck', desc: 'Duck 3 callouts. Quack.', test: (c) => c.ducks >= 3 },
  { id: 'called', e: '🔮', name: 'Called It', desc: 'Get 3 calls right.', test: (c) => c.calls.hits >= 3 },
  { id: 'early', e: '🐦', name: 'Early Bird', desc: 'Play before 9:10 in the morning. Coffee first?', test: (c) => c.my.some((x) => minutesOfDay(x.d) < 9 * 60 + 10) },
  { id: 'taco', e: '🌮', name: 'Taco Tuesday', desc: 'Win 3 matches on Tuesdays.', test: (c) => c.my.filter((x) => x.won && x.d.getDay() === 2).length >= 3 },
  { id: 'perfectday', e: '☀️', name: 'Perfect Day', desc: 'Win 4 in a day without a single loss.', test: (c) => Object.values(byDay(c.my)).some((d) => d.w >= 4 && d.l === 0) },
  { id: 'rainy', e: '🌧️', name: 'Rainy Day', desc: 'Lose 4 in a day without a single win.', test: (c) => Object.values(byDay(c.my)).some((d) => d.l >= 4 && d.w === 0) },
  { id: 'rocket', e: '🚀', name: 'Rocket', desc: 'Gain 50 Elo in one day.', test: (c) => Object.values(byDay(c.my)).some((d) => d.net >= 50) },
  { id: 'freefall', e: '🪂', name: 'Freefall', desc: 'Lose 50 Elo in one day. Pull the cord.', test: (c) => Object.values(byDay(c.my)).some((d) => d.net <= -50) },
  { id: 'variety', e: '🌈', name: 'Variety Pack', desc: 'Play 5 different people in one day.', test: (c) => Object.values(byDay(c.my)).some((d) => d.opps.size >= 5) },
  { id: 'hattrick', e: '🎩', name: 'Hat Trick', desc: 'Beat the same person 3 times in a row.', test: (c) => Object.values(byOpp(c.my)).some((seq) => runOf(seq, (x) => x.won) >= 3) },
  { id: 'kryptonite', e: '🧪', name: 'Kryptonite', desc: 'Lose to the same person 4 times in a row.', test: (c) => Object.values(byOpp(c.my)).some((seq) => runOf(seq, (x) => !x.won) >= 4) },
  { id: 'grudge', e: '🧨', name: 'Grudge Match', desc: 'Play someone 10 times and still be within one win of each other.', test: (c) => Object.values(byOpp(c.my)).some((seq) => seq.length >= 10 && Math.abs(seq.filter((x) => x.won).length * 2 - seq.length) <= 1) },
  { id: 'loyal', e: '💍', name: 'Loyal', desc: 'Play the same person 5 matches in a row.', test: (c) => c.my.some((x, i) => i >= 4 && c.my.slice(i - 4, i).every((y) => y.opp === x.opp)) },
  { id: 'photo', e: '📸', name: 'Photo Finish', desc: 'Beat someone within 5 Elo of you.', test: (c) => c.my.some((x) => x.won && Math.abs(x.oppBefore - x.eloBefore) <= 5) },
  { id: 'regicide', e: '🗡️', name: 'Regicide', desc: 'Take the crown off whoever had it.', test: (c) => c.my.some((x) => x.won && x.took) },
  { id: 'biggame', e: '💎', name: 'Big Game', desc: 'Collect a maxed out 60 point bounty.', test: (c) => c.my.some((x) => x.won && x.m.bountyCollected >= BOUNTY_CAP) },
  { id: 'herd', e: '🐑', name: 'Follow the Herd', desc: 'Make 10 calls with the majority.', test: (c) => c.calls.total - c.calls.against >= 10 },
  { id: 'lonewolf', e: '🐺', name: 'Lone Wolf', desc: 'Make 5 calls against the room.', test: (c) => c.calls.against >= 5 },
  { id: 'lockstar', e: '🔒', name: 'Lock Star', desc: 'Hit 3 locks.', test: (c) => c.calls.lockHits >= 3 },
  { id: 'lucky8', e: '🎱', name: 'Lucky Eight', desc: 'Win for exactly +8.', secret: true, test: (c) => c.my.some((x) => x.won && x.gain === 8) },
  { id: 'textbook', e: '📐', name: 'Textbook', desc: 'Win for exactly +16 three times. The most average win there is.', secret: true, test: (c) => c.my.filter((x) => x.won && x.gain === 16).length >= 3 },
  { id: 'dejavu', e: '🔁', name: 'Déjà Vu', desc: 'Play the same person 3 times in one day.', secret: true, test: (c) => Object.values(c.my.reduce<Record<string, number>>((acc, x) => { const key = x.opp + x.d.toDateString(); acc[key] = (acc[key] ?? 0) + 1; return acc; }, {})).some((n) => n >= 3) },
  { id: 'coffee', e: '☕', name: 'Coffee Break', desc: 'Play between 10:00 and 10:30.', secret: true, test: (c) => c.my.some((x) => x.d.getHours() === 10 && x.d.getMinutes() < 30) },
  { id: 'lunch', e: '🥪', name: 'Lunch Break', desc: 'Play between 12:00 and 12:15.', secret: true, test: (c) => c.my.some((x) => x.d.getHours() === 12 && x.d.getMinutes() < 15) },
  { id: 'overtime', e: '🛋️', name: 'Do You Even Go Home', desc: 'Play on a weekend.', secret: true, test: (c) => c.my.some((x) => x.d.getDay() === 0 || x.d.getDay() === 6) },
  { id: 'ghost', e: '👻', name: 'Ghost', desc: 'Come back after 14 days away and win.', secret: true, test: (c) => c.my.some((x, i) => i > 0 && x.won && x.m.timestamp - c.my[i - 1].m.timestamp >= DORMANT_GAP) },
  { id: 'bottom', e: '🕳️', name: 'Rock Bottom', desc: 'Drop below 900 Elo.', secret: true, test: (c) => c.my.some((x) => x.eloAfter < 900) },
  { id: 'round', e: '🧮', name: 'Perfectionist', desc: 'Land on a round hundred, like exactly 1100.', secret: true, test: (c) => c.my.some((x) => x.eloAfter % 100 === 0) },
  { id: 'sabotage', e: '🙈', name: 'Self Sabotage', desc: 'Hit a new peak, then lose the next four straight.', secret: true, test: (c) => { let peak = c.startElo; return c.my.some((x, i) => { const top = x.eloAfter > peak; peak = Math.max(peak, x.eloAfter); return top && c.my.length > i + 4 && c.my.slice(i + 1, i + 5).every((y) => !y.won); }); } },
  { id: 'balanced', e: '⚖️', name: 'Perfectly Balanced', desc: 'Exactly as many wins as losses, after 10 or more matches.', secret: true, test: (c) => c.my.length >= 10 && c.my.filter((x) => x.won).length * 2 === c.my.length },
  { id: 'clown', e: '🤡', name: 'Clown Call', desc: 'Lose a lock. Bold. Wrong.', secret: true, test: (c) => c.calls.locks - c.calls.lockHits > 0 },
  { id: 'underdogday', e: '🐕', name: 'Underdog Day', desc: 'Win 3 upsets in one day.', secret: true, test: (c) => Object.values(byDay(c.my)).some((d) => d.up >= 3) },
];
export const BADGE = Object.fromEntries(BADGES.map((badge) => [badge.id, badge]));

export const earnedBadges = (c: BadgeContext) => new Set(BADGES.filter((badge) => badge.test(c)).map((badge) => badge.id));

/** Five tiers: bronze, silver, gold, diamond, and the 8-ball, which is meant to be hard. */
export const TIERS = [
  { k: 'bronze', label: 'Bronze', c: '#A8622C', f: '#FFFFFF' },
  { k: 'silver', label: 'Silver', c: '#C9CCD1', f: '#0A0A0A' },
  { k: 'gold', label: 'Gold', c: '#F2B705', f: '#0A0A0A' },
  { k: 'diamond', label: 'Diamond', c: '#FFFFFF', f: '#0A0A0A' },
  { k: 'eight', label: '8-Ball', c: '#0A0A0A', f: '#FFFFFF' },
] as const;

export interface Achievement {
  id: string;
  e: string;
  name: string;
  unit: string;
  at: [number, number, number, number, number];
  names: [string, string, string, string, string];
  v: (c: BadgeContext) => number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'matches', e: '🎱', name: 'Table Time', unit: 'matches', at: [10, 50, 150, 400, 1000], names: ['Table Tourist', 'Chalk Regular', 'Felt Resident', 'Cue Monk', 'Part of the Table'], v: (c) => c.my.length },
  { id: 'wins', e: '🏆', name: 'Winner Winner', unit: 'wins', at: [5, 25, 75, 200, 500], names: ['Lucky Rookie', 'Closer', 'Shark', 'Apex Predator', 'The Final Boss'], v: (c) => c.my.filter((x) => x.won).length },
  { id: 'stripes', e: '🦓', name: 'Stripe Life', unit: 'wins on stripes', at: [5, 20, 50, 120, 300], names: ['Stripe Curious', 'Zebra Cadet', 'Pinstripe', 'Barcode', 'Walking Crosswalk'], v: (c) => c.my.filter((x) => x.won && x.group === 'stripes').length },
  { id: 'solids', e: '🟡', name: 'Solid Ground', unit: 'wins on solids', at: [5, 20, 50, 120, 300], names: ['Solid Snack', 'Rock Solid', 'Bedrock', 'Tectonic', 'The Monolith'], v: (c) => c.my.filter((x) => x.won && x.group === 'solids').length },
  { id: 'streak', e: '🔥', name: 'Heat Check', unit: 'wins in a row', at: [3, 5, 8, 12, 20], names: ['Warm Hands', 'On a Roll', 'Heater', 'Unplugged', 'Nuclear'], v: (c) => runOf(c.my, (x) => x.won) },
  { id: 'upsets', e: '🗡️', name: 'Giant Slayer', unit: 'upset wins', at: [1, 5, 15, 40, 100], names: ['Pebble Thrower', 'Slingshot', 'Beanstalk Climber', 'Titan Tipper', 'Olympus Wrecker'], v: (c) => c.my.filter((x) => x.won && x.m.isUpset).length },
  { id: 'bounty', e: '💰', name: 'Bounty Hunter', unit: 'bounty points', at: [10, 60, 200, 500, 1500], names: ['Loose Change', 'Collector', 'Tax Man', 'Crown Jeweler', 'The Treasury'], v: (c) => c.my.reduce((n, x) => n + (x.won ? x.m.bountyCollected : 0), 0) },
  { id: 'defend', e: '👑', name: 'Crown Keeper', unit: 'crown defences', at: [1, 5, 15, 40, 100], names: ['Seat Warmer', 'Gatekeeper', 'Castle Wall', 'Iron Throne', 'Dynasty'], v: (c) => c.my.filter((x) => x.won && x.defended).length },
  { id: 'peak', e: '📈', name: 'Summit', unit: 'Elo peak', at: [1050, 1100, 1150, 1200, 1300], names: ['Base Camp', 'Foothills', 'Ridge', 'Summit', 'Thin Air'], v: (c) => Math.max(1000, ...c.my.map((x) => x.eloAfter)) },
  { id: 'losses', e: '🩹', name: 'Character Building', unit: 'losses', at: [5, 25, 75, 200, 500], names: ['Bruised', 'Humbled', 'Seasoned', 'Battle Scarred', 'Unbreakable Spirit'], v: (c) => c.my.filter((x) => !x.won).length },
  { id: 'days', e: '📅', name: 'Showing Up', unit: 'days played', at: [3, 10, 25, 60, 150], names: ['Drop In', 'Familiar Face', 'Fixture', 'Furniture', 'Load Bearing Wall'], v: (c) => new Set(c.my.map((x) => x.d.toDateString())).size },
  { id: 'opps', e: '🧭', name: 'Social Butterfly', unit: 'different opponents', at: [3, 6, 9, 15, 25], names: ['Small Circle', 'Networker', 'Mingler', 'Office Celebrity', "Everyone's Nemesis"], v: (c) => new Set(c.my.map((x) => x.opp)).size },
  { id: 'calls', e: '🔮', name: 'Crystal Ball', unit: 'correct calls', at: [3, 15, 50, 120, 300], names: ['Lucky Guess', 'Hunch Haver', 'Tea Leaf Reader', 'Seer', 'Nostradamus'], v: (c) => c.calls.hits },
];
export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export const tierOf = (a: Achievement, value: number) => a.at.filter((threshold) => value >= threshold).length;

export const achievementProgress = (c: BadgeContext) =>
  ACHIEVEMENTS.map((a) => {
    const value = a.v(c);
    return { a, v: value, t: tierOf(a, value) };
  });

/** Badge ids plus "t:<achievement>:<tier>" keys, so two snapshots can be diffed. */
export function unlockKeys(c: BadgeContext): Set<string> {
  const keys = earnedBadges(c);
  for (const { a, t } of achievementProgress(c)) for (let k = 1; k <= t; k++) keys.add(`t:${a.id}:${k}`);
  return keys;
}

export interface Unlock {
  key: string;
  e: string;
  label: string;
  name: string;
  desc: string;
  tier?: (typeof TIERS)[number];
}

export function describeUnlock(key: string): Unlock | null {
  if (key.startsWith('t:')) {
    const [, id, k] = key.split(':');
    const a = ACHIEVEMENT[id];
    const tier = TIERS[Number(k) - 1];
    if (!a || !tier) return null;
    return { key, e: a.e, label: `${tier.label} tier`, name: a.names[Number(k) - 1], desc: `${a.name}. ${a.at[Number(k) - 1]} ${a.unit}.`, tier };
  }
  const badge = BADGE[key];
  if (!badge) return null;
  return { key, e: badge.e, label: badge.secret ? 'Secret badge' : 'New badge', name: badge.name, desc: badge.desc };
}

export const contextFor = (player: Player, matches: MatchRecord[], challenges: Challenge[], startElo = 1000) =>
  buildBadgeContext(player, matches, challenges, startElo);
