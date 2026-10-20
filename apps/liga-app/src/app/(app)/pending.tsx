// M3.4 Pending results: waiting for you, waiting for others, and for admins all pending in the league.
import { router, useFocusEffect } from 'expo-router';
import { CheckCheck, CircleCheck, UserX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';

import { confirmAll, pendingLists, type PendingItem } from '@/lib/confirm';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Button, Empty, Screen, Seg, Skeleton, T } from '@/ui';
import { left } from '@/ui/confirm-kit';
import { Header } from '@/ui/list-row';
import { MatchCard } from '@/ui/match-card';

type Lists = Awaited<ReturnType<typeof pendingLists>>;
type Tab = 'you' | 'others' | 'all';

export default function Pending() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me, refresh } = useLeague();
  const [lists, setLists] = useState<Lists | null>(null);
  const [tab, setTab] = useState<Tab>('you');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { if (league && session) setLists(await pendingLists(session.user, league.id)); }, [league, session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!league || !session) return null;
  const rows = lists ? (tab === 'all' ? lists.all ?? [] : lists[tab]) : [];
  const confirmable = (lists?.you ?? []).filter((x) => x.canConfirm);

  const line = (x: PendingItem) => {
    const d = x.dispute;
    const text = d?.kind === 'no_show' ? `No show reported, ${left(x.due)} to reply`
      : d ? (d.status === 'escalated' ? 'With an admin' : `Disputed, ${left(x.due)} left to agree`)
      : `${x.logger} logged this, ${lists?.rules.mode === 'required' ? `expires in ${left(x.due)}` : `counts in ${left(x.due)}`}`;
    return (
      <View key={x.match.id} style={{ gap: space[1] }}>
        <MatchCard match={x.match} members={members} meId={me?.id} onPress={() => router.push(`/confirm/${x.match.id}`)} />
        <T v="caption" c="text3" style={{ paddingHorizontal: space[1] }}>{text}</T>
      </View>
    );
  };

  const all = () => Alert.alert(`Confirm ${confirmable.length} results?`, 'Ratings update in the order the matches were played.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm all', onPress: async () => {
      setBusy(true);
      try { await confirmAll(session.user, league.id, confirmable.map((x) => x.match.id)); await Promise.all([load(), refresh()]); } catch { Alert.alert('That did not work', 'Try again in a moment.'); }
      setBusy(false);
    } },
  ]);

  const options: { value: Tab; label: string }[] = [{ value: 'you', label: 'Your turn' }, { value: 'others', label: 'Their turn' }];
  if (lists?.all) options.push({ value: 'all', label: 'All' });

  return (
    <Screen>
      <Header title="Pending results" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.text2} />}>
        <Seg value={tab} onChange={setTab} options={options} />
        {!lists ? [0, 1].map((i) => <Skeleton key={i} h={150} />)
          : rows.length ? rows.map(line)
          : <Empty icon={CircleCheck} title="Nothing to confirm" body={tab === 'others' ? 'Nobody owes you a confirmation.' : "You're all square."} />}
        {tab === 'you' && confirmable.length >= 3 && lists?.rules.mode === 'auto' ? <Button label="Confirm all" icon={CheckCheck} loading={busy} onPress={all} /> : null}
        <Button label="Report a no show" icon={UserX} variant="ghost" onPress={() => router.push('/walkover')} />
      </ScrollView>
    </Screen>
  );
}
