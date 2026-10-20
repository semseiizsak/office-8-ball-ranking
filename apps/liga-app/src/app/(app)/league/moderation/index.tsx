// K11 Moderation queue (B4.8 admin row): open, auto hidden and resolved reports, muted members, log, chat settings
import { router, useFocusEffect, type Href } from 'expo-router';
import { MessageSquareText, ScrollText, ShieldCheck, ShieldHalf, VolumeX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { ago } from '@/lib/challenges';
import { keepReported } from '@/lib/chat';
import { moderationHome, type ReportGroup, type Segment } from '@/lib/moderation';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Button, Card, Empty, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { RemoveSheet } from '@/ui/chat-kit';
import { Group, Header, Row } from '@/ui/list-row';

type Home = Awaited<ReturnType<typeof moderationHome>>;
const OUTCOME = { removed: 'Removed', kept: 'Kept', open: 'Open' } as const;

export default function Moderation() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members } = useLeague();
  const [h, setH] = useState<Home | undefined>(undefined);
  const [seg, setSeg] = useState<Segment>('open');
  const [removeFor, setRemoveFor] = useState<{ kind: 'message' | 'comment'; id: string; author: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { if (session && league) setH(await moderationHome(session.user, league.id)); }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? 'Former player';
  const detail = (g: ReportGroup) => router.push({ pathname: '/league/moderation/report', params: { id: g.target_id } });
  const content = (g: ReportGroup) => g.target === 'message' || g.target === 'comment';

  const card = (g: ReportGroup) => (
    <Card key={g.target_id} onPress={() => detail(g)} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="label" style={{ flex: 1 }} numberOfLines={1}>{nameOf(g.author)}, {g.target}</T>
        <T v="caption" c="text3">{ago(g.at)}</T>
      </View>
      <T c="text2" numberOfLines={3}>{g.snapshot || 'No text'}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
        <Pill label={`Reported by ${g.count} ${g.count === 1 ? 'member' : 'members'}`} tone="warning" />
        {g.segment === 'hidden' ? <Pill label="Auto hidden" /> : null}
        {g.escalated ? <Pill label="Escalated to Liga team" tone="brand" /> : null}
        {g.segment === 'resolved' ? <Pill label={OUTCOME[g.outcome]} /> : null}
      </View>
      <T v="caption" c="text3">{g.reasons.join(', ')}</T>
      {g.segment !== 'resolved' ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {content(g) ? <Button label="Remove" size="md" variant="danger" onPress={() => setRemoveFor({ kind: g.target as 'message' | 'comment', id: g.target_id, author: nameOf(g.author) })} /> : null}
          <Button label={content(g) ? 'Keep' : 'Mark handled'} size="md" variant="secondary" onPress={async () => { await keepReported(session!.user, league!.id, g.target_id); load(); }} />
          <Button label="More" size="md" variant="ghost" onPress={() => detail(g)} />
        </View>
      ) : null}
    </Card>
  );

  const open = h ? h.counts.open + h.counts.hidden : 0;
  const shown = h?.groups.filter((g) => g.segment === seg) ?? [];

  return (
    <Screen>
      <Header title="Moderation" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.text2} />}>
        {h === undefined ? <View style={{ gap: space[2] }}>{[0, 1].map((i) => <Skeleton key={i} h={150} />)}</View> : !h ? (
          <Empty icon={ShieldHalf} title="For owners and admins" body="Admins look after reports, mutes and the chat rules here." />
        ) : (
          <>
            <T c="text2">{open ? `${open} open ${open === 1 ? 'report' : 'reports'}` : 'All clear'}</T>
            <Seg value={seg} onChange={setSeg} options={[
              { value: 'open', label: `Open ${h.counts.open}` }, { value: 'hidden', label: `Hidden ${h.counts.hidden}` }, { value: 'resolved', label: 'Resolved' },
            ]} />
            {shown.length ? shown.map(card) : (
              <Empty icon={ShieldCheck} title={seg === 'resolved' ? 'Nothing resolved yet' : 'Nothing to review'} body="Reports from members show up here." />
            )}
            <Group>
              <Row first icon={VolumeX} label="Muted members" value={String(h.muted)} onPress={() => router.push('/league/moderation/muted' as Href)} />
              <Row icon={ScrollText} label="Moderation log" onPress={() => router.push('/league/moderation/log' as Href)} />
              {isOn(league, 'chat') ? <Row icon={MessageSquareText} label="Chat settings" onPress={() => router.push('/chat-info')} /> : null}
              {__DEV__ ? <Row icon={ShieldHalf} label="Liga team queue" value="Internal" onPress={() => router.push('/league/moderation/platform' as Href)} /> : null}
            </Group>
          </>
        )}
      </ScrollView>
      <RemoveSheet item={removeFor} onClose={() => setRemoveFor(null)} onDone={load} />
    </Screen>
  );
}
