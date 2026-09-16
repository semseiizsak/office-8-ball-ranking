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
  biggestUpset?: {
    opponentName: string;
    eloDelta: number;
    description: string;
  };
  recentForm: ('W' | 'L')[];
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
  eloDelta: number; // absolute change
  isUpset: boolean;
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

export interface ArchNemesisInfo {
  opponentId: string;
  opponentName: string;
  opponentDepartment?: string;
  lossesAgainst: number;
  winsAgainst: number;
  totalGames: number;
  quirkDescription: string;
}

export type TabType = 'leaderboard' | 'log' | 'players';
