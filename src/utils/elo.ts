import { EloStakes, MatchRecord, Player, ArchNemesisInfo } from '../types';

export const K_FACTOR = 32;

/**
 * Calculates the expected score for Player A given ratings R_A and R_B
 * Formula: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculates new Elo ratings after a match between Player A and Player B.
 * winner: 'A' | 'B'
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

  // An upset is defined when the lower rated player (by at least 25 elo) wins
  const isUpset =
    (winner === 'A' && ratingA < ratingB - 25) ||
    (winner === 'B' && ratingB < ratingA - 25);

  return {
    newRatingA,
    newRatingB,
    deltaA,
    deltaB,
    isUpset,
  };
}

/**
 * Computes the prospective stakes for both scenarios in the Log Match view.
 */
export function calculateProjectedStakes(ratingA: number, ratingB: number): EloStakes {
  const outcomeA = calculateMatchElo(ratingA, ratingB, 'A');
  const outcomeB = calculateMatchElo(ratingA, ratingB, 'B');

  return {
    playerAWinsDelta: Math.abs(outcomeA.deltaA),
    playerBWinsDelta: Math.abs(outcomeB.deltaB),
    playerAWinNewA: outcomeA.newRatingA,
    playerAWinNewB: outcomeA.newRatingB,
    playerBWinNewB: outcomeB.newRatingB,
    playerBWinNewA: outcomeB.newRatingA,
    isAUpset: outcomeA.isUpset,
    isBUpset: outcomeB.isUpset,
  };
}

/**
 * Finds the arch-nemesis for a specific player based on head-to-head match history.
 */
export function findArchNemesis(
  playerId: string,
  allPlayers: Player[],
  matchHistory: MatchRecord[]
): ArchNemesisInfo | null {
  const opponentLosses: Record<string, { losses: number; wins: number }> = {};

  matchHistory.forEach((match) => {
    if (match.playerAId === playerId || match.playerBId === playerId) {
      const opponentId = match.playerAId === playerId ? match.playerBId : match.playerAId;
      if (!opponentLosses[opponentId]) {
        opponentLosses[opponentId] = { losses: 0, wins: 0 };
      }

      if (match.loserId === playerId) {
        opponentLosses[opponentId].losses += 1;
      } else if (match.winnerId === playerId) {
        opponentLosses[opponentId].wins += 1;
      }
    }
  });

  let maxLosses = 0;
  let topOpponentId: string | null = null;

  for (const [opponentId, stats] of Object.entries(opponentLosses)) {
    if (stats.losses > maxLosses) {
      maxLosses = stats.losses;
      topOpponentId = opponentId;
    }
  }

  if (!topOpponentId || maxLosses === 0) {
    // Return null or default if no losses recorded yet
    return null;
  }

  const opponent = allPlayers.find((p) => p.id === topOpponentId);
  if (!opponent) return null;

  const stats = opponentLosses[topOpponentId];
  const quirkDescriptions = [
    `Lost ${stats.losses} of last ${stats.losses + stats.wins} clashes. Known to get uncharacteristically rattled by their precision bank shots.`,
    `Has struggled to counter their aggressive break-and-run tempo in recent high-stakes encounters.`,
    `A classic clash of styles. Often gives away tactical position when pressured on cut shots along the rail.`,
    `Historic rival on Table 1. High-stress matchups regularly boil down to the final 8-ball battle.`,
  ];

  const hash = (playerId.charCodeAt(0) + opponent.id.charCodeAt(0)) % quirkDescriptions.length;

  return {
    opponentId: opponent.id,
    opponentName: opponent.name,
    opponentDepartment: opponent.department,
    lossesAgainst: stats.losses,
    winsAgainst: stats.wins,
    totalGames: stats.losses + stats.wins,
    quirkDescription: quirkDescriptions[hash],
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
