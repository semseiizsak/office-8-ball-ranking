import React, { createContext, useContext, useMemo } from 'react';
import { MatchRecord, Season } from '../../types';
import { buildPrevLookup, PrevLookup, PrevSeason } from '../../utils/seasonHistory';
import { Tournament } from '../../utils/tournament';

const none: PrevLookup = () => null;
const History = createContext<PrevLookup>(none);

/** Lets every card on screen read the season before its own without each one being handed the league. */
export const CardHistoryProvider: React.FC<{ seasons: Season[]; matches: MatchRecord[]; tournaments: Tournament[]; children: React.ReactNode }> = ({
  seasons,
  matches,
  tournaments,
  children,
}) => {
  const lookup = useMemo(() => buildPrevLookup(seasons, matches, tournaments), [seasons, matches, tournaments]);
  return <History.Provider value={lookup}>{children}</History.Provider>;
};

/** Null on a first season, or for a player who did not play the one before. */
export const usePrevSeason = (seasonId: string, playerId: string | undefined): PrevSeason | null => {
  const lookup = useContext(History);
  return playerId ? lookup(seasonId, playerId) : null;
};
