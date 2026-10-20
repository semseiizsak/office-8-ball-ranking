// K12.3 Trust and safety queue (Liga team, internal stub until the web admin): escalations and reports past the 24 hour SLA.
// Only reachable in development builds from the Moderation screen.
import { useFocusEffect } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { platformAct, platformQueue, SLA_H } from '@/lib/moderation';
import { space } from '@/theme';
import { Button, Card, Empty, Pill, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Q = Awaited<ReturnType<typeof platformQueue>>;
type Esc = Q['escalations'][number];
type Late = Q['late'][number];

const due = (ms: number) => (ms <= 0 ? `Over ${SLA_H} h` : ms >= 3600000 ? `${Math.floor(ms / 3600000)} h left` : `${Math.max(1, Math.floor(ms / 60000))} min left`);

export default function Platform() {
  const [q, setQ] = useState<Q | null>(null);
  const load = useCallback(async () => setQ(await platformQueue()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (e: Esc, outcome: 'removed' | 'suspended' | 'dismissed') => {
    try { await platformAct(e.id, outcome); load(); } catch (err) { Alert.alert("Couldn't do that", err instanceof Error ? err.message : 'Try again.'); }
  };

  const escCard = (e: Esc) => (
    <Card key={e.id} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="label" style={{ flex: 1 }} numberOfLines={1}>{e.league}, {e.author}</T>
        {e.status === 'open' ? <Pill label={due(e.dueIn)} tone={e.dueIn <= 0 ? 'live' : 'warning'} /> : <Pill label={e.outcome ?? 'Done'} />}
      </View>
      <T c="text2" numberOfLines={3}>{e.snapshot || 'No text'}</T>
      <T v="caption" c="text3">{e.reason}{e.note ? `. Admin note: ${e.note}` : ''}</T>
      {e.status === 'open' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button label="Remove" size="md" variant="danger" onPress={() => act(e, 'removed')} />
          <Button label="Suspend" size="md" variant="secondary" onPress={() => act(e, 'suspended')} />
          <Button label="Keep" size="md" variant="ghost" onPress={() => act(e, 'dismissed')} />
        </View>
      ) : null}
    </Card>
  );

  const lateCard = (g: Late) => (
    <Card key={g.target_id} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="label" style={{ flex: 1 }} numberOfLines={1}>{g.league}, {g.target}</T>
        <Pill label={due(g.dueIn)} tone="live" />
      </View>
      <T c="text2" numberOfLines={3}>{g.snapshot || 'No text'}</T>
      <T v="caption" c="text3">{g.reasons.join(', ')}, reported by {g.count}</T>
    </Card>
  );

  return (
    <Screen>
      <Header title="Liga team queue" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <T v="small" c="text2">Internal. Escalated reports and league reports nobody handled within {SLA_H} hours. Suspension is recorded only for now.</T>
        {!q ? <Skeleton h={140} /> : !q.escalations.length && !q.late.length ? (
          <Empty icon={ShieldCheck} title="Queue is empty" body="Escalations from league admins land here." />
        ) : (
          <>
            {q.escalations.map(escCard)}
            {q.late.length ? <T v="heading">Past {SLA_H} hours</T> : null}
            {q.late.map(lateCard)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
