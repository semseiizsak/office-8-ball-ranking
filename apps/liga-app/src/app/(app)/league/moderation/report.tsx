// K11.1 Report detail: snapshot, context, author history, reasons, and the decision (remove, keep, mute, remove member, escalate)
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { ago } from '@/lib/challenges';
import { keepReported } from '@/lib/chat';
import { escalate, removeFromLeague, reportDetail, untilLabel } from '@/lib/moderation';
import { clock } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Empty, Field, Pill, Screen, Skeleton, T } from '@/ui';
import { RemoveSheet, Sheet } from '@/ui/chat-kit';
import { Header } from '@/ui/list-row';

type Detail = Awaited<ReturnType<typeof reportDetail>>;
type Line = NonNullable<Detail>['context'][number];

export default function ReportDetail() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, refresh } = useLeague();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<Detail | undefined>(undefined);
  const [removing, setRemoving] = useState(false);
  const [escOpen, setEscOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !league) return;
    try { setD(await reportDetail(session.user, league.id, id)); } catch { setD(null); }
  }, [session, league, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await load(); } catch (e) { Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.'); }
    setBusy(null);
  };

  if (d === undefined) return <Screen><Header title="Report" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={120} /><Skeleton h={180} /></View></Screen>;
  if (!d || !session || !league) return <Screen><Header title="Report" /><Empty icon={ShieldAlert} title="Report not found" body="It may have been handled already." /></Screen>;

  const g = d.group, a = d.author;
  const first = a?.display_name.split(' ')[0] ?? 'them';
  const nameOf = (mid: string | null) => members.find((m) => m.id === mid)?.display_name ?? 'Former player';
  const open = g.outcome === 'open';
  const isContent = d.kind && !d.removed;

  const removeMember = () => a && Alert.alert(`Remove ${a.display_name} from ${league.name}?`, 'Their matches stay in the history. You can bring them back from Members.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => run('member', async () => { await removeFromLeague(session.user, league.id, a.id, g.target_id); await refresh(); }) },
  ]);

  const line = (x: Line) => (
    <View key={x.id} style={{ gap: 2, padding: space[3], borderRadius: radius.sm, backgroundColor: x.self ? t.surface2 : 'transparent' }}>
      <T v="label" c={x.self ? 'text' : 'text2'}>{nameOf(x.author)}, {clock(x.at)}</T>
      <T c={x.self ? 'text' : 'text2'}>{x.body}</T>
    </View>
  );

  return (
    <Screen>
      <Header title="Report" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <Card style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <T v="label" style={{ flex: 1 }}>{a?.display_name ?? 'Former player'}, {g.target}</T>
            <T v="caption" c="text3">{ago(g.at)}</T>
          </View>
          <T>{g.snapshot || 'No text'}</T>
          {d.authorDeleted ? <T v="small" c="text2">{first} deleted this. The snapshot is kept for 30 days.</T> : null}
          {d.removed ? <T v="small" c="text2">Removed. Members see Removed by an admin.</T> : null}
          {d.handled ? <T v="small" c="text2">Handled by {d.handled.by} {ago(d.handled.at).toLowerCase()}.</T> : null}
          {d.escalation ? <Pill label={d.escalation.status === 'open' ? 'Escalated to Liga team' : `Liga team: ${d.escalation.outcome}`} tone="brand" /> : null}
        </Card>

        {d.context.length > 1 ? (
          <View style={{ gap: space[1] }}>
            <T v="heading">Context</T>
            {d.context.map(line)}
          </View>
        ) : null}

        <View style={{ gap: space[2] }}>
          <T v="heading">{a?.display_name ?? 'Author'}</T>
          <T c="text2">{d.authorReports} {d.authorReports === 1 ? 'report' : 'reports'} in 30 days{d.mutedBefore ? `, muted ${d.mutedBefore} ${d.mutedBefore === 1 ? 'time' : 'times'} before` : ''}</T>
          {d.mutedNow ? <T v="small" c="text2">Muted now, {untilLabel(d.mutedNow.until)}.</T> : null}
        </View>

        <View style={{ gap: space[2] }}>
          <T v="heading">Why it was reported</T>
          <T c="text2">{d.reasons.map((r) => `${r.reason} ${r.n}`).join(', ')}</T>
          {d.notes.map((n, i) => <Card key={i}><T v="small" c="text2">{n}</T></Card>)}
          <T v="caption" c="text3">Reporters stay anonymous, also to admins.</T>
        </View>

        {!d.canDecide && open ? (
          <Card><T v="small" c="text2">{a?.id === d.me.id ? 'You wrote this, so another admin or the owner decides.' : 'An admin wrote this, so the owner or the Liga team decides.'}</T></Card>
        ) : null}

        <View style={{ gap: space[2] }}>
          {open && d.canDecide && isContent ? <Button label="Remove content" variant="danger" onPress={() => setRemoving(true)} /> : null}
          {open && d.canDecide ? <Button label="Keep" variant="secondary" loading={busy === 'keep'} onPress={() => run('keep', () => keepReported(session.user, league.id, g.target_id))} /> : null}
          {a && d.canDecide && !a.status && a.role !== 'owner' ? <Button label={d.mutedNow ? `${first} is muted` : `Mute ${first}`} variant="secondary" disabled={!!d.mutedNow}
            onPress={() => router.push({ pathname: '/league/moderation/mute', params: { member: a.id } })} /> : null}
          {a && d.canDecide && !a.status && a.role !== 'owner' ? <Button label={`Remove ${first} from league`} variant="ghost" loading={busy === 'member'} onPress={removeMember} /> : null}
          {!d.escalation ? <Button label="Escalate to Liga team" variant="ghost" onPress={() => setEscOpen(true)} /> : null}
        </View>
      </ScrollView>

      <RemoveSheet item={removing && d.kind ? { kind: d.kind, id: g.target_id, author: a?.display_name ?? 'The author' } : null} onClose={() => setRemoving(false)} onDone={load} />
      <Sheet visible={escOpen} onClose={() => setEscOpen(false)} title="Send to the Liga team?">
        <T c="text2">For illegal content, threats, or when an admin is involved. We look at it within 24 hours.</T>
        <Field label="Note for the Liga team" value={note} onChangeText={setNote} maxLength={500} multiline placeholder="Optional" />
        <Button label="Escalate" full loading={busy === 'esc'} onPress={() => run('esc', async () => { await escalate(session.user, league.id, g.target_id, note); setEscOpen(false); })} />
        <Button label="Cancel" variant="ghost" full onPress={() => setEscOpen(false)} />
      </Sheet>
    </Screen>
  );
}
