import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Swords } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { myChallenges, type Challenge } from '@/lib/challenges';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space } from '@/theme';
import { Empty, IconButton, Screen, Seg, Skeleton, T } from '@/ui';
import { ChallengeRow } from '@/ui/challenge-row';

type Tab = 'received' | 'sent' | 'scheduled' | 'past';
const EMPTY: Record<Tab, string> = {
  received: 'Nobody has called you out yet.', sent: 'Challenges you send wait here for an answer.',
  scheduled: 'Accepted challenges show up here until you log them.', past: 'Played, declined and expired challenges end up here.',
};

// M7.4 My challenges: Received, Sent, Scheduled, Past.
export default function MyChallenges() {
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [tab, setTab] = useState<Tab>('received');

  const load = useCallback(async () => {
    if (league && session) setRows(await myChallenges(session.user, league.id));
  }, [league, session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const list = (rows ?? []).filter((c) =>
    tab === 'received' ? c.status === 'pending' && c.to === me?.id
      : tab === 'sent' ? c.status === 'pending' && c.from === me?.id
        : tab === 'scheduled' ? c.status === 'accepted' : !['pending', 'accepted'].includes(c.status));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="section">My challenges</T>
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[2] }}
        ListHeaderComponent={<View style={{ marginBottom: space[2] }}>
          <Seg value={tab} onChange={setTab} options={[{ value: 'received', label: 'Received' }, { value: 'sent', label: 'Sent' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'past', label: 'Past' }]} />
        </View>}
        renderItem={({ item }) => <ChallengeRow c={item} members={members} meId={me?.id} />}
        ListEmptyComponent={rows ? <Empty icon={Swords} title="No challenges here" body={EMPTY[tab]} /> : <View style={{ gap: space[2] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={72} />)}</View>}
      />
    </Screen>
  );
}
