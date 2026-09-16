import { Player, MatchRecord, MatchModifier, BallPreference } from '../types';
import { INITIAL_PLAYERS, INITIAL_MATCHES } from '../data/mockData';
import { calculateMatchElo } from '../utils/elo';

const STORAGE_PLAYERS_KEY = 'office_8ball_players_v1';
const STORAGE_MATCHES_KEY = 'office_8ball_matches_v1';

/**
 * Service layer simulating asynchronous Firestore collections:
 * - 'players' collection
 * - 'matches' collection
 * Easily swappable for real Firebase SDK getDocs/addDoc/updateDoc calls!
 */
class PoolService {
  private getStoredPlayers(): Player[] {
    try {
      const data = localStorage.getItem(STORAGE_PLAYERS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return INITIAL_PLAYERS;
  }

  private saveStoredPlayers(players: Player[]): void {
    try {
      localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify(players));
    } catch {
      // ignore
    }
  }

  private getStoredMatches(): MatchRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_MATCHES_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return INITIAL_MATCHES;
  }

  private saveStoredMatches(matches: MatchRecord[]): void {
    try {
      localStorage.setItem(STORAGE_MATCHES_KEY, JSON.stringify(matches));
    } catch {
      // ignore
    }
  }

  // Equivalent to: getDocs(collection(db, "players"))
  async getPlayers(): Promise<Player[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.getStoredPlayers());
      }, 50);
    });
  }

  // Equivalent to: getDocs(collection(db, "matches"), orderBy("timestamp", "desc"))
  async getMatches(): Promise<MatchRecord[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const matches = this.getStoredMatches();
        matches.sort((a, b) => b.timestamp - a.timestamp);
        resolve(matches);
      }, 50);
    });
  }

  // Equivalent to: addDoc(collection(db, "players"), playerData)
  async addPlayer(params: {
    name: string;
    department?: string;
    title?: string;
    ballPreference: BallPreference;
  }): Promise<Player> {
    const players = this.getStoredPlayers();
    const newPlayer: Player = {
      id: `player-${Date.now()}`,
      name: params.name.trim(),
      department: params.department?.trim() || 'General Pool Contender',
      title: params.title?.trim() || (params.ballPreference === 'solids' ? 'Solids Specialist' : 'Stripes Tactician'),
      avatarUrl: `https://images.unsplash.com/photo-${1530000000000 + Math.floor(Math.random() * 99999)}?w=200&auto=format&fit=crop&q=80`,
      ballPreference: params.ballPreference,
      elo: 1000,
      peakElo: 1000,
      wins: 0,
      losses: 0,
      currentStreak: 0,
      bestWinStreak: 0,
      breakAndRuns: 0,
      recentForm: [],
      createdAt: new Date().toISOString(),
    };

    players.push(newPlayer);
    this.saveStoredPlayers(players);
    return newPlayer;
  }

  // Equivalent to atomic batch update: addDoc(matches) & updateDoc(playerA) & updateDoc(playerB)
  async logMatch(params: {
    playerAId: string;
    playerBId: string;
    winnerId: string;
    modifiers: MatchModifier;
  }): Promise<{
    match: MatchRecord;
    updatedPlayers: Player[];
    winnerName: string;
    loserName: string;
    eloDelta: number;
    winnerNewElo: number;
    loserNewElo: number;
    isUpset: boolean;
  }> {
    const players = this.getStoredPlayers();
    const matches = this.getStoredMatches();

    const playerA = players.find((p) => p.id === params.playerAId);
    const playerB = players.find((p) => p.id === params.playerBId);

    if (!playerA || !playerB) {
      throw new Error('Players not found');
    }

    const winnerIsA = params.winnerId === playerA.id;
    const { newRatingA, newRatingB, deltaA, deltaB, isUpset } = calculateMatchElo(
      playerA.elo,
      playerB.elo,
      winnerIsA ? 'A' : 'B'
    );

    const winner = winnerIsA ? playerA : playerB;
    const loser = winnerIsA ? playerB : playerA;
    const winnerDelta = winnerIsA ? deltaA : deltaB;
    const loserDelta = winnerIsA ? deltaB : deltaA;

    // Update Player A
    playerA.elo = newRatingA;
    playerA.peakElo = Math.max(playerA.peakElo, newRatingA);
    if (winnerIsA) {
      playerA.wins += 1;
      playerA.currentStreak = playerA.currentStreak > 0 ? playerA.currentStreak + 1 : 1;
      playerA.bestWinStreak = Math.max(playerA.bestWinStreak, playerA.currentStreak);
      playerA.recentForm = ['W', ...playerA.recentForm.slice(0, 4)];
      if (params.modifiers.eightOnBreak) {
        playerA.breakAndRuns += 1;
      }
    } else {
      playerA.losses += 1;
      playerA.currentStreak = playerA.currentStreak < 0 ? playerA.currentStreak - 1 : -1;
      playerA.recentForm = ['L', ...playerA.recentForm.slice(0, 4)];
    }

    // Update Player B
    playerB.elo = newRatingB;
    playerB.peakElo = Math.max(playerB.peakElo, newRatingB);
    if (!winnerIsA) {
      playerB.wins += 1;
      playerB.currentStreak = playerB.currentStreak > 0 ? playerB.currentStreak + 1 : 1;
      playerB.bestWinStreak = Math.max(playerB.bestWinStreak, playerB.currentStreak);
      playerB.recentForm = ['W', ...playerB.recentForm.slice(0, 4)];
      if (params.modifiers.eightOnBreak) {
        playerB.breakAndRuns += 1;
      }
    } else {
      playerB.losses += 1;
      playerB.currentStreak = playerB.currentStreak < 0 ? playerB.currentStreak - 1 : -1;
      playerB.recentForm = ['L', ...playerB.recentForm.slice(0, 4)];
    }

    const newMatch: MatchRecord = {
      id: `match-${Date.now()}`,
      timestamp: Date.now(),
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: params.winnerId,
      loserId: winnerIsA ? playerB.id : playerA.id,
      playerAEloBefore: winnerIsA ? newRatingA - deltaA : newRatingA - deltaA,
      playerAEloAfter: newRatingA,
      playerBEloBefore: !winnerIsA ? newRatingB - deltaB : newRatingB - deltaB,
      playerBEloAfter: newRatingB,
      eloDelta: Math.abs(winnerDelta),
      isUpset,
      modifiers: { ...params.modifiers },
    };

    matches.unshift(newMatch);
    this.saveStoredPlayers(players);
    this.saveStoredMatches(matches);

    return {
      match: newMatch,
      updatedPlayers: [...players],
      winnerName: winner.name,
      loserName: loser.name,
      eloDelta: Math.abs(winnerDelta),
      winnerNewElo: winner.elo,
      loserNewElo: loser.elo,
      isUpset,
    };
  }

  async resetData(): Promise<{ players: Player[]; matches: MatchRecord[] }> {
    this.saveStoredPlayers(INITIAL_PLAYERS);
    this.saveStoredMatches(INITIAL_MATCHES);
    return { players: INITIAL_PLAYERS, matches: INITIAL_MATCHES };
  }
}

export const poolService = new PoolService();
