import { Challenge, MatchRecord, Season } from '../types';
import { deriveChips } from './chips';
import { seeded } from './cards';
import { dayKeyOf } from './daily';
import { mondayOf } from './tournament';

/**
 * Coins for playing, on top of the betting. Every match pays both players,
 * more to the winner, extra for an upset and for a winning run. Like the rest
 * of the coins nothing is stored: it is all read off the matches, so a
 * corrected result corrects the coins too. Matches from before this went in
 * pay nothing, so nobody gets a surprise windfall for last month.
 */
export const MATCH_COINS = { play: 20, win: 20, upset: 25, streak: 10 };
/** A win pays the streak bonus from this many wins in a row. */
export const STREAK_FROM = 3;
/** 2026-10-05 15:15 CEST. */
export const MATCH_COINS_FROM = 1791205335000;

/** Coins each player earned from matches between `from` and `until`. */
export function deriveMatchCoins(matches: MatchRecord[], from = MATCH_COINS_FROM, until = Infinity): Map<string, number> {
  const coins = new Map<string, number>();
  const run = new Map<string, number>();
  const add = (id: string, amount: number) => coins.set(id, (coins.get(id) ?? 0) + amount);
  for (const match of [...matches].sort((a, b) => a.timestamp - b.timestamp)) {
    // Runs are counted over every match, paid only inside the window.
    const streak = (run.get(match.winnerId) ?? 0) + 1;
    run.set(match.winnerId, streak);
    run.set(match.loserId, 0);
    if (match.timestamp < from || match.timestamp >= until) continue;
    add(match.winnerId, MATCH_COINS.play + MATCH_COINS.win + (match.isUpset ? MATCH_COINS.upset : 0) + (streak >= STREAK_FROM ? MATCH_COINS.streak : 0));
    add(match.loserId, MATCH_COINS.play);
  }
  return coins;
}

/** What one match paid each side, for the result screen. */
export function matchCoinsFor(match: MatchRecord, matches: MatchRecord[]): { winner: number; loser: number } {
  if (match.timestamp < MATCH_COINS_FROM) return { winner: 0, loser: 0 };
  const before = matches.filter((entry) => entry.timestamp < match.timestamp).sort((a, b) => b.timestamp - a.timestamp);
  let streak = 1;
  for (const entry of before) {
    if (entry.winnerId === match.winnerId) streak++;
    else if (entry.loserId === match.winnerId) break;
  }
  return {
    winner: MATCH_COINS.play + MATCH_COINS.win + (match.isUpset ? MATCH_COINS.upset : 0) + (streak >= STREAK_FROM ? MATCH_COINS.streak : 0),
    loser: MATCH_COINS.play,
  };
}

/**
 * Weekly challenges: three tasks a week, the same three for everyone, drawn
 * from a pool by the week. Each one done pays once. Progress is read off the
 * week's matches and calls.
 */
export const CHALLENGE_REWARD = 75;

interface WeekContext {
  mine: MatchRecord[];
  calls: Array<{ challenge: Challenge; predictedWinnerId: string }>;
}

export interface WeeklyTask {
  id: string;
  title: string;
  target: number;
}

const POOL: Array<WeeklyTask & { count: (c: WeekContext, me: string) => number }> = [
  { id: 'opponents', title: 'Play 3 different people', target: 3, count: (c, me) => new Set(c.mine.map((m) => (m.playerAId === me ? m.playerBId : m.playerAId))).size },
  { id: 'games', title: 'Play 8 matches', target: 8, count: (c) => c.mine.length },
  { id: 'calls', title: 'Call 5 matches', target: 5, count: (c) => c.calls.length },
  { id: 'right', title: 'Call 3 matches right', target: 3, count: (c) => c.calls.filter((call) => call.challenge.status === 'played' && call.challenge.resolvedWinnerId === call.predictedWinnerId).length },
  { id: 'upset', title: 'Win as the underdog', target: 1, count: (c, me) => c.mine.filter((m) => m.winnerId === me && m.isUpset).length },
  {
    id: 'run',
    title: 'Win 3 in a row',
    target: 3,
    count: (c, me) => {
      let run = 0;
      let best = 0;
      for (const m of [...c.mine].sort((a, b) => a.timestamp - b.timestamp)) {
        run = m.winnerId === me ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    },
  },
];

/** The three tasks of the week that starts on `weekKey`. */
export function weekTasks(weekKey: string): WeeklyTask[] {
  const random = seeded(`tasks-${weekKey}`);
  const pool = [...POOL];
  const picked: typeof POOL = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked.map(({ id, title, target }) => ({ id, title, target }));
}

export interface TaskProgress extends WeeklyTask {
  progress: number;
  done: boolean;
}

/** A player's progress on one week's tasks. */
export function weekProgress(playerId: string, weekStart: number, matches: MatchRecord[], challenges: Challenge[]): TaskProgress[] {
  const weekEnd = weekStart + 7 * 86_400_000;
  const inWeek = (at: number) => at >= weekStart && at < weekEnd;
  const context: WeekContext = {
    mine: matches.filter((m) => inWeek(m.timestamp) && (m.playerAId === playerId || m.playerBId === playerId)),
    calls: challenges.flatMap((challenge) =>
      challenge.predictions.filter((p) => p.predictorId === playerId && inWeek(p.createdAt)).map((p) => ({ challenge, predictedWinnerId: p.predictedWinnerId }))
    ),
  };
  return weekTasks(dayKeyOf(weekStart)).map((task) => {
    const progress = Math.min(task.target, POOL.find((entry) => entry.id === task.id)!.count(context, playerId));
    return { ...task, progress, done: progress >= task.target };
  });
}

/** Coins from every finished task, every week since the challenges began. */
export function deriveChallengeCoins(playerIds: string[], matches: MatchRecord[], challenges: Challenge[], now: number): Map<string, number> {
  const coins = new Map<string, number>();
  for (let week = mondayOf(MATCH_COINS_FROM).getTime(); week <= now; week = mondayOf(week + 8 * 86_400_000).getTime()) {
    for (const id of playerIds) {
      const done = weekProgress(id, week, matches, challenges).filter((task) => task.done).length;
      if (done) coins.set(id, (coins.get(id) ?? 0) + done * CHALLENGE_REWARD);
    }
  }
  return coins;
}

/**
 * The season's coin ladder, for the High Roller cards when it closes: what
 * each player won calling matches and playing them inside the season.
 */
export function seasonCoinLeaders(season: Season, matches: MatchRecord[], challenges: Challenge[]): string[] {
  const until = season.endedAt ?? Infinity;
  const inSeason = matches.filter((m) => m.timestamp >= season.startedAt && m.timestamp < until);
  const ids = new Set(inSeason.map((m) => m.id));
  const settled = challenges.filter((c) => c.matchId && ids.has(c.matchId));
  const totals = new Map<string, number>();
  for (const [id, record] of deriveChips(settled, inSeason).records) totals.set(id, record.chips);
  for (const [id, amount] of deriveMatchCoins(matches, Math.max(season.startedAt, MATCH_COINS_FROM), until)) totals.set(id, (totals.get(id) ?? 0) + amount);
  return [...totals].filter(([, total]) => total > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
}
