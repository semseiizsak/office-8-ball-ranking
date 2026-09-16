import { BallPreference, MatchModifier } from '../types';
import { addPlayer, getLeaderboard, getMatches, logMatch } from './firebase';

export const poolService = {
  getPlayers: getLeaderboard,
  getMatches,
  addPlayer,
  logMatch: (params: {
    playerAId: string;
    playerBId: string;
    winnerId: string;
    modifiers: MatchModifier;
  }) => logMatch(params.playerAId, params.playerBId, params.winnerId, params.modifiers),
};

export type AddPlayerParams = {
  name: string;
  department?: string;
  title?: string;
  ballPreference: BallPreference;
};
