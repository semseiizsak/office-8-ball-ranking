import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { leagueMembers, myLeagues } from '@/lib/api';
import type { League, Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';

type Ctx = {
  ready: boolean;
  leagues: League[];
  league: League | null;
  members: Member[];
  me: Member | null;
  select: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  reloadLeagues: (selectId?: string) => Promise<void>;
};
const LeagueContext = createContext<Ctx>(null as never);
export const useLeague = () => useContext(LeagueContext);

const KEY = 'liga.currentLeague';

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const reloadLeagues = useCallback(async (selectId?: string) => {
    if (!uid) return;
    const list = await myLeagues(uid);
    setLeagues(list);
    const saved = selectId ?? (await AsyncStorage.getItem(KEY));
    const pick = list.find((l) => l.id === saved)?.id ?? list[0]?.id ?? null;
    setCurrentId(pick);
    if (pick) await AsyncStorage.setItem(KEY, pick);
    setReadyFor(uid);
  }, [uid]);

  const refresh = useCallback(async () => {
    if (!currentId) return;
    setMembers(await leagueMembers(currentId));
  }, [currentId]);

  // Both loaders only set state after an await (network), never synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reloadLeagues(); }, [reloadLeagues]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const select = useCallback(async (id: string) => {
    setCurrentId(id);
    await AsyncStorage.setItem(KEY, id);
  }, []);

  const value = useMemo<Ctx>(() => ({
    ready: readyFor === uid, leagues,
    league: leagues.find((l) => l.id === currentId) ?? null,
    members,
    me: members.find((m) => m.user_id === uid) ?? null,
    select, refresh, reloadLeagues,
  }), [readyFor, leagues, currentId, members, uid, select, refresh, reloadLeagues]);

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}
