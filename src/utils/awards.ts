import { Challenge, MatchRecord, Player } from '../types';
import { ChipsState } from './chips';
import { dayKeyOf } from './daily';
import { mondayOf } from './tournament';

/**
 * The weekly awards, handed out Friday at 16:00: a few real ones read off the
 * week's table, and a few for the things the office will actually talk about.
 * Nothing is stored; every week can be rebuilt from its matches at any time.
 */

export const AWARDS_HOUR = 16;

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
  const oracle = top(profit);
  if (oracle) add({ key: 'oracle', e: '🔮', title: 'Oracle', playerId: oracle[0], line: `+${oracle[1]} chips from calls` });

  // The ones people will actually bring up.
  const faller = top(new Map([...net].map(([id, value]) => [id, -value])));
  if (faller) add({ key: 'freefall', e: '🪂', title: 'Free fall', playerId: faller[0], line: `${-faller[1]} Elo down the stairs` }, true);
  const clown = top(losses, 3);
  if (clown) add({ key: 'clown', e: '🤡', title: 'Most generous', playerId: clown[0], line: `Handed out ${plural(clown[1], 'win')}` }, true);
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

  return { week: dayKeyOf(from), from, releasedAt, matches: matches.length, awards };
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
