import { EloStakes } from '../types';

export const K_FACTOR = 32;

/**
 * An upset is a win by a player the model gave less than this chance.
 * Expressed as expectancy rather than a rating gap so it means the same thing
 * at every point on the ladder — and so the badge stays rare enough to mean
 * something when it does appear.
 */
export const UPSET_EXPECTANCY = 0.4;

/**
 * Calculates the expected score for Player A given ratings R_A and R_B
 * Formula: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculates new Elo ratings after a match between Player A and Player B.
 *
 * The rating gap is the only thing that scales the exchange: beat someone well
 * above you and you take a lot, beat someone below you and you take very
 * little. Nothing about how the match was played is recorded or rewarded.
 */
export function calculateMatchElo(
  ratingA: number,
  ratingB: number,
  winner: 'A' | 'B'
): {
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  deltaB: number;
  isUpset: boolean;
} {
  const expectedA = calculateExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  const actualA = winner === 'A' ? 1 : 0;
  const actualB = winner === 'B' ? 1 : 0;

  // New Rating: R' = R + K * (Actual - Expected)
  const rawDeltaA = K_FACTOR * (actualA - expectedA);
  const rawDeltaB = K_FACTOR * (actualB - expectedB);

  // Ensure minimum 1 point movement on win
  let deltaA = Math.round(rawDeltaA);
  if (winner === 'A' && deltaA < 1) deltaA = 1;
  if (winner === 'B' && deltaA > -1) deltaA = -1;

  let deltaB = Math.round(rawDeltaB);
  if (winner === 'B' && deltaB < 1) deltaB = 1;
  if (winner === 'A' && deltaB > -1) deltaB = -1;

  const newRatingA = Math.max(100, ratingA + deltaA);
  const newRatingB = Math.max(100, ratingB + deltaB);

  const isUpset = (winner === 'A' ? expectedA : expectedB) < UPSET_EXPECTANCY;

  return {
    newRatingA,
    newRatingB,
    deltaA,
    deltaB,
    isUpset,
  };
}

/**
 * Prospective stakes for both outcomes, used everywhere the app needs to show
 * what a match is worth before it is played.
 *
 * `bountyOnA` / `bountyOnB` carry the crown bounty: rating the holder forfeits
 * on top of the normal exchange when somebody finally takes them down.
 */
export function calculateProjectedStakes(
  ratingA: number,
  ratingB: number,
  bountyOnA: number = 0,
  bountyOnB: number = 0
): EloStakes {
  const outcomeA = calculateMatchElo(ratingA, ratingB, 'A');
  const outcomeB = calculateMatchElo(ratingA, ratingB, 'B');

  // Beating the crown holder also collects whatever their reign has accrued.
  const aWins = Math.abs(outcomeA.deltaA) + bountyOnB;
  const bWins = Math.abs(outcomeB.deltaB) + bountyOnA;

  return {
    playerAWinsDelta: aWins,
    playerBWinsDelta: bWins,
    playerAWinNewA: ratingA + aWins,
    playerAWinNewB: Math.max(100, ratingB - aWins),
    playerBWinNewB: ratingB + bWins,
    playerBWinNewA: Math.max(100, ratingA - bWins),
    isAUpset: outcomeA.isUpset,
    isBUpset: outcomeB.isUpset,
  };
}

/**
 * Helper to compute streak label (e.g. "W6" or "L3")
 */
export function formatStreak(streak: number): string {
  if (streak > 0) return `W${streak}`;
  if (streak < 0) return `L${Math.abs(streak)}`;
  return '-';
}
