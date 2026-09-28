import { Challenge, MatchRecord } from '../types';

/**
 * Office chips: the betting side of calling a match.
 *
 * Everyone gets a fresh daily allowance to stake; what is not staked that day
 * is gone. Every match is its own pool: the losing stakes are shared among
 * the people who backed the winner, in proportion to what they put in, and
 * the winning stakes come back. What a player has won is their wealth.
 *
 * On top, a ball tip (solids or stripes for the winner) costs a flat fee that
 * goes into a jackpot. Everyone who calls both the winner and the ball shares
 * it; when nobody does, it rolls on and grows.
 *
 * Nothing here is stored as a balance. It is all rebuilt from the challenges
 * and matches, in the order the matches were played, so a corrected result
 * corrects the chips too.
 */

export const DAILY_CHIPS = 100;
export const STAKES = [10, 25, 50, 100] as const;
export const BALL_TIP_COST = 10;

/** One-off gifts to everyone on the roster, added to their stack. */
export const GRANTS: Array<{ day: string; amount: number }> = [{ day: '2026-09-28', amount: 100 }];

const dayKey = (at: number) => new Date(at).toDateString();

/** What a prediction took out of the day's allowance. */
export const costOf = (prediction: { stake?: number; ball?: string | null }) =>
  (prediction.stake ?? 0) + (prediction.ball ? BALL_TIP_COST : 0);

/** How much of today's allowance a player has already put down. */
export function spentOnDay(challenges: Challenge[], playerId: string, at: number): number {
  const day = dayKey(at);
  let spent = 0;
  for (const challenge of challenges) {
    for (const prediction of challenge.predictions) {
      if (prediction.predictorId === playerId && dayKey(prediction.createdAt) === day) spent += costOf(prediction);
    }
  }
  return spent;
}

export const leftToday = (challenges: Challenge[], playerId: string, at: number) =>
  Math.max(0, DAILY_CHIPS - spentOnDay(challenges, playerId, at));

export interface ChipRecord {
  /** Everything paid out to this player: returned stakes, winnings and jackpots. */
  chips: number;
  /** Stakes that did not come back. */
  lost: number;
  bets: number;
  wins: number;
  jackpots: number;
  /** Biggest single payout. */
  biggest: number;
}

export interface Payout {
  playerId: string;
  staked: number;
  paid: number;
  jackpot: number;
}

export interface ChipsState {
  records: Map<string, ChipRecord>;
  /** The jackpot as it stands now, waiting for the next exact call. */
  jackpot: number;
  /** Per settled challenge: who got what, for recaps and notifications. */
  payouts: Map<string, Payout[]>;
  /** Stakes riding on each open challenge. */
  pools: Map<string, number>;
}

const empty = (): ChipRecord => ({ chips: 0, lost: 0, bets: 0, wins: 0, jackpots: 0, biggest: 0 });

export function deriveChips(challenges: Challenge[], matches: MatchRecord[]): ChipsState {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const records = new Map<string, ChipRecord>();
  const payouts = new Map<string, Payout[]>();
  const pools = new Map<string, number>();
  const record = (id: string) => {
    const existing = records.get(id);
    if (existing) return existing;
    const fresh = empty();
    records.set(id, fresh);
    return fresh;
  };

  for (const challenge of challenges) {
    if (['pending', 'accepted', 'live'].includes(challenge.status)) {
      pools.set(challenge.id, challenge.predictions.reduce((sum, prediction) => sum + (prediction.stake ?? 0), 0));
    }
  }

  const settledAt = (challenge: Challenge) =>
    (challenge.matchId ? matchById.get(challenge.matchId)?.timestamp : undefined) ?? challenge.createdAt;
  const settled = challenges
    .filter((challenge) => challenge.status === 'played' && challenge.resolvedWinnerId)
    .sort((a, b) => settledAt(a) - settledAt(b));

  let jackpot = 0;
  for (const challenge of settled) {
    const winnerId = challenge.resolvedWinnerId!;
    const match = challenge.matchId ? matchById.get(challenge.matchId) : undefined;
    const staked = challenge.predictions.filter((prediction) => (prediction.stake ?? 0) > 0);
    const right = staked.filter((prediction) => prediction.predictedWinnerId === winnerId);
    const wrong = staked.filter((prediction) => prediction.predictedWinnerId !== winnerId);
    const rightPool = right.reduce((sum, prediction) => sum + (prediction.stake ?? 0), 0);
    const wrongPool = wrong.reduce((sum, prediction) => sum + (prediction.stake ?? 0), 0);

    const paid = new Map<string, Payout>();
    const slot = (id: string, stake: number) => {
      const existing = paid.get(id) ?? { playerId: id, staked: 0, paid: 0, jackpot: 0 };
      existing.staked += stake;
      paid.set(id, existing);
      return existing;
    };

    for (const prediction of right) {
      const stake = prediction.stake ?? 0;
      const share = rightPool > 0 ? Math.floor((wrongPool * stake) / rightPool) : 0;
      slot(prediction.predictorId, stake).paid += stake + share;
    }
    for (const prediction of wrong) slot(prediction.predictorId, prediction.stake ?? 0);
    // Nobody backed the winner: the pool has nowhere to go, so it feeds the jackpot.
    if (rightPool === 0) jackpot += wrongPool;

    // The ball tips: every one pays into the jackpot, the exact calls share it.
    const tips = challenge.predictions.filter((prediction) => prediction.ball);
    jackpot += tips.length * BALL_TIP_COST;
    const exact = match?.winnerBall
      ? tips.filter((prediction) => prediction.predictedWinnerId === winnerId && prediction.ball === match.winnerBall)
      : [];
    if (exact.length > 0) {
      const each = Math.floor(jackpot / exact.length);
      for (const prediction of exact) slot(prediction.predictorId, 0).jackpot += each;
      jackpot -= each * exact.length;
    }
    for (const prediction of tips) slot(prediction.predictorId, 0);

    for (const payout of paid.values()) {
      const entry = record(payout.playerId);
      const total = payout.paid + payout.jackpot;
      entry.chips += total;
      entry.lost += payout.paid > 0 ? 0 : payout.staked;
      if (payout.staked > 0) entry.bets++;
      if (payout.paid > 0) entry.wins++;
      if (payout.jackpot > 0) entry.jackpots++;
      entry.biggest = Math.max(entry.biggest, total);
    }
    payouts.set(challenge.id, [...paid.values()]);
  }

  return { records, jackpot, payouts, pools };
}

/** Extra chips from outside the betting: daily matches, tournaments. */
export function addBonus(state: ChipsState, playerId: string, amount: number) {
  const entry = state.records.get(playerId) ?? empty();
  entry.chips += amount;
  state.records.set(playerId, entry);
}
