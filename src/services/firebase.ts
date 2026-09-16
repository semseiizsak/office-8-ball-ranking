import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  increment,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Challenge,
  ChallengeStakes,
  ChallengeStatus,
  MatchModifier,
  MatchRecord,
  Player,
  Prediction,
} from '../types';
import { calculateMatchElo } from '../utils/elo';
import { bountyForReign, runLeagueReplay, CHALLENGE_EXPIRY_HOURS } from '../utils/league';

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
export const messaging = getMessaging(app);

const playersCollection = collection(db, 'players');
const matchesCollection = collection(db, 'matches');
const challengesCollection = collection(db, 'challenges');
/** Single document holding who wears the crown and since when. */
const leagueStateRef = doc(db, 'league', 'state');

const timestampToIso = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
};

const timestampToMillis = (value: unknown): number | null => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
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
  lastPlayedAt: timestampToMillis(data.lastPlayedAt),
  predictionsCorrect: Number(data.predictionsCorrect ?? 0),
  predictionsTotal: Number(data.predictionsTotal ?? 0),
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
  bountyCollected: Number(data.bountyCollected ?? 0),
  challengeId: data.challengeId ? String(data.challengeId) : undefined,
  modifiers: {
    eightOnBreak: Boolean((data.modifiers as Record<string, unknown> | undefined)?.eightOnBreak),
    scratchOnEight: Boolean((data.modifiers as Record<string, unknown> | undefined)?.scratchOnEight),
    tableRun: Boolean((data.modifiers as Record<string, unknown> | undefined)?.tableRun),
  },
});

interface LeagueState {
  crownHolderId: string | null;
  crownSince: number | null;
}

const toLeagueState = (data: Record<string, unknown> | undefined): LeagueState => ({
  crownHolderId: data?.crownHolderId ? String(data.crownHolderId) : null,
  crownSince: timestampToMillis(data?.crownSince),
});

/** Whoever sits top of the ladder among players who have actually played. */
const leaderOf = (standings: Array<{ id: string; elo: number; played: number }>): string | null =>
  standings
    .filter((entry) => entry.played > 0)
    .sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id))[0]?.id ?? null;

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
    lastPlayedAt: null,
    predictionsCorrect: 0,
    predictionsTotal: 0,
    createdAt: serverTimestamp(),
  };

  await setDoc(playerRef, playerData);
  return toPlayer(playerRef.id, { ...playerData, createdAt: new Date().toISOString() });
}

export async function updatePlayer(
  playerId: string,
  updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference'>
): Promise<void> {
  await updateDoc(doc(db, 'players', playerId), {
    name: updates.name.trim(),
    department: updates.department?.trim() || 'General Pool Contender',
    title: updates.title?.trim() || 'Pool Contender',
    avatarUrl: updates.avatarUrl,
    ballPreference: updates.ballPreference,
  });
}

export async function getLeaderboard(): Promise<Player[]> {
  const snapshot = await getDocs(query(playersCollection, orderBy('elo', 'desc')));
  return snapshot.docs.map((playerDoc) => toPlayer(playerDoc.id, playerDoc.data()));
}

export async function getMatches(): Promise<MatchRecord[]> {
  const snapshot = await getDocs(query(matchesCollection, orderBy('timestamp', 'desc')));
  return snapshot.docs.map((matchDoc) => toMatch(matchDoc.id, matchDoc.data()));
}


export interface MatchMutationResult {
  players: Player[];
  matches: MatchRecord[];
}

/**
 * Rebuilds every rating from the full match history.
 *
 * Runs the same replay the app uses to derive titles, so a corrected result
 * produces exactly the ratings the matches would have produced if they had been
 * logged correctly the first time — crown reigns and bounties included.
 */
async function mutateMatch(matchId: string, winnerId?: string): Promise<MatchMutationResult> {
  const [playerIndex, matchIndex] = await Promise.all([
    getDocs(playersCollection),
    getDocs(matchesCollection),
  ]);
  const playerRefs = playerIndex.docs.map((playerDoc) => doc(db, 'players', playerDoc.id));
  const matchRefs = matchIndex.docs.map((matchDoc) => doc(db, 'matches', matchDoc.id));

  return runTransaction(db, async (transaction) => {
    const [playerSnapshot, matchSnapshot] = await Promise.all([
      Promise.all(playerRefs.map((playerRef) => transaction.get(playerRef))),
      Promise.all(matchRefs.map((matchRef) => transaction.get(matchRef))),
    ]);

    const existingMatch = matchSnapshot.find((matchDoc) => matchDoc.id === matchId);
    if (!existingMatch) throw new Error('Match not found');

    const roster = playerSnapshot.map((playerDoc) => toPlayer(playerDoc.id, playerDoc.data()));
    const existingMatches = matchSnapshot.map((matchDoc) => toMatch(matchDoc.id, matchDoc.data()));
    const nextMatches = existingMatches
      .filter((match) => match.id !== matchId)
      .concat(winnerId ? [{ ...toMatch(existingMatch.id, existingMatch.data()), winnerId }] : []);

    const replay = runLeagueReplay(roster.map((player) => player.id), nextMatches);
    const rebuiltMatches = new Map(replay.matches.map((match) => [match.id, match]));

    const players = roster.map((player) => {
      const member = replay.members.get(player.id);
      if (!member) return player;
      return {
        ...player,
        elo: member.elo,
        peakElo: member.peakElo,
        wins: member.wins,
        losses: member.losses,
        currentStreak: member.currentStreak,
        bestWinStreak: member.bestWinStreak,
        breakAndRuns: member.breakAndRuns,
        recentForm: member.recentForm,
        lastPlayedAt: member.lastPlayedAt,
      };
    });

    for (const player of players) {
      transaction.update(doc(db, 'players', player.id), {
        elo: player.elo,
        peakElo: player.peakElo,
        wins: player.wins,
        losses: player.losses,
        currentStreak: player.currentStreak,
        bestWinStreak: player.bestWinStreak,
        breakAndRuns: player.breakAndRuns,
        recentForm: player.recentForm,
        lastPlayedAt: player.lastPlayedAt,
      });
    }

    if (winnerId) {
      for (const match of rebuiltMatches.values()) {
        transaction.update(doc(db, 'matches', match.id), {
          winnerId: match.winnerId,
          loserId: match.loserId,
          playerAEloBefore: match.playerAEloBefore,
          playerAEloAfter: match.playerAEloAfter,
          playerBEloBefore: match.playerBEloBefore,
          playerBEloAfter: match.playerBEloAfter,
          eloDelta: match.eloDelta,
          eloExchanged: match.eloDelta,
          bountyCollected: match.bountyCollected,
          isUpset: match.isUpset,
        });
      }
    } else {
      transaction.delete(doc(db, 'matches', matchId));
    }

    // The replay is authoritative for the crown too, so an edited or deleted
    // match cannot leave a stale holder wearing a bounty they never earned.
    const openReign = [...replay.reigns].reverse().find((reign) => reign.endedAt === null) ?? null;
    transaction.set(leagueStateRef, {
      crownHolderId: openReign?.playerId ?? null,
      crownSince: openReign?.startedAt ?? null,
      updatedAt: serverTimestamp(),
    });

    return {
      players,
      matches: [...rebuiltMatches.values()].sort((left, right) => right.timestamp - left.timestamp),
    };
  });
}

export const updateMatchWinner = (matchId: string, winnerId: string) => mutateMatch(matchId, winnerId);
export const deleteMatch = (matchId: string) => mutateMatch(matchId);

export interface LogMatchResult {
  match: MatchRecord;
  players: Player[];
  winnerName: string;
  loserName: string;
  eloDelta: number;
  bountyCollected: number;
  winnerNewElo: number;
  loserNewElo: number;
  isUpset: boolean;
  crownChangedHands: boolean;
  newCrownHolderId: string | null;
}

/**
 * Records a result and settles everything that hangs off it.
 *
 * Reads the whole roster inside the transaction because the crown is defined by
 * the standings: we need every rating to know who tops the ladder once the
 * result lands. That is bounded by office size, unlike reading match history.
 */
export async function logMatch(
  playerAId: string,
  playerBId: string,
  winnerId: string,
  modifiers: MatchModifier = { eightOnBreak: false, scratchOnEight: false, tableRun: false },
  challengeId?: string
): Promise<LogMatchResult> {
  if (playerAId === playerBId) throw new Error('A player cannot play themselves');
  if (winnerId !== playerAId && winnerId !== playerBId) throw new Error('Winner must be one of the players');

  const playerIndex = await getDocs(playersCollection);
  const playerRefs = playerIndex.docs.map((playerDoc) => doc(db, 'players', playerDoc.id));
  const matchRef = doc(matchesCollection);

  return runTransaction(db, async (transaction) => {
    const playerDocs = await Promise.all(playerRefs.map((playerRef) => transaction.get(playerRef)));
    const stateDoc = await transaction.get(leagueStateRef);
    const state = toLeagueState(stateDoc.data());

    const roster = new Map(
      playerDocs.map((playerDoc) => [playerDoc.id, toPlayer(playerDoc.id, playerDoc.data())])
    );
    const playerA = roster.get(playerAId);
    const playerB = roster.get(playerBId);
    if (!playerA || !playerB) throw new Error('Players not found');

    const now = Date.now();
    const winnerIsA = winnerId === playerAId;
    const winner = winnerIsA ? playerA : playerB;
    const loser = winnerIsA ? playerB : playerA;
    const elo = calculateMatchElo(playerA.elo, playerB.elo, winnerIsA ? 'A' : 'B');
    const gained = Math.abs(winnerIsA ? elo.deltaA : elo.deltaB);

    // Taking down the crown also collects whatever the reign has accrued. It is
    // moved off the holder rather than minted, so the ladder stays closed.
    const bounty =
      state.crownHolderId === loser.id && state.crownSince !== null
        ? bountyForReign(now - state.crownSince)
        : 0;

    const winnerElo = winner.elo + gained + bounty;
    const loserElo = Math.max(100, loser.elo - gained - bounty);

    const nextWinner: Player = {
      ...winner,
      elo: winnerElo,
      peakElo: Math.max(winner.peakElo, winnerElo),
      wins: winner.wins + 1,
      currentStreak: winner.currentStreak > 0 ? winner.currentStreak + 1 : 1,
      bestWinStreak: Math.max(winner.bestWinStreak, winner.currentStreak > 0 ? winner.currentStreak + 1 : 1),
      breakAndRuns: winner.breakAndRuns + (modifiers.eightOnBreak ? 1 : 0),
      recentForm: ['W', ...winner.recentForm.slice(0, 4)],
      lastPlayedAt: now,
    };
    const nextLoser: Player = {
      ...loser,
      elo: loserElo,
      peakElo: Math.max(loser.peakElo, loserElo),
      losses: loser.losses + 1,
      currentStreak: loser.currentStreak < 0 ? loser.currentStreak - 1 : -1,
      recentForm: ['L', ...loser.recentForm.slice(0, 4)],
      lastPlayedAt: now,
    };

    roster.set(nextWinner.id, nextWinner);
    roster.set(nextLoser.id, nextLoser);

    const players = [...roster.values()];
    const newLeader = leaderOf(
      players.map((player) => ({ id: player.id, elo: player.elo, played: player.wins + player.losses }))
    );
    const crownChangedHands = newLeader !== state.crownHolderId;

    const matchData = {
      playerAId,
      playerAName: playerA.name,
      playerBId,
      playerBName: playerB.name,
      winnerId,
      loserId: loser.id,
      playerAEloBefore: playerA.elo,
      playerAEloAfter: winnerIsA ? winnerElo : loserElo,
      playerBEloBefore: playerB.elo,
      playerBEloAfter: winnerIsA ? loserElo : winnerElo,
      eloDelta: gained,
      eloExchanged: gained,
      bountyCollected: bounty,
      isUpset: elo.isUpset,
      ...(challengeId ? { challengeId } : {}),
      modifiers,
      timestamp: serverTimestamp(),
    };

    const writePlayer = (player: Player) =>
      transaction.update(doc(db, 'players', player.id), {
        elo: player.elo,
        peakElo: player.peakElo,
        wins: player.wins,
        losses: player.losses,
        currentStreak: player.currentStreak,
        bestWinStreak: player.bestWinStreak,
        breakAndRuns: player.breakAndRuns,
        recentForm: player.recentForm,
        lastPlayedAt: player.lastPlayedAt,
      });

    writePlayer(nextWinner);
    writePlayer(nextLoser);
    transaction.set(matchRef, matchData);

    if (crownChangedHands) {
      transaction.set(leagueStateRef, {
        crownHolderId: newLeader,
        crownSince: now,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      match: toMatch(matchRef.id, { ...matchData, timestamp: new Date(now).toISOString() }),
      players,
      winnerName: winner.name,
      loserName: loser.name,
      eloDelta: gained,
      bountyCollected: bounty,
      winnerNewElo: winnerElo,
      loserNewElo: loserElo,
      isUpset: elo.isUpset,
      crownChangedHands,
      newCrownHolderId: newLeader,
    };
  });
}

const toPredictions = (data: Record<string, unknown> | undefined): Prediction[] => {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data as Record<string, Record<string, unknown>>)
    .map(([predictorId, entry]) => ({
      id: predictorId,
      predictorId,
      predictorName: String(entry?.predictorName ?? 'Someone'),
      predictedWinnerId: String(entry?.predictedWinnerId ?? ''),
      createdAt: timestampToMillis(entry?.createdAt) ?? 0,
    }))
    .filter((prediction) => prediction.predictedWinnerId !== '')
    .sort((left, right) => left.createdAt - right.createdAt);
};

const toChallenge = (id: string, data: Record<string, unknown>, now: number): Challenge => {
  const stored = String(data.status ?? 'pending') as ChallengeStatus;
  const expiresAt = timestampToMillis(data.expiresAt) ?? 0;
  // A lapsed challenge reads as expired without anyone having to sweep the
  // collection, which keeps this working on Firestore's free tier.
  const status: ChallengeStatus = stored === 'pending' && now > expiresAt ? 'expired' : stored;

  return {
    id,
    challengerId: String(data.challengerId ?? ''),
    challengerName: String(data.challengerName ?? ''),
    opponentId: String(data.opponentId ?? ''),
    opponentName: String(data.opponentName ?? ''),
    status,
    createdAt: timestampToMillis(data.createdAt) ?? 0,
    expiresAt,
    respondedAt: timestampToMillis(data.respondedAt),
    stakes: {
      challengerElo: Number((data.stakes as Record<string, unknown>)?.challengerElo ?? 1000),
      opponentElo: Number((data.stakes as Record<string, unknown>)?.opponentElo ?? 1000),
      challengerRank: Number((data.stakes as Record<string, unknown>)?.challengerRank ?? 0),
      opponentRank: Number((data.stakes as Record<string, unknown>)?.opponentRank ?? 0),
      challengerWinDelta: Number((data.stakes as Record<string, unknown>)?.challengerWinDelta ?? 0),
      opponentWinDelta: Number((data.stakes as Record<string, unknown>)?.opponentWinDelta ?? 0),
      challengerIsUnderdog: Boolean((data.stakes as Record<string, unknown>)?.challengerIsUnderdog),
      crownBounty: Number((data.stakes as Record<string, unknown>)?.crownBounty ?? 0),
    },
    matchId: data.matchId ? String(data.matchId) : null,
    resolvedWinnerId: data.resolvedWinnerId ? String(data.resolvedWinnerId) : null,
    predictions: toPredictions(data.predictions as Record<string, unknown> | undefined),
  };
};

export async function getChallenges(): Promise<Challenge[]> {
  const snapshot = await getDocs(query(challengesCollection, orderBy('createdAt', 'desc')));
  const now = Date.now();
  return snapshot.docs.map((challengeDoc) => toChallenge(challengeDoc.id, challengeDoc.data(), now));
}

/**
 * Live challenge feed. Predictions live in a map on the challenge document so a
 * single listener carries the whole arena, and one player can only ever hold one
 * open call per match.
 */
export function subscribeToChallenges(onChange: (challenges: Challenge[]) => void): () => void {
  return onSnapshot(query(challengesCollection, orderBy('createdAt', 'desc')), (snapshot) => {
    const now = Date.now();
    onChange(snapshot.docs.map((challengeDoc) => toChallenge(challengeDoc.id, challengeDoc.data(), now)));
  });
}

export async function createChallenge(params: {
  challenger: Player;
  opponent: Player;
  stakes: ChallengeStakes;
}): Promise<Challenge> {
  const challengeRef = doc(challengesCollection);
  const now = Date.now();
  const data = {
    challengerId: params.challenger.id,
    challengerName: params.challenger.name,
    opponentId: params.opponent.id,
    opponentName: params.opponent.name,
    status: 'pending' as ChallengeStatus,
    createdAt: now,
    expiresAt: now + CHALLENGE_EXPIRY_HOURS * 3_600_000,
    respondedAt: null,
    stakes: params.stakes,
    matchId: null,
    resolvedWinnerId: null,
    predictions: {},
  };
  await setDoc(challengeRef, data);
  return toChallenge(challengeRef.id, data, now);
}

export async function respondToChallenge(
  challengeId: string,
  status: Extract<ChallengeStatus, 'accepted' | 'declined'>
): Promise<void> {
  await updateDoc(doc(db, 'challenges', challengeId), {
    status,
    respondedAt: Date.now(),
  });
}

export async function cancelChallenge(challengeId: string): Promise<void> {
  await updateDoc(doc(db, 'challenges', challengeId), {
    status: 'cancelled' satisfies ChallengeStatus,
    respondedAt: Date.now(),
  });
}

/**
 * Records a spectator's call. Keyed by predictor, so changing your mind
 * overwrites rather than stuffing the ballot.
 */
export async function addPrediction(params: {
  challengeId: string;
  predictorId: string;
  predictorName: string;
  predictedWinnerId: string;
}): Promise<void> {
  await updateDoc(doc(db, 'challenges', params.challengeId), {
    [`predictions.${params.predictorId}`]: {
      predictorName: params.predictorName,
      predictedWinnerId: params.predictedWinnerId,
      createdAt: Date.now(),
    },
  });
}

/**
 * Closes a challenge against the match that settled it and books every
 * spectator's call, right or wrong, onto their own record.
 */
export async function resolveChallenge(params: {
  challengeId: string;
  matchId: string;
  winnerId: string;
}): Promise<void> {
  const challengeRef = doc(db, 'challenges', params.challengeId);
  const snapshot = await getDoc(challengeRef);
  if (!snapshot.exists()) return;

  const challenge = toChallenge(snapshot.id, snapshot.data(), Date.now());
  if (challenge.status === 'played') return;

  const batch = writeBatch(db);
  batch.update(challengeRef, {
    status: 'played' satisfies ChallengeStatus,
    matchId: params.matchId,
    resolvedWinnerId: params.winnerId,
  });

  for (const prediction of challenge.predictions) {
    batch.update(doc(db, 'players', prediction.predictorId), {
      predictionsTotal: increment(1),
      predictionsCorrect: increment(prediction.predictedWinnerId === params.winnerId ? 1 : 0),
    });
  }

  await batch.commit();
}
