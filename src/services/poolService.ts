import { BallPreference, ChallengeStakes, ChallengeStatus, MatchModifier, Player } from '../types';
import {
  addPlayer,
  addPrediction,
  cancelChallenge,
  createChallenge,
  deleteMatch,
  getChallenges,
  getLeaderboard,
  getLeagueState,
  getMatches,
  logMatch,
  resolveChallenge,
  respondToChallenge,
  subscribeToChallenges,
  updateMatchWinner,
  updatePlayer,
} from './firebase';

export const poolService = {
  getPlayers: getLeaderboard,
  getMatches,
  getLeagueState,
  addPlayer,
  updatePlayer,
  updateMatchWinner,
  deleteMatch,
  getChallenges,
  subscribeToChallenges,
  createChallenge: (params: { challenger: Player; opponent: Player; stakes: ChallengeStakes }) =>
    createChallenge(params),
  respondToChallenge: (challengeId: string, status: Extract<ChallengeStatus, 'accepted' | 'declined'>) =>
    respondToChallenge(challengeId, status),
  cancelChallenge,
  addPrediction,
  resolveChallenge,
  logMatch: (params: {
    playerAId: string;
    playerBId: string;
    winnerId: string;
    modifiers: MatchModifier;
    challengeId?: string;
  }) => logMatch(params.playerAId, params.playerBId, params.winnerId, params.modifiers, params.challengeId),
};

export type AddPlayerParams = {
  name: string;
  department?: string;
  title?: string;
  ballPreference: BallPreference;
};
