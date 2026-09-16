import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { MatchModifier, MatchRecord, Player } from '../types';
import { calculateMatchElo } from '../utils/elo';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const playersCollection = collection(db, 'players');
const matchesCollection = collection(db, 'matches');

const timestampToIso = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
};

const toPlayer = (id: string, data: Record<string, unknown>): Player => ({
  id,
  name: String(data.name ?? 'Unnamed Contender'),
  department: String(data.department ?? 'General Pool Contender'),
  title: String(data.title ?? 'Pool Contender'),
  avatarUrl: String(data.avatarUrl ?? ''),
  ballPreference: data.ballPreference === 'stripes' ? 'stripes' : 'solids',
  elo: Number(data.elo ?? 1000),
  peakElo: Number(data.peakElo ?? data.elo ?? 1000),
  wins: Number(data.wins ?? 0),
  losses: Number(data.losses ?? 0),
  currentStreak: Number(data.currentStreak ?? 0),
  bestWinStreak: Number(data.bestWinStreak ?? 0),
  breakAndRuns: Number(data.breakAndRuns ?? 0),
  recentForm: Array.isArray(data.recentForm) ? (data.recentForm as ('W' | 'L')[]) : [],
  createdAt: timestampToIso(data.createdAt),
});

const toMatch = (id: string, data: Record<string, unknown>): MatchRecord => ({
  id,
  timestamp: new Date(timestampToIso(data.timestamp)).getTime(),
  playerAId: String(data.playerAId),
  playerAName: String(data.playerAName ?? ''),
  playerBId: String(data.playerBId),
  playerBName: String(data.playerBName ?? ''),
  winnerId: String(data.winnerId),
  loserId: String(data.loserId),
  playerAEloBefore: Number(data.playerAEloBefore),
  playerAEloAfter: Number(data.playerAEloAfter),
  playerBEloBefore: Number(data.playerBEloBefore),
  playerBEloAfter: Number(data.playerBEloAfter),
  eloDelta: Number(data.eloDelta ?? data.eloExchanged ?? 0),
  isUpset: Boolean(data.isUpset),
  modifiers: {
    eightOnBreak: Boolean((data.modifiers as Record<string, unknown> | undefined)?.eightOnBreak),
    scratchOnEight: Boolean((data.modifiers as Record<string, unknown> | undefined)?.scratchOnEight),
    tableRun: Boolean((data.modifiers as Record<string, unknown> | undefined)?.tableRun),
  },
});

export async function addPlayer(params: {
  name: string;
  department?: string;
  title?: string;
  ballPreference: 'solids' | 'stripes' | 'any';
}): Promise<Player> {
  const playerRef = doc(playersCollection);
  const playerData = {
    name: params.name.trim(),
    department: params.department?.trim() || 'General Pool Contender',
    title: params.title?.trim() || (params.ballPreference === 'solids' ? 'Solids Specialist' : 'Stripes Tactician'),
    avatarUrl: '',
    ballPreference: params.ballPreference === 'stripes' ? 'stripes' : 'solids',
    elo: 1000,
    peakElo: 1000,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestWinStreak: 0,
    breakAndRuns: 0,
    recentForm: [],
    createdAt: serverTimestamp(),
  };

  await setDoc(playerRef, playerData);
  return toPlayer(playerRef.id, { ...playerData, createdAt: new Date().toISOString() });
}

export async function getLeaderboard(): Promise<Player[]> {
  const snapshot = await getDocs(query(playersCollection, orderBy('elo', 'desc')));
  return snapshot.docs.map((playerDoc) => toPlayer(playerDoc.id, playerDoc.data()));
}

export async function getMatches(): Promise<MatchRecord[]> {
  const snapshot = await getDocs(query(matchesCollection, orderBy('timestamp', 'desc')));
  return snapshot.docs.map((matchDoc) => toMatch(matchDoc.id, matchDoc.data()));
}

export async function logMatch(
  playerAId: string,
  playerBId: string,
  winnerId: string,
  modifiers: MatchModifier = { eightOnBreak: false, scratchOnEight: false, tableRun: false }
): Promise<{
  match: MatchRecord;
  updatedPlayers: Player[];
  winnerName: string;
  loserName: string;
  eloDelta: number;
  winnerNewElo: number;
  loserNewElo: number;
  isUpset: boolean;
}> {
  if (playerAId === playerBId) throw new Error('A player cannot play themselves');
  if (winnerId !== playerAId && winnerId !== playerBId) throw new Error('Winner must be one of the players');

  const playerARef = doc(db, 'players', playerAId);
  const playerBRef = doc(db, 'players', playerBId);
  const matchRef = doc(matchesCollection);

  return runTransaction(db, async (transaction) => {
    const [playerADoc, playerBDoc] = await Promise.all([
      transaction.get(playerARef),
      transaction.get(playerBRef),
    ]);

    if (!playerADoc.exists() || !playerBDoc.exists()) throw new Error('Players not found');

    const playerA = toPlayer(playerAId, playerADoc.data());
    const playerB = toPlayer(playerBId, playerBDoc.data());
    const winnerIsA = winnerId === playerAId;
    const elo = calculateMatchElo(playerA.elo, playerB.elo, winnerIsA ? 'A' : 'B');
    const winner = winnerIsA ? playerA : playerB;
    const loser = winnerIsA ? playerB : playerA;
    const winnerDelta = winnerIsA ? elo.deltaA : elo.deltaB;
    const now = Date.now();

    const updatedA = {
      elo: elo.newRatingA,
      peakElo: Math.max(playerA.peakElo, elo.newRatingA),
      wins: playerA.wins + (winnerIsA ? 1 : 0),
      losses: playerA.losses + (winnerIsA ? 0 : 1),
      currentStreak: winnerIsA ? (playerA.currentStreak > 0 ? playerA.currentStreak + 1 : 1) : (playerA.currentStreak < 0 ? playerA.currentStreak - 1 : -1),
      bestWinStreak: winnerIsA ? Math.max(playerA.bestWinStreak, playerA.currentStreak > 0 ? playerA.currentStreak + 1 : 1) : playerA.bestWinStreak,
      breakAndRuns: playerA.breakAndRuns + (winnerIsA && modifiers.eightOnBreak ? 1 : 0),
      recentForm: [winnerIsA ? 'W' : 'L', ...playerA.recentForm.slice(0, 4)],
    };
    const updatedB = {
      elo: elo.newRatingB,
      peakElo: Math.max(playerB.peakElo, elo.newRatingB),
      wins: playerB.wins + (winnerIsA ? 0 : 1),
      losses: playerB.losses + (winnerIsA ? 1 : 0),
      currentStreak: !winnerIsA ? (playerB.currentStreak > 0 ? playerB.currentStreak + 1 : 1) : (playerB.currentStreak < 0 ? playerB.currentStreak - 1 : -1),
      bestWinStreak: !winnerIsA ? Math.max(playerB.bestWinStreak, playerB.currentStreak > 0 ? playerB.currentStreak + 1 : 1) : playerB.bestWinStreak,
      breakAndRuns: playerB.breakAndRuns + (!winnerIsA && modifiers.eightOnBreak ? 1 : 0),
      recentForm: [winnerIsA ? 'L' : 'W', ...playerB.recentForm.slice(0, 4)],
    };

    const matchData = {
      playerAId,
      playerAName: playerA.name,
      playerBId,
      playerBName: playerB.name,
      winnerId,
      loserId: winnerIsA ? playerBId : playerAId,
      playerAEloBefore: playerA.elo,
      playerAEloAfter: elo.newRatingA,
      playerBEloBefore: playerB.elo,
      playerBEloAfter: elo.newRatingB,
      eloDelta: Math.abs(winnerDelta),
      eloExchanged: Math.abs(winnerDelta),
      isUpset: elo.isUpset,
      modifiers,
      timestamp: serverTimestamp(),
    };

    transaction.update(playerARef, updatedA);
    transaction.update(playerBRef, updatedB);
    transaction.set(matchRef, matchData);

    const match = toMatch(matchRef.id, { ...matchData, timestamp: new Date(now).toISOString() });
    const updatedPlayers = [
      toPlayer(playerAId, { ...playerADoc.data(), ...updatedA }),
      toPlayer(playerBId, { ...playerBDoc.data(), ...updatedB }),
    ];

    return {
      match,
      updatedPlayers,
      winnerName: winner.name,
      loserName: loser.name,
      eloDelta: Math.abs(winnerDelta),
      winnerNewElo: winnerIsA ? elo.newRatingA : elo.newRatingB,
      loserNewElo: winnerIsA ? elo.newRatingB : elo.newRatingA,
      isUpset: elo.isUpset,
    };
  });
}

export async function getPlayerFunStats(playerId: string) {
  const matches = await getMatches();
  const opponentStats = new Map<string, { losses: number; wins: number }>();

  for (const match of matches) {
    if (match.playerAId !== playerId && match.playerBId !== playerId) continue;
    const opponentId = match.playerAId === playerId ? match.playerBId : match.playerAId;
    const stats = opponentStats.get(opponentId) ?? { losses: 0, wins: 0 };
    if (match.loserId === playerId) stats.losses += 1;
    if (match.winnerId === playerId) stats.wins += 1;
    opponentStats.set(opponentId, stats);
  }

  const archNemesis = [...opponentStats.entries()]
    .sort(([, left], [, right]) => right.losses - left.losses)[0]?.[0] ?? null;
  const biggestUpset = matches
    .filter((match) => match.winnerId === playerId)
    .sort((left, right) => right.eloDelta - left.eloDelta)[0] ?? null;

  return { archNemesis, biggestUpset };
}
