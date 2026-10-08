import { Challenge, MatchRecord, Prediction } from '../types';

/**
 * Office chips: the betting side of calling a match.
 *
 * Calls are paid out of your own coins, with no daily limit. The winning
 * stakes come back and the losing stakes go into the jackpot. What a player has won is their wealth.
 *
 * On top, a jackpot entry (the winner's ball and the pocket of the last ball)
 * costs a flat fee that goes into the pot, and the house adds more after every
 * match. Whoever calls winner, ball and pocket shares it; when nobody does, it
 * rolls on and grows.
 *
 * Nothing here is stored as a balance. It is all rebuilt from the challenges
 * and matches, in the order the matches were played, so a corrected result
 * corrects the chips too.
 */

export const STAKES = [10, 25, 50, 100] as const;
/** Old flat ball tip, kept for calls made before the wallet. */
export const BALL_TIP_COST = 10;
/** Entering the jackpot: winner, ball and the pocket of the last ball. */
export const JACKPOT_ENTRY = 20;
/** The house adds this to the jackpot after every settled match. */
export const JACKPOT_HOUSE = 50;
/**
 * From here on a call is paid out of the player's own coins (2026-10-08). Calls
 * before it were free, out of a daily allowance, and settle as they always did.
 */
export const WALLET_LAUNCHED_AT = 1791410413000;

export const isWalletCall = (prediction: { createdAt: number }) => prediction.createdAt >= WALLET_LAUNCHED_AT;
/** A jackpot entry in the current rules. */
export const hasJackpotEntry = (prediction: Pick<Prediction, 'ball' | 'pocket'>) => !!prediction.ball && !!prediction.pocket;

/**
 * Calls made before chips existed (2026-09-28 14:15 CEST) had no stake. They
 * are settled as if they had one: a plain call 25, a lock 50, so the old
 * calling record carries over into the stacks.
 */
export const CHIPS_LAUNCHED_AT = 1790597742000;
export const LEGACY_STAKE = 25;
export const LEGACY_LOCK_STAKE = 50;

/** What a call has riding on it, old calls included. */
export const stakeOf = (prediction: { stake?: number; isLock?: boolean; createdAt: number }) =>
  prediction.stake ?? (prediction.createdAt < CHIPS_LAUNCHED_AT ? (prediction.isLock ? LEGACY_LOCK_STAKE : LEGACY_STAKE) : 0);

/** One-off gifts to everyone on the roster, added to their stack. */
export const GRANTS: Array<{ day: string; amount: number }> = [{ day: '2026-09-28', amount: 100 }];

/** What a call takes out of the wallet. Free before the wallet existed. */
export const costOf = (prediction: Pick<Prediction, 'stake' | 'ball' | 'pocket' | 'createdAt'>) =>
  isWalletCall(prediction) ? (prediction.stake ?? 0) + (hasJackpotEntry(prediction) ? JACKPOT_ENTRY : 0) : 0;

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

  // Calls come out of the wallet the moment they are cast; a challenge that
  // never gets played gives them back.
  for (const challenge of challenges) {
    if (!['pending', 'accepted', 'live', 'played'].includes(challenge.status)) continue;
    for (const prediction of challenge.predictions) {
      const cost = costOf(prediction);
      if (cost > 0) record(prediction.predictorId).chips -= cost;
    }
  }

  for (const challenge of challenges) {
    if (['pending', 'accepted', 'live'].includes(challenge.status)) {
      pools.set(challenge.id, challenge.predictions.reduce((sum, prediction) => sum + stakeOf(prediction), 0));
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
    const staked = challenge.predictions.filter((prediction) => stakeOf(prediction) > 0);
    const right = staked.filter((prediction) => prediction.predictedWinnerId === winnerId);
    const wrong = staked.filter((prediction) => prediction.predictedWinnerId !== winnerId);
    const rightPool = right.reduce((sum, prediction) => sum + stakeOf(prediction), 0);
    const wrongPool = wrong.reduce((sum, prediction) => sum + stakeOf(prediction), 0);

    const walletEra = settledAt(challenge) >= WALLET_LAUNCHED_AT;
    const paid = new Map<string, Payout>();
    const slot = (id: string, stake: number) => {
      const existing = paid.get(id) ?? { playerId: id, staked: 0, paid: 0, jackpot: 0 };
      existing.staked += stake;
      paid.set(id, existing);
      return existing;
    };

    for (const prediction of right) {
      const stake = stakeOf(prediction);
      // Since the wallet, lost stakes feed the jackpot instead of the winners.
      const share = walletEra ? 0 : rightPool > 0 ? Math.floor((wrongPool * stake) / rightPool) : 0;
      slot(prediction.predictorId, stake).paid += stake + share;
    }
    for (const prediction of wrong) slot(prediction.predictorId, stakeOf(prediction));
    // Old rules: only when nobody backed the winner does the pool feed the jackpot.
    if (walletEra || rightPool === 0) jackpot += wrongPool;

    // The jackpot: entries pay in, the house tops it up after every match, and
    // only an exact call takes it: winner, ball and the last pocket. Calls from
    // before the wallet were a flat ball tip and still win on winner and ball.
    const tips = challenge.predictions.filter((prediction) => hasJackpotEntry(prediction) || (prediction.ball && !isWalletCall(prediction)));
    jackpot += tips.reduce((sum, prediction) => sum + (hasJackpotEntry(prediction) ? JACKPOT_ENTRY : BALL_TIP_COST), 0);
    if (walletEra) jackpot += JACKPOT_HOUSE;
    const exact = match?.winnerBall
      ? tips.filter(
          (prediction) =>
            prediction.predictedWinnerId === winnerId &&
            prediction.ball === match.winnerBall &&
            (!hasJackpotEntry(prediction) || (!!match.lastPocket && prediction.pocket === match.lastPocket))
        )
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
