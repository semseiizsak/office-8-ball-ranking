import { initializeApp } from 'firebase/app';
import { getMessaging, Messaging } from 'firebase/messaging';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
  ChatMessage,
  Cheer,
  MatchComment,
  MatchModifier,
  MatchRecord,
  Player,
  Prediction,
  Season,
  SeasonStanding,
  SeasonTitle,
} from '../types';
import { calculateMatchElo } from '../utils/elo';
import { firebaseConfig } from './firebaseConfig';
import {
  bountyForReign,
  runLeagueReplay,
  softResetElo,
  matchesInSeason,
  CHALLENGE_EXPIRY_HOURS,
  IMPLICIT_SEASON,
} from '../utils/league';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

let messagingInstance: Messaging | null = null;

/**
 * Messaging, or null when this browser or this build cannot support it.
 *
 * Deliberately lazy. Creating it eagerly at module scope meant a browser
 * without push support — or a deployment built without the Firebase
 * environment variables — threw while the module was still evaluating, so
 * React never mounted and the whole app rendered as a blank page. Push is an
 * optional extra and must never be able to take the league down with it.
 */
export function getMessagingOrNull(): Messaging | null {
  if (messagingInstance) return messagingInstance;
  try {
    messagingInstance = getMessaging(app);
  } catch (error) {
    console.warn('Push messaging unavailable:', error);
    messagingInstance = null;
  }
  return messagingInstance;
}

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
  reactions: Object.fromEntries(
    Object.entries((data.reactions as Record<string, unknown>) ?? {}).map(([playerId, emoji]) => [
      playerId,
      String(emoji),
    ])
  ),
  commentCount: Number(data.commentCount ?? 0),
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

/**
 * Live match feed, kept fresh so a reaction or comment posted by someone
 * else shows up without a reload — the whole point of a feed people gather
 * around rather than a static history list.
 */
export function subscribeToMatches(onChange: (matches: MatchRecord[]) => void): () => void {
  return onSnapshot(query(matchesCollection, orderBy('timestamp', 'desc')), (snapshot) => {
    onChange(snapshot.docs.map((matchDoc) => toMatch(matchDoc.id, matchDoc.data())));
  });
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
async function mutateMatch(
  matchId: string,
  season: Season,
  winnerId?: string
): Promise<MatchMutationResult> {
  const [playerIndex, matchIndex] = await Promise.all([
    getDocs(playersCollection),
    getDocs(matchesCollection),
  ]);
  const playerRefs = playerIndex.docs.map((playerDoc) => doc(db, 'players', playerDoc.id));
  const matchRefs = matchIndex.docs.map((matchDoc) => doc(db, 'matches', matchDoc.id));
  const challengeIndex = await getDocs(challengesCollection);
  const challengeRefs = challengeIndex.docs.map((challengeDoc) => doc(db, 'challenges', challengeDoc.id));

  return runTransaction(db, async (transaction) => {
    const [playerSnapshot, matchSnapshot, challengeSnapshot] = await Promise.all([
      Promise.all(playerRefs.map((playerRef) => transaction.get(playerRef))),
      Promise.all(matchRefs.map((matchRef) => transaction.get(matchRef))),
      Promise.all(challengeRefs.map((challengeRef) => transaction.get(challengeRef))),
    ]);

    const existingMatch = matchSnapshot.find((matchDoc) => matchDoc.id === matchId);
    if (!existingMatch) throw new Error('Match not found');

    const roster = playerSnapshot.map((playerDoc) => toPlayer(playerDoc.id, playerDoc.data()));
    const existingMatches = matchSnapshot.map((matchDoc) => toMatch(matchDoc.id, matchDoc.data()));

    // Only the running season is replayable. An archived season's standings are
    // a record of what happened and must not move under a later correction.
    const target = existingMatches.find((match) => match.id === matchId)!;
    if (matchesInSeason([target], season).length === 0) {
      throw new Error('That match belongs to a closed season and can no longer be edited');
    }

    const seasonMatches = matchesInSeason(existingMatches, season);
    const nextMatches = seasonMatches
      .filter((match) => match.id !== matchId)
      .concat(winnerId ? [{ ...target, winnerId }] : []);

    const replay = runLeagueReplay(roster.map((player) => player.id), nextMatches, season.startingElo);
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
      if (target.challengeId) {
        const linkedChallenge = challengeSnapshot.find((challengeDoc) => challengeDoc.id === target.challengeId);
        if (linkedChallenge?.exists()) {
          transaction.update(doc(db, 'challenges', target.challengeId), {
            status: 'cancelled' satisfies ChallengeStatus,
            matchId: null,
            respondedAt: Date.now(),
          });
        }
      }
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

export const updateMatchWinner = (matchId: string, season: Season, winnerId: string) =>
  mutateMatch(matchId, season, winnerId);
export const deleteMatch = (matchId: string, season: Season) => mutateMatch(matchId, season);

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

  // The standings are read OUTSIDE the transaction, on purpose. They are only
  // needed to work out who ends up on top, and pulling every player into the
  // transaction's read set meant any concurrent write to any player aborted and
  // retried it. Two people logging at once — or one person double-tapping —
  // could stall the app for seconds. The transaction below touches exactly the
  // two players it changes, and the crown is re-derived from scratch whenever a
  // match is edited, so a stale reading here cannot become permanent.
  const rosterSnapshot = await getDocs(playersCollection);
  const others = rosterSnapshot.docs
    .map((playerDoc) => toPlayer(playerDoc.id, playerDoc.data()))
    .filter((player) => player.id !== playerAId && player.id !== playerBId);

  const playerARef = doc(db, 'players', playerAId);
  const playerBRef = doc(db, 'players', playerBId);
  const matchRef = doc(matchesCollection);

  return runTransaction(db, async (transaction) => {
    const [playerADoc, playerBDoc, stateDoc] = await Promise.all([
      transaction.get(playerARef),
      transaction.get(playerBRef),
      transaction.get(leagueStateRef),
    ]);
    const state = toLeagueState(stateDoc.data());

    if (!playerADoc.exists() || !playerBDoc.exists()) throw new Error('Players not found');
    const playerA = toPlayer(playerAId, playerADoc.data());
    const playerB = toPlayer(playerBId, playerBDoc.data());

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
        ? bountyForReign(state.crownSince, now)
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

    const players = [...others, nextWinner, nextLoser];
    const newLeader = leaderOf(
      players.map((player) => ({ id: player.id, elo: player.elo, played: player.wins + player.losses }))
    );
    const crownChangedHands = newLeader !== state.crownHolderId;
    // Paying the bounty restarts the reign even when the holder keeps top spot,
    // so the same pot cannot be collected twice.
    const reignRestarts = crownChangedHands || bounty > 0;

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
      transaction.update(player.id === playerAId ? playerARef : playerBRef, {
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

    if (reignRestarts) {
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
    startedAt: timestampToMillis(data.startedAt),
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

/** Cancels challenges whose settled match was removed from the event log. */
export async function reconcileChallengesWithMatches(): Promise<void> {
  const [challengeSnapshot, matchSnapshot] = await Promise.all([
    getDocs(challengesCollection),
    getDocs(matchesCollection),
  ]);
  const matchIds = new Set(matchSnapshot.docs.map((matchDoc) => matchDoc.id));
  const batch = writeBatch(db);
  let changes = 0;
  for (const challengeDoc of challengeSnapshot.docs) {
    const challenge = toChallenge(challengeDoc.id, challengeDoc.data(), Date.now());
    if (challenge.status === 'played' && challenge.matchId && !matchIds.has(challenge.matchId)) {
      batch.update(challengeDoc.ref, {
        status: 'cancelled' satisfies ChallengeStatus,
        matchId: null,
        resolvedWinnerId: null,
        respondedAt: Date.now(),
      });
      changes += 1;
    }
  }
  if (changes > 0) await batch.commit();
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
  const existing = await getDocs(query(challengesCollection, orderBy('createdAt', 'desc')));
  const activeStatuses: ChallengeStatus[] = ['pending', 'accepted'];
  const hasActiveChallenge = existing.docs.some((challengeDoc) => {
    const challenge = toChallenge(challengeDoc.id, challengeDoc.data(), Date.now());
    return activeStatuses.includes(challenge.status) &&
      (challenge.challengerId === params.challenger.id ||
        challenge.opponentId === params.challenger.id ||
        challenge.challengerId === params.opponent.id ||
        challenge.opponentId === params.opponent.id);
  });
  if (hasActiveChallenge) {
    throw new Error('One of these players already has an active challenge.');
  }
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
    startedAt: null,
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
  const challengeRef = doc(db, 'challenges', challengeId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists()) throw new Error('Challenge not found');
    const challenge = toChallenge(snapshot.id, snapshot.data(), Date.now());
    if (challenge.status !== 'pending') throw new Error('This challenge is no longer waiting for a response.');
    if (status === 'accepted') {
      const active = await getDocs(query(challengesCollection, orderBy('createdAt', 'desc')));
      const conflicting = active.docs.some((challengeDoc) => {
        if (challengeDoc.id === challengeId) return false;
        const other = toChallenge(challengeDoc.id, challengeDoc.data(), Date.now());
        return ['pending', 'accepted'].includes(other.status) &&
          (other.challengerId === challenge.opponentId || other.opponentId === challenge.opponentId);
      });
      if (conflicting) throw new Error('You already have another active challenge.');
    }
    transaction.update(challengeRef, { status, respondedAt: Date.now() });
  });
}

/**
 * Marks a match as being played. Either player can call it on — deliberately no
 * agreement step, because a match that needs both people to tap before it counts
 * is a match that gets stranded when one of them does not.
 */
export async function startChallenge(challengeId: string): Promise<void> {
  await updateDoc(doc(db, 'challenges', challengeId), {
    status: 'live' satisfies ChallengeStatus,
    startedAt: Date.now(),
  });
}

/**
 * Backs a live match out to agreed-but-not-started, rather than cancelling
 * the challenge outright — a false start or a table opening up somewhere
 * else shouldn't cost the two of them the challenge itself, just the clock.
 */
export async function revertLiveChallenge(challengeId: string): Promise<void> {
  const challengeRef = doc(db, 'challenges', challengeId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists()) return;
    const challenge = toChallenge(snapshot.id, snapshot.data(), Date.now());
    if (challenge.status !== 'live') return;
    transaction.update(challengeRef, {
      status: 'accepted' satisfies ChallengeStatus,
      startedAt: null,
    });
  });
}

/**
 * A cheer on a live match: written, shown, and thrown away. Deleting it a
 * few seconds later from the sender's own client keeps the collection from
 * growing forever without needing a server-side sweep for something this
 * disposable.
 */
export async function sendCheer(params: {
  challengeId: string;
  playerId: string;
  playerName: string;
  emoji: string;
}): Promise<void> {
  const cheerRef = doc(collection(db, 'challenges', params.challengeId, 'cheers'));
  await setDoc(cheerRef, {
    playerId: params.playerId,
    playerName: params.playerName,
    emoji: params.emoji,
    createdAt: Date.now(),
  });
  window.setTimeout(() => {
    deleteDoc(cheerRef).catch(() => undefined);
  }, 5000);
}

export function subscribeToCheers(
  challengeId: string,
  onChange: (cheers: Cheer[]) => void
): () => void {
  const cheersCollection = collection(db, 'challenges', challengeId, 'cheers');
  return onSnapshot(query(cheersCollection, orderBy('createdAt', 'asc')), (snapshot) => {
    onChange(
      snapshot.docs.map((cheerDoc) => {
        const data = cheerDoc.data();
        return {
          id: cheerDoc.id,
          playerId: String(data.playerId ?? ''),
          playerName: String(data.playerName ?? 'Someone'),
          emoji: String(data.emoji ?? '🔥'),
          createdAt: timestampToMillis(data.createdAt) ?? 0,
        };
      })
    );
  });
}

/**
 * Live chat on a match, Twitch-style: it scrolls with the game rather than
 * living on afterward the way a match comment does. Kept in a subcollection
 * of the challenge, so it comes along for free whenever the challenge itself
 * is eventually cleaned up.
 */
export async function sendChatMessage(params: {
  challengeId: string;
  authorId: string;
  authorName: string;
  text: string;
}): Promise<void> {
  const text = params.text.trim().slice(0, 280);
  if (!text) return;
  await addDoc(collection(db, 'challenges', params.challengeId, 'chat'), {
    authorId: params.authorId,
    authorName: params.authorName,
    text,
    createdAt: Date.now(),
  });
}

export function subscribeToChatMessages(
  challengeId: string,
  onChange: (messages: ChatMessage[]) => void
): () => void {
  const chatCollection = collection(db, 'challenges', challengeId, 'chat');
  return onSnapshot(query(chatCollection, orderBy('createdAt', 'asc')), (snapshot) => {
    onChange(
      snapshot.docs.map((messageDoc) => {
        const data = messageDoc.data();
        return {
          id: messageDoc.id,
          authorId: String(data.authorId ?? ''),
          authorName: String(data.authorName ?? 'Someone'),
          text: String(data.text ?? ''),
          createdAt: timestampToMillis(data.createdAt) ?? 0,
        };
      })
    );
  });
}

export async function cancelChallenge(challengeId: string): Promise<void> {
  const challengeRef = doc(db, 'challenges', challengeId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists()) throw new Error('Challenge not found');
    const challenge = toChallenge(snapshot.id, snapshot.data(), Date.now());
    if (!['pending', 'accepted'].includes(challenge.status)) return;
    transaction.update(challengeRef, {
      status: 'cancelled' satisfies ChallengeStatus,
      respondedAt: Date.now(),
      matchId: null,
    });
  });
}

/**
 * Records a spectator's call. Once cast, predictions are locked in and
 * cannot be changed or switched.
 */
export async function addPrediction(params: {
  challengeId: string;
  predictorId: string;
  predictorName: string;
  predictedWinnerId: string;
  isLock?: boolean;
}): Promise<void> {
  const challengeRef = doc(db, 'challenges', params.challengeId);
  const snap = await getDoc(challengeRef);
  if (snap.exists()) {
    const existing = snap.data()?.predictions?.[params.predictorId];
    if (existing) {
      return;
    }
  }
  await updateDoc(challengeRef, {
    [`predictions.${params.predictorId}`]: {
      predictorName: params.predictorName,
      predictedWinnerId: params.predictedWinnerId,
      isLock: params.isLock === true,
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

  // Nothing is written to the callers. Recording the winner on the challenge is
  // all a nerve rating needs, because it is rebuilt from the challenges.

  await batch.commit();
}

const seasonsCollection = collection(db, 'seasons');

const toSeason = (id: string, data: Record<string, unknown>): Season => ({
  id,
  number: Number(data.number ?? 1),
  name: String(data.name ?? `Season ${Number(data.number ?? 1)}`),
  startedAt: timestampToMillis(data.startedAt) ?? 0,
  endedAt: timestampToMillis(data.endedAt),
  startingElo: (data.startingElo as Record<string, number>) ?? {},
  standings: Array.isArray(data.standings) ? (data.standings as SeasonStanding[]) : [],
  titles: Array.isArray(data.titles) ? (data.titles as SeasonTitle[]) : [],
});

export async function getSeasons(): Promise<Season[]> {
  const snapshot = await getDocs(query(seasonsCollection, orderBy('number', 'desc')));
  return snapshot.docs.map((seasonDoc) => toSeason(seasonDoc.id, seasonDoc.data()));
}

/**
 * Closes the running season and opens the next one.
 *
 * Final standings and titles are archived first, then ratings are softly reset
 * so the next season starts closer together without throwing away everything
 * the league learned. Wins, losses and streaks start clean; the hall of fame
 * keeps the record of what happened.
 */
export async function startNewSeason(params: {
  current: Season;
  standings: SeasonStanding[];
  titles: SeasonTitle[];
}): Promise<{ players: Player[]; seasons: Season[] }> {
  const playerIndex = await getDocs(playersCollection);
  const playerRefs = playerIndex.docs.map((playerDoc) => doc(db, 'players', playerDoc.id));
  // An implicit season has no document yet, so it gets one now as it closes.
  const closingRef = params.current.id === IMPLICIT_SEASON.id
    ? doc(seasonsCollection)
    : doc(db, 'seasons', params.current.id);
  const nextRef = doc(seasonsCollection);

  await runTransaction(db, async (transaction) => {
    const playerDocs = await Promise.all(playerRefs.map((playerRef) => transaction.get(playerRef)));
    const roster = playerDocs.map((playerDoc) => toPlayer(playerDoc.id, playerDoc.data()));
    const endedAt = Date.now();

    const startingElo: Record<string, number> = {};
    for (const player of roster) startingElo[player.id] = softResetElo(player.elo);

    transaction.set(closingRef, {
      number: params.current.number,
      name: params.current.name,
      startedAt: params.current.startedAt,
      endedAt,
      startingElo: params.current.startingElo,
      standings: params.standings,
      titles: params.titles,
    });

    transaction.set(nextRef, {
      number: params.current.number + 1,
      name: `Season ${params.current.number + 1}`,
      startedAt: endedAt,
      endedAt: null,
      startingElo,
      standings: [],
      titles: [],
    });

    for (const player of roster) {
      const reset = startingElo[player.id];
      transaction.update(doc(db, 'players', player.id), {
        elo: reset,
        peakElo: reset,
        wins: 0,
        losses: 0,
        currentStreak: 0,
        bestWinStreak: 0,
        breakAndRuns: 0,
        recentForm: [],
        lastPlayedAt: null,
      });
    }

    // A new season starts with the crown vacant.
    transaction.set(leagueStateRef, {
      crownHolderId: null,
      crownSince: null,
      updatedAt: serverTimestamp(),
    });
  });

  const [players, seasons] = await Promise.all([getLeaderboard(), getSeasons()]);
  return { players, seasons };
}

/**
 * One reaction per player per match, Slack-emoji-style: tapping the emoji
 * you already picked clears it, tapping another swaps it. No thread, no
 * moderation surface — just a cheap way to react to a result in passing.
 */
export async function setMatchReaction(
  matchId: string,
  playerId: string,
  emoji: string | null
): Promise<void> {
  await updateDoc(doc(db, 'matches', matchId), {
    [`reactions.${playerId}`]: emoji === null ? deleteField() : emoji,
  });
}

const toMatchComment = (id: string, data: Record<string, unknown>): MatchComment => ({
  id,
  authorId: String(data.authorId ?? ''),
  authorName: String(data.authorName ?? 'Someone'),
  text: String(data.text ?? ''),
  imageDataUrl: data.imageDataUrl ? String(data.imageDataUrl) : null,
  createdAt: timestampToMillis(data.createdAt) ?? 0,
});

/** Live comment thread for one match, oldest first like any chat. */
export function subscribeToMatchComments(
  matchId: string,
  onChange: (comments: MatchComment[]) => void
): () => void {
  const commentsCollection = collection(db, 'matches', matchId, 'comments');
  return onSnapshot(query(commentsCollection, orderBy('createdAt', 'asc')), (snapshot) => {
    onChange(snapshot.docs.map((commentDoc) => toMatchComment(commentDoc.id, commentDoc.data())));
  });
}

/**
 * Posts a comment under a match. commentCount lives on the match itself so
 * the feed can show "4 comments" without opening the thread to count it.
 */
export async function addMatchComment(params: {
  matchId: string;
  authorId: string;
  authorName: string;
  text: string;
  imageDataUrl?: string | null;
}): Promise<void> {
  const commentRef = doc(collection(db, 'matches', params.matchId, 'comments'));
  const batch = writeBatch(db);
  batch.set(commentRef, {
    authorId: params.authorId,
    authorName: params.authorName,
    text: params.text,
    imageDataUrl: params.imageDataUrl ?? null,
    createdAt: Date.now(),
  });
  batch.update(doc(db, 'matches', params.matchId), { commentCount: increment(1) });
  await batch.commit();
}

export async function deleteMatchComment(matchId: string, commentId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'matches', matchId, 'comments', commentId));
  batch.update(doc(db, 'matches', matchId), { commentCount: increment(-1) });
  await batch.commit();
}
