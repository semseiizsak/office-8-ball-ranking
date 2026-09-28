import {
  BallPreference,
  ChallengeStakes,
  ChallengeStatus,
  MatchModifier,
  Player,
  Season,
  SeasonStanding,
  SeasonTitle,
} from '../types';
import {
  addMatchComment,
  addPlayer,
  addPrediction,
  cancelChallenge,
  createChallenge,
  startChallenge,
  startInstantMatch,
  deleteMatch,
  deleteMatchComment,
  getChallenges,
  reconcileChallengesWithMatches,
  getLeaderboard,
  getMatches,
  getSeasons,
  scheduleSeasonEnd,
  revertLiveChallenge,
  sendCheer,
  sendChatMessage,
  setMatchReaction,
  startNewSeason,
  logMatch,
  resolveChallenge,
  respondToChallenge,
  subscribeToChallenges,
  subscribeToCheers,
  subscribeToChatMessages,
  subscribeToMatches,
  subscribeToMatchComments,
  updateMatchWinner,
  updatePlayer,
} from './firebase';

export const poolService = {
  getPlayers: getLeaderboard,
  getMatches,
  addPlayer,
  updatePlayer,
  updateMatchWinner: (matchId: string, season: Season, winnerId: string) =>
    updateMatchWinner(matchId, season, winnerId),
  deleteMatch: (matchId: string, season: Season) => deleteMatch(matchId, season),
  getSeasons,
  scheduleSeasonEnd,
  startNewSeason: (params: { current: Season; standings: SeasonStanding[]; titles: SeasonTitle[] }) =>
    startNewSeason(params),
  getChallenges,
  reconcileChallengesWithMatches,
  subscribeToChallenges,
  createChallenge: (params: { challenger: Player; opponent: Player; stakes: ChallengeStakes }) =>
    createChallenge(params),
  respondToChallenge: (challengeId: string, status: Extract<ChallengeStatus, 'accepted' | 'declined'>) =>
    respondToChallenge(challengeId, status),
  cancelChallenge,
  startChallenge,
  startInstantMatch,
  revertLiveChallenge,
  sendCheer,
  subscribeToCheers,
  sendChatMessage,
  subscribeToChatMessages,
  addPrediction,
  resolveChallenge,
  logMatch: (params: {
    playerAId: string;
    playerBId: string;
    winnerId: string;
    modifiers: MatchModifier;
    challengeId?: string;
    winnerBall?: 'solids' | 'stripes';
  }) => logMatch(params.playerAId, params.playerBId, params.winnerId, params.modifiers, params.challengeId, params.winnerBall),
  setMatchReaction,
  subscribeToMatches,
  subscribeToMatchComments,
  addMatchComment,
  deleteMatchComment,
};

export type AddPlayerParams = {
  name: string;
  department?: string;
  title?: string;
  ballPreference: BallPreference;
};
