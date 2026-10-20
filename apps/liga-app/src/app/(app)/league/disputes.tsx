// M16.2 Admin dispute queue: needs an admin, still with the players, resolved.
import { router, useFocusEffect } from 'expo-router';
import { Handshake } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { assignToMe, disputeQueue, type QueueCard } from '@/lib/confirm';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Button, Card, Empty, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { ago, reasonLabel, sideNames, versionText } from '@/ui/confirm-kit';
import { Header } from '@/ui/list-row';

type Queue = Awaited<ReturnType<typeof disputeQueue>>;

export default function Disputes() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const [q, setQ] = useState<Queue | null>(null);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { if (league && session) setQ(await disputeQueue(session.user, league.id)); }, [league, session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!league || !session) return null;

  const card = (c: QueueCard, decide: boolean) => {
    const x = c.dispute, m = c.match;
    const assigned = x.assigned_to ? members.find((y) => y.id === x.assigned_to)?.display_name : null;
    return (
      <Card key={x.id} style={{ gap: space[2] }} onPress={() => router.push(`/league/dispute/${x.id}`)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{sideNames(m, 'a', members)} vs {sideNames(m, 'b', members)}</T>
          {x.status === 'resolved' ? <Pill label="Resolved" /> : x.status === 'escalated' ? <Pill label="Needs you" tone="warning" /> : <Pill label="With players" />}
        </View>
        <T v="small" c="text2">{reasonLabel(x)}, {ago(x.created_at)}</T>
        {x.kind !== 'no_show' ? (
          <>
            <T v="small">{c.logger}: {versionText(m, { winner: m.winner, score_a: m.score_a, score_b: m.score_b }, members)}</T>
            <T v="small">{c.opener}: {x.proposal ? versionText(m, x.proposal, members) : reasonLabel(x)}</T>
          </>
        ) : <T v="small">{c.opener} says {sideNames(m, 'b', members)} did not show up.</T>}
        {assigned ? <T v="caption" c="text3">{assigned} is looking at this</T> : null}
        {decide && !c.involved ? (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {!x.assigned_to ? <Button label="Assign to me" size="sm" variant="secondary" onPress={async () => { await assignToMe(session.user, x.id, league.id); load(); }} /> : null}
            <Button label="Decide" size="sm" onPress={() => router.push(`/league/dispute/${x.id}`)} />
          </View>
        ) : decide && c.involved ? <T v="caption" c="text3">You are in this match, so another admin decides.</T> : null}
      </Card>
    );
  };

  const open = q ? [...q.escalated.map((c) => card(c, true)), ...q.open.map((c) => card(c, false))] : [];
  const done = q ? q.resolved.map((c) => card(c, false)) : [];
  const list = tab === 'open' ? open : done;

  return (
    <Screen>
      <Header title="Disputes" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.text2} />}>
        <Seg value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }]} />
        {q && !q.admin ? <T v="small" c="text2">Owners and admins decide disputes.</T> : null}
        {!q ? <Skeleton h={160} /> : list.length ? list : <Empty icon={Handshake} title="No disputes" body="Everyone's playing nice." />}
        {me && q?.admin && tab === 'open' && q.open.length ? <T v="caption" c="text3">Disputes with the players move here when their time to agree runs out.</T> : null}
      </ScrollView>
    </Screen>
  );
}
