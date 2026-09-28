import { Challenge, MatchRecord, Player } from '../types';
import { ChipsState, stakeOf } from './chips';
import { dayKeyOf } from './daily';
import { mondayOf } from './tournament';

/**
 * The weekly awards, handed out Friday at 16:00: a few real ones read off the
 * week's table, and a few for the things the office will actually talk about.
 * Nothing is stored; every week can be rebuilt from its matches at any time.
 */

export const AWARDS_HOUR = 16;

/** Award keys that are for laughs rather than for playing well. */
export const FUNNY_AWARDS = new Set(['freefall', 'clown', 'butter', 'boom', 'bully', 'burner', 'early', 'late', 'ghost', 'jinx', 'longshot', 'rivalry']);

export interface Award {
  key: string;
  e: string;
  title: string;
  playerId: string;
  /** The number behind it, in words. */
  line: string;
  funny: boolean;
}

export interface WeekAwards {
  week: string;
  from: number;
  releasedAt: number;
  matches: number;
  /** The week in numbers, for its own page. */
  stats: { calls: number; staked: number; upsets: number; players: number };
  /** Top three by Elo gained this week. */
  podium: Array<{ playerId: string; net: number }>;
  awards: Award[];
}

/** Friday 16:00 of the week that starts on `monday`. */
export function releaseOf(monday: Date): number {
  const date = new Date(monday);
  date.setDate(date.getDate() + 4);
  date.setHours(AWARDS_HOUR, 0, 0, 0);
  return date.getTime();
}

/** The most recent week whose awards are out at `now`. */
export function latestReleasedMonday(now: number): Date {
  const monday = mondayOf(now);
  if (now >= releaseOf(monday)) return monday;
  const previous = new Date(monday);
  previous.setDate(previous.getDate() - 7);
  return previous;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const minutesOfDay = (at: number) => {
  const date = new Date(at);
  return date.getHours() * 60 + date.getMinutes();
};
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** The top of a tally, if it clears `min`; ties go to whoever got there first. */
function top(tally: Map<string, number>, min = 1): [string, number] | null {
  let best: [string, number] | null = null;
  for (const entry of tally) if (entry[1] >= min && (!best || entry[1] > best[1])) best = entry;
  return best;
}

export function weekAwards(
  monday: Date,
  players: Player[],
  allMatches: MatchRecord[],
  challenges: Challenge[],
  chips: ChipsState
): WeekAwards {
  const from = monday.getTime();
  const releasedAt = releaseOf(monday);
  const matches = allMatches
    .filter((match) => match.timestamp >= from && match.timestamp < releasedAt)
    .sort((a, b) => a.timestamp - b.timestamp);
  const awards: Award[] = [];
  const add = (award: Omit<Award, 'funny'>, funny = false) => awards.push({ ...award, funny });

  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const played = new Map<string, number>();
  const net = new Map<string, number>();
  const scratches = new Map<string, number>();
  const breaks = new Map<string, number>();
  const beat = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string, by = 1) => map.set(id, (map.get(id) ?? 0) + by);

  for (const match of matches) {
    bump(wins, match.winnerId);
    bump(losses, match.loserId);
    bump(played, match.winnerId);
    bump(played, match.loserId);
    const eloOf = (id: string, after: boolean) =>
      id === match.playerAId ? (after ? match.playerAEloAfter : match.playerAEloBefore) : after ? match.playerBEloAfter : match.playerBEloBefore;
    for (const id of [match.winnerId, match.loserId]) bump(net, id, eloOf(id, true) - eloOf(id, false));
    if (match.modifiers?.scratchOnEight) bump(scratches, match.loserId);
    if (match.modifiers?.eightOnBreak) bump(breaks, match.winnerId);
    bump(beat, `${match.winnerId}>${match.loserId}`);
  }

  // The real ones.
  const mvp = [...wins].sort((a, b) => b[1] - a[1] || (net.get(b[0]) ?? 0) - (net.get(a[0]) ?? 0))[0];
  if (mvp) add({ key: 'mvp', e: '🥇', title: 'Player of the week', playerId: mvp[0], line: `${plural(mvp[1], 'win')}, ${plural(losses.get(mvp[0]) ?? 0, 'loss', 'losses')}` });
  const climber = top(net);
  if (climber) add({ key: 'climber', e: '📈', title: 'Biggest climber', playerId: climber[0], line: `+${climber[1]} Elo this week` });
  const ironman = top(played, 3);
  if (ironman) add({ key: 'ironman', e: '🦾', title: 'Iron man', playerId: ironman[0], line: `${plural(ironman[1], 'match', 'matches')} played` });
  const upset = matches
    .filter((match) => match.isUpset)
    .map((match) => {
      const winnerA = match.winnerId === match.playerAId;
      const gap = winnerA ? match.playerBEloBefore - match.playerAEloBefore : match.playerAEloBefore - match.playerBEloBefore;
      return { match, gap };
    })
    .sort((a, b) => b.gap - a.gap)[0];
  if (upset) {
    const loser = players.find((player) => player.id === upset.match.loserId)?.name.split(' ')[0] ?? 'someone';
    add({ key: 'upset', e: '🎯', title: 'Upset of the week', playerId: upset.match.winnerId, line: `Beat ${loser} from ${upset.gap} Elo down` });
  }

  // The calls: what each player's bets won or lost on matches from this week.
  const byMatch = new Map(matches.map((match) => [match.id, match]));
  const profit = new Map<string, number>();
  for (const challenge of challenges) {
    if (!challenge.matchId || !byMatch.has(challenge.matchId)) continue;
    for (const payout of chips.payouts.get(challenge.id) ?? []) bump(profit, payout.playerId, payout.paid + payout.jackpot - payout.staked);
  }
  // Who the room believed in, and who let them down.
  const backing = new Map<string, number>();
  const jinxed = new Map<string, number>();
  const longshots = new Map<string, number>();
  let calls = 0;
  let staked = 0;
  for (const challenge of challenges) {
    const match = challenge.matchId ? byMatch.get(challenge.matchId) : undefined;
    if (!match) continue;
    for (const prediction of challenge.predictions) {
      calls++;
      staked += stakeOf(prediction);
      bump(backing, prediction.predictedWinnerId);
    }
    const backers = (id: string) => challenge.predictions.filter((prediction) => prediction.predictedWinnerId === id).length;
    if (backers(match.loserId) > backers(match.winnerId) && backers(match.loserId) >= 2) bump(jinxed, match.loserId);
    const minority = backers(match.winnerId) < backers(match.loserId);
    if (minority) for (const prediction of challenge.predictions) if (prediction.predictedWinnerId === match.winnerId) bump(longshots, prediction.predictorId);
  }
  const crowd = top(backing, 3);
  if (crowd) add({ key: 'crowd', e: '📣', title: 'Crowd favourite', playerId: crowd[0], line: `${plural(crowd[1], 'call')} backed them this week` });

  const oracle = top(profit);
  if (oracle) add({ key: 'oracle', e: '🔮', title: 'Oracle', playerId: oracle[0], line: `+${oracle[1]} chips from calls` });

  // The ones people will actually bring up.
  const faller = top(new Map([...net].map(([id, value]) => [id, -value])));
  if (faller) add({ key: 'freefall', e: '🪂', title: 'Free fall', playerId: faller[0], line: `${-faller[1]} Elo down the stairs` }, true);
  const clown = top(losses, 2);
  if (clown) add({ key: 'clown', e: '🤡', title: 'Biggest clown', playerId: clown[0], line: `Lost ${plural(clown[1], 'match', 'matches')}. Handed out wins like flyers.` }, true);
  const butter = top(scratches);
  if (butter) add({ key: 'butter', e: '🧈', title: 'Butterfingers', playerId: butter[0], line: `Scratched on the 8 ${butter[1] === 1 ? 'once' : `${butter[1]} times`}` }, true);
  const boom = top(breaks);
  if (boom) add({ key: 'boom', e: '💥', title: 'Big bang', playerId: boom[0], line: `Sank the 8 on the break ${boom[1] === 1 ? 'once' : `${boom[1]} times`}` }, true);
  const bully = top(beat, 3);
  if (bully) {
    const [winnerId, loserId] = bully[0].split('>');
    const victim = players.find((player) => player.id === loserId)?.name.split(' ')[0] ?? 'someone';
    add({ key: 'bully', e: '😈', title: 'Landlord', playerId: winnerId, line: `Beat ${victim} ${bully[1]} times. Rent is due.` }, true);
  }
  const jinx = top(jinxed);
  if (jinx) add({ key: 'jinx', e: '🐈‍⬛', title: 'The jinx', playerId: jinx[0], line: `The room backed them and lost ${jinx[1] === 1 ? 'once' : `${jinx[1]} times`}` }, true);
  const longshot = top(longshots, 2);
  if (longshot) add({ key: 'longshot', e: '🎲', title: 'Longshot', playerId: longshot[0], line: `Called it against the room ${longshot[1]} times` }, true);
  const pairs = new Map<string, number>();
  for (const match of matches) bump(pairs, [match.winnerId, match.loserId].sort().join('|'));
  const rivalry = top(pairs, 3);
  if (rivalry) {
    const [x, y] = rivalry[0].split('|');
    const xWins = matches.filter((match) => match.winnerId === x && match.loserId === y).length;
    const [lead, other, leadWins] = xWins >= rivalry[1] - xWins ? [x, y, xWins] : [y, x, rivalry[1] - xWins];
    const otherName = players.find((player) => player.id === other)?.name.split(' ')[0] ?? 'someone';
    add({ key: 'rivalry', e: '⚔️', title: 'Rivalry of the week', playerId: lead, line: `${rivalry[1]} meetings with ${otherName}, took ${leadWins}` }, true);
  }
  let hottest: [string, number] | null = null;
  const runs = new Map<string, number>();
  for (const match of matches) {
    runs.set(match.winnerId, (runs.get(match.winnerId) ?? 0) + 1);
    runs.set(match.loserId, 0);
    const run = runs.get(match.winnerId)!;
    if (run >= 3 && (!hottest || run > hottest[1])) hottest = [match.winnerId, run];
  }
  if (hottest) add({ key: 'onfire', e: '🔥', title: 'On fire', playerId: hottest[0], line: `${hottest[1]} wins in a row` });

  const burn = top(new Map([...profit].map(([id, value]) => [id, -value])), 25);
  if (burn) add({ key: 'burner', e: '🔥', title: 'Chip burner', playerId: burn[0], line: `${burn[1]} chips gone on bad calls` }, true);
  if (matches.length >= 3) {
    const early = [...matches].sort((a, b) => minutesOfDay(a.timestamp) - minutesOfDay(b.timestamp))[0];
    const late = [...matches].sort((a, b) => minutesOfDay(b.timestamp) - minutesOfDay(a.timestamp))[0];
    add({ key: 'early', e: '🐓', title: 'Early bird', playerId: early.winnerId, line: `Won a match at ${clock(early.timestamp)}` }, true);
    if (late.id !== early.id) add({ key: 'late', e: '🦉', title: 'Night shift', playerId: late.winnerId, line: `Still winning at ${clock(late.timestamp)}` }, true);
  }
  // Played in the four weeks before, not once this week.
  const regulars = new Set(
    allMatches
      .filter((match) => match.timestamp >= from - 28 * 86_400_000 && match.timestamp < from)
      .flatMap((match) => [match.playerAId, match.playerBId])
  );
  const ghost = players.filter((player) => regulars.has(player.id) && !played.has(player.id)).sort((a, b) => b.elo - a.elo)[0];
  if (ghost) add({ key: 'ghost', e: '👻', title: 'Ghost', playerId: ghost.id, line: 'Not one match. Is everything ok?' }, true);

  const podium = [...net].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([playerId, value]) => ({ playerId, net: value }));
  const stats = { calls, staked, upsets: matches.filter((match) => match.isUpset).length, players: played.size };
  // The real ones first, then the laughs, so the show builds and ends on a joke.
  awards.sort((a, b) => Number(a.funny) - Number(b.funny));
  return { week: dayKeyOf(from), from, releasedAt, matches: matches.length, stats, podium, awards };
}

/** Every finished week with at least one match, newest first. */
export function awardsArchive(players: Player[], matches: MatchRecord[], challenges: Challenge[], chips: ChipsState, now: number): WeekAwards[] {
  const weeks = new Map<string, Date>();
  for (const match of matches) {
    const monday = mondayOf(match.timestamp);
    if (releaseOf(monday) <= now) weeks.set(dayKeyOf(monday.getTime()), monday);
  }
  return [...weeks.values()]
    .sort((a, b) => b.getTime() - a.getTime())
    .map((monday) => weekAwards(monday, players, matches, challenges, chips))
    .filter((week) => week.awards.length > 0);
}
