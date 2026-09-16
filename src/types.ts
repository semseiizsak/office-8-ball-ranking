export type BallPreference = 'solids' | 'stripes' | 'any';

export interface Player {
  id: string;
  name: string;
  department?: string;
  title?: string;
  avatarUrl: string;
  ballPreference: BallPreference;
  elo: number;
  peakElo: number;
  wins: number;
  losses: number;
  currentStreak: number; // positive = win streak (e.g. +3), negative = losing streak (e.g. -2)
  bestWinStreak: number;
  breakAndRuns: number;
  recentForm: ('W' | 'L')[];
  /** Timestamp of this player's most recent match, used for dormancy. */
  lastPlayedAt: number | null;
  /** Running tally of spectator predictions this player has called. */
  predictionsCorrect: number;
  predictionsTotal: number;
  createdAt: string;
}

export interface MatchModifier {
  eightOnBreak: boolean;
  scratchOnEight: boolean;
  tableRun?: boolean;
}

export interface MatchRecord {
  id: string;
  timestamp: number;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  winnerId: string;
  loserId: string;
  playerAEloBefore: number;
  playerAEloAfter: number;
  playerBEloBefore: number;
  playerBEloAfter: number;
  eloDelta: number; // absolute change from the Elo formula, before any bounty
  isUpset: boolean;
  /** Extra rating carried off the crown holder, 0 when no crown changed hands. */
  bountyCollected: number;
  /** Set when the match resolved a standing challenge. */
  challengeId?: string;
  modifiers: MatchModifier;
}

export interface EloStakes {
  playerAWinsDelta: number;
  playerBWinsDelta: number;
  playerAWinNewA: number;
  playerAWinNewB: number;
  playerBWinNewB: number;
  playerBWinNewA: number;
  isAUpset: boolean;
  isBUpset: boolean;
}

export type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'played'
  | 'cancelled';

/** Snapshot of what the match was worth at the moment the challenge was issued. */
export interface ChallengeStakes {
  challengerElo: number;
  opponentElo: number;
  challengerRank: number;
  opponentRank: number;
  challengerWinDelta: number;
  opponentWinDelta: number;
  challengerIsUnderdog: boolean;
  /** Bounty riding on the match because the opponent holds the crown. */
  crownBounty: number;
}

export interface Prediction {
  id: string;
  predictorId: string;
  predictorName: string;
  predictedWinnerId: string;
  createdAt: number;
}

export interface Challenge {
  id: string;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  status: ChallengeStatus;
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
  stakes: ChallengeStakes;
  matchId: string | null;
  /** Winner the match actually produced, stored so predictions stay auditable. */
  resolvedWinnerId: string | null;
  predictions: Prediction[];
}

export type TabType = 'leaderboard' | 'log' | 'arena' | 'events' | 'players';
