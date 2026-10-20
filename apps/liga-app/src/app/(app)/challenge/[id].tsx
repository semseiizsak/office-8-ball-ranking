import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, Swords } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  ago, cancelChallenge, CANCEL_REASONS, dateLabel, DECLINE_REASONS, getChallenge, REPLY_HOURS, respondChallenge, stakesFor, timeLeft, whenLabel, type Challenge,
} from '@/lib/challenges';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, IconButton, Pill, Screen, Skeleton, T } from '@/ui';

// M9 challenge states: M9.1 Received, M9.2 Sent, M9.3 Accepted, M9.4 Expired, M9.5 Decline and Declined, M9.6 Cancelled.
export default function ChallengeDetail() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { members, me } = useLeague();
  const [c, setC] = useState<Challenge | null | undefined>(undefined);
  const [panel, setPanel] = useState<'decline' | 'cancel' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [now, setNow] = useState(0);
  const load = useCallback(async () => { setC(await getChallenge(id)); setNow(Date.now()); }, [id]);
  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]));

  const back = <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}><IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} /></View>;
  if (c === undefined) return <Screen>{back}<View style={{ padding: space[4], gap: space[3] }}><Skeleton h={180} /><Skeleton h={90} /></View></Screen>;
  if (!c) return <Screen>{back}<Empty icon={Swords} title="Challenge not found" body="It may have been removed." /></Screen>;

  const byId = new Map(members.map((m) => [m.id, m]));
  const from = byId.get(c.from), to = byId.get(c.to);
  const mine = c.from === me?.id, forMe = c.to === me?.id;
  const otherId = mine ? c.to : c.from;
  const other = byId.get(otherId);
  const on = (x: string | undefined) => (x === me?.id ? 'You' : x ? byId.get(x)?.display_name ?? 'Someone' : 'Someone');
  const s = stakesFor(c, me?.id);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try { await f(); } catch { /* state moved on, reload shows it */ }
    setBusy(false); setPanel(null); setReason(null);
    load();
  };

  // Headline and sub line per state, from my side.
  const head = (): [string, string] => {
    switch (c.status) {
      case 'pending': return forMe ? [`${on(c.from)} challenged you`, ago(c.created_at)] : [`${mine ? 'You' : on(c.from)} challenged ${on(c.to)}`, 'Delivered'];
      case 'accepted': return [forMe ? 'You accepted' : `${on(c.to)} accepted`, 'Stakes locked'];
      case 'expired': return c.after_accept ? ['Not played', `Ended ${whenLabel(c.ended_at!)}`] : mine ? [`${on(c.to)} did not reply`, `Ended ${whenLabel(c.ended_at!)}`] : ['This challenge expired', `Ended ${whenLabel(c.ended_at!)}`];
      case 'declined': return mine ? [`${on(c.to)} passed this time`, whenLabel(c.ended_at!)] : ['You passed this time', whenLabel(c.ended_at!)];
      case 'cancelled': return [c.cancelled_by === me?.id ? 'You cancelled' : `${on(c.cancelled_by ?? undefined)} cancelled${c.reason ? `: ${c.reason.toLowerCase()}` : ''}`, whenLabel(c.ended_at!)];
      case 'played': return ['Played', whenLabel(c.ended_at!)];
    }
  };
  const [title, sub] = head();
  const closed = !['pending', 'accepted'].includes(c.status);

  const player = (id: string) => {
    const m = byId.get(id);
    return m ? (
      <Pressable key={id} accessibilityRole="button" accessibilityLabel={m.display_name} onPress={() => router.push(`/player/${m.id}`)} style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={64} />
        <T v="label" numberOfLines={1}>{on(id)}</T>
        <T v="caption" c="text3">{fmt(m.rating)}</T>
      </Pressable>
    ) : <View key={id} style={{ flex: 1 }} />;
  };

  const stake = (label: string, value: string, win?: boolean) => (
    <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.sm, paddingVertical: space[3], alignItems: 'center', gap: 2 }}>
      <T v="number" c={win && !closed ? 'win' : closed ? 'text2' : 'text'}>{value}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );

  const reasonPills = (list: string[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      {list.map((r) => (
        <Pressable key={r} accessibilityRole="button" accessibilityState={{ selected: reason === r }} onPress={() => setReason(reason === r ? null : r)}
          style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill, justifyContent: 'center', backgroundColor: reason === r ? t.primary : t.surface2 }}>
          <T v="label" c={reason === r ? 'onPrimary' : 'text'}>{r}</T>
        </Pressable>
      ))}
    </View>
  );

  const actions = () => {
    if (panel === 'decline') return (
      <Card style={{ gap: space[3] }}>
        <T v="heading">Pass on this one?</T>
        {reasonPills(DECLINE_REASONS)}
        {reason === 'Busy this week' ? <T v="small" c="text2">We will say you are back next Monday.</T> : null}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Back" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => { setPanel(null); setReason(null); }} />
          <Button label="Decline" size="md" style={{ flex: 1 }} loading={busy} onPress={() => run(() => respondChallenge(session!.user, c.id, false, reason))} />
        </View>
      </Card>
    );
    if (panel === 'cancel') return (
      <Card style={{ gap: space[3] }}>
        <T v="heading">Cancel challenge?</T>
        <T v="small" c="text2">Pick a reason so {other?.display_name} knows.</T>
        {reasonPills(CANCEL_REASONS)}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Keep it" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => { setPanel(null); setReason(null); }} />
          <Button label="Cancel challenge" size="md" style={{ flex: 1 }} loading={busy} disabled={!reason} onPress={() => run(() => cancelChallenge(session!.user, c.id, reason))} />
        </View>
      </Card>
    );
    if (c.status === 'pending' && forMe) return (
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button label="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => setPanel('decline')} />
        <Button label="Accept" style={{ flex: 1 }} loading={busy} onPress={() => run(() => respondChallenge(session!.user, c.id, true))} />
      </View>
    );
    if (c.status === 'pending' && mine) return (
      <Button label="Cancel challenge" variant="secondary" loading={busy}
        onPress={() => Alert.alert('Cancel challenge?', `${other?.display_name} will see it was cancelled. Nothing changes in the ranks.`, [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Cancel challenge', style: 'destructive', onPress: () => run(() => cancelChallenge(session!.user, c.id)) },
        ])} />
    );
    if (c.status === 'accepted' && (mine || forMe)) return (
      <View style={{ gap: space[2] }}>
        <Button label="Log result" onPress={() => router.push({ pathname: '/log', params: { a: c.from, b: c.to, challenge: c.id } })} />
        <Button label="Cancel" variant="ghost" onPress={() => setPanel('cancel')} />
      </View>
    );
    if (c.status === 'played' && c.match_id) return <Button label="Open match" variant="secondary" onPress={() => router.push(`/match/${c.match_id}`)} />;
    if (closed && (mine || c.after_accept) && other) return (
      <View style={{ gap: space[2] }}>
        <Button label="Send again" icon={Swords} variant="brand" onPress={() => router.push({ pathname: '/challenge/new', params: { to: other.id } })} />
        <Button label="Pick someone else" variant="secondary" onPress={() => router.push('/challenge/new')} />
      </View>
    );
    return null;
  };

  const late = c.status === 'accepted' && c.scheduled_at && now - new Date(c.scheduled_at).getTime() > 2 * 3600000;

  return (
    <Screen>
      {back}
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: 60 }}>
        <View style={{ gap: 4, paddingHorizontal: space[1] }}>
          <T v="title">{title}</T>
          <T c="text2">{sub}</T>
        </View>
        <Card style={{ gap: space[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {player(c.from)}
            <T v="label" c="text3">vs</T>
            {player(c.to)}
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {stake('Win', signed(s.win), true)}
            {stake('Lose', signed(s.lose))}
            {stake('Chance', `${Math.round(s.chance * 100)}%`)}
          </View>
          {c.status === 'pending' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="caption" c="text3">Frozen at send, reply within {REPLY_HOURS} h</T>
              <Pill label={timeLeft(c.expires_at)} tone={forMe ? 'warning' : 'neutral'} icon={Clock} />
            </View>
          ) : null}
        </Card>
        {c.message ? <Card><T c="text2">“{c.message}”</T><T v="caption" c="text3" style={{ marginTop: 4 }}>{from?.display_name}</T></Card> : null}
        {c.scheduled_at ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: c.status === 'accepted' ? t.win : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <T v="label" c={c.status === 'accepted' ? 'onWin' : 'text'}>{new Date(c.scheduled_at).getDate()}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T v="label">{whenLabel(c.scheduled_at)}</T>
              <T v="caption" c="text3">{c.status === 'accepted' ? 'Scheduled' : 'Suggested time'}</T>
            </View>
          </Card>
        ) : null}
        {late ? <Card><T v="label">Did you play? Log it so the ranks stay right.</T></Card> : null}
        {c.status === 'declined' && (c.reason || c.back_on) ? (
          <Card style={{ gap: 4 }}>
            {c.reason ? <T c="text2">“{c.reason}”</T> : null}
            {c.back_on ? <T v="label">Back {dateLabel(c.back_on)}</T> : null}
          </Card>
        ) : null}
        {c.status === 'expired' ? <T c="text2">{c.after_accept ? 'No result was logged within a day. No rating changed.' : forMe ? 'No rating changed.' : `No rating changed. ${on(c.to)} might just be busy this week.`}</T> : null}
        {c.status === 'cancelled' ? <T c="text2">Nothing changed in the ranks.{c.late_cancel ? ' Cancelled close to the start.' : ''}</T> : null}
        {to && from ? actions() : null}
      </ScrollView>
    </Screen>
  );
}
