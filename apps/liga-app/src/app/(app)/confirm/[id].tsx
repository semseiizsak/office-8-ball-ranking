// M3.1 Confirm result, M3.3 Dispute thread, M3.5 Waiting for confirmation, M15.2 No show reported
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Bell, Check, Flag, Pencil, Send, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { canEditMatch, deleteMatch } from '@/lib/api';
import {
  accept, answerNoShowReport, confirm, confirmView, keepMine, removeByAgreement, reply, restore, sendNudge, withdrawDispute, type ConfirmView,
} from '@/lib/confirm';
import { MAX_MESSAGES } from '@/lib/confirm-engine';
import { clock } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Field, IconButton, Screen, Skeleton, T } from '@/ui';
import { ago, left, reasonLabel, sideNames, versionText, Versions } from '@/ui/confirm-kit';
import { Header } from '@/ui/list-row';
import { MatchCard } from '@/ui/match-card';

export default function ConfirmResult() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { members, refresh } = useLeague();
  const [v, setV] = useState<ConfirmView | null | undefined>(undefined);
  const [edit, setEdit] = useState<{ allowed: boolean; minutesLeft: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const x = await confirmView(session!.user, id);
    setV(x);
    if (x) setEdit(await canEditMatch(session!.user, id));
  }, [id, session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const user = session!.user;
  const act = (key: string, f: () => Promise<unknown>, after?: string) => async () => {
    setBusy(key);
    try {
      await f();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (after) setDone(after);
      await Promise.all([load(), refresh()]);
    } catch { Alert.alert('That did not work', 'Someone may have changed it already. Pull to refresh and try again.'); }
    setBusy(null);
  };

  if (v === undefined) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={180} /><Skeleton h={52} /></View></Screen>;
  if (v === null) {
    return (
      <Screen>
        <Header title="Result" />
        <View style={{ padding: space[4], gap: space[2] }}>
          <T v="heading">This match was removed</T>
          <T c="text2">Nothing to confirm. Ratings were recalculated without it.</T>
        </View>
      </Screen>
    );
  }

  const { match, status, role, dispute: x, rules } = v;
  const meId = v.me?.id;
  const logger = v.logger ? (v.logger.id === meId ? 'You' : v.logger.display_name) : 'Someone';
  const opener = x ? (x.opened_by === meId ? 'You' : members.find((m) => m.id === x.opened_by)?.display_name ?? 'Someone') : '';
  const openX = x && x.status !== 'resolved' ? x : undefined;
  const confirmNames = v.confirmNames.join(' and ');
  const title = status === 'pending' ? (role === 'confirmer' ? 'Confirm result' : 'Waiting') : status === 'disputed' || openX?.kind === 'correction' ? 'Dispute' : status === 'no_show' ? 'No show' : 'Result';

  const remove = () => Alert.alert('Remove this match?', 'It never counted, so no ratings change.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: act('remove', async () => { await deleteMatch(user, match.id); router.back(); }) },
  ]);

  const pending = () => (
    role === 'confirmer' ? (
      <View style={{ gap: space[3] }}>
        <T c="text2">{rules.mode === 'auto' ? `Counts automatically in ${left(v.due)}.` : `Expires in ${left(v.due)}. It only counts once confirmed.`}</T>
        {v.teammates.length ? <T v="small" c="text2">Confirming for you and {v.teammates.join(' and ')}. One tap is enough.</T> : null}
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <Button label="Dispute" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/dispute/${match.id}`)} />
          <Button label="Confirm" icon={Check} style={{ flex: 1 }} loading={busy === 'confirm'} onPress={act('confirm', () => confirm(user, match.id), 'Confirmed. Ratings updated.')} />
        </View>
      </View>
    ) : role === 'logger' ? (
      <View style={{ gap: space[3] }}>
        <T v="heading">Waiting for {confirmNames}</T>
        <T c="text2">{v.seenAt ? `Seen ${ago(v.seenAt)}. ` : 'Not seen yet. '}{rules.mode === 'auto' ? `Counts automatically in ${left(v.due)}.` : `${confirmNames} has ${left(v.due)} to confirm.`}</T>
        <Button label={v.canNudge ? 'Nudge' : 'Nudged, try again in an hour'} icon={Bell} variant="secondary" disabled={!v.canNudge} loading={busy === 'nudge'}
          onPress={act('nudge', () => sendNudge(user, match.id), `We reminded ${confirmNames}.`)} />
        {edit?.allowed ? (
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <Button label="Edit" icon={Pencil} variant="ghost" size="md" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/log', params: { edit: match.id } })} />
            <Button label="Remove" icon={Trash2} variant="ghost" size="md" style={{ flex: 1 }} onPress={remove} />
          </View>
        ) : null}
      </View>
    ) : <T c="text2">Waiting for {confirmNames} to confirm.</T>
  );

  const thread = (d: NonNullable<typeof openX>) => (
    <View style={{ gap: space[2] }}>
      {d.message ? <Card><T v="caption" c="text2">{opener}</T><T>{d.message}</T></Card> : null}
      {d.messages.map((m, i) => (
        <Card key={i} style={{ backgroundColor: m.member_id === meId ? t.surface2 : t.surface }}>
          <T v="caption" c="text2">{m.member_id === meId ? 'You' : members.find((y) => y.id === m.member_id)?.display_name ?? 'Someone'}, {ago(m.at)}</T>
          <T>{m.text}</T>
        </Card>
      ))}
      {d.messages.length < MAX_MESSAGES ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
          <View style={{ flex: 1 }}><Field value={msg} onChangeText={setMsg} placeholder="Add a short note" maxLength={200} /></View>
          <IconButton icon={Send} label="Send note" tone="primary" onPress={() => { if (msg.trim()) act('msg', async () => { await reply(user, d.id, d.league_id, msg); setMsg(''); })(); }} />
        </View>
      ) : <T v="caption" c="text3">This thread is full. An admin can still read it.</T>}
    </View>
  );

  const disputed = (d: NonNullable<typeof openX>) => {
    const correction = d.kind === 'correction';
    const head = d.status === 'escalated' ? (d.assigned_to ? `${members.find((m) => m.id === d.assigned_to)?.display_name ?? 'An admin'} is looking at this.` : 'An admin will decide.')
      : correction ? `This match already counted. ${role === 'opener' ? 'They have' : 'You have'} ${left(d.deadline)} to accept the fix.` : `Disputed, ${left(d.deadline)} left to agree`;
    if (role === 'viewer') return <Card><T v="heading">Disputed</T><T c="text2">The players are sorting this out.</T></Card>;
    const openerName = opener === 'You' ? 'your' : `${opener}'s`;
    return (
      <View style={{ gap: space[4] }}>
        <View style={{ backgroundColor: t.warning, borderRadius: radius.md, padding: space[3] }}>
          <T v="label" c="#0A0A0A">{head}</T>
        </View>
        <T v="label" c="text2">{reasonLabel(d)}</T>
        <Versions match={match} dispute={d} members={members} meId={meId} logger={logger} opener={opener} />
        {thread(d)}
        {role === 'answer' ? (
          <View style={{ gap: space[2] }}>
            {d.proposal ? <Button label={`Accept ${openerName} version`} loading={busy === 'accept'} onPress={act('accept', () => accept(user, d.id, d.league_id), 'Settled. Ratings updated.')} /> : null}
            {d.status === 'open' ? <Button label="Keep mine" variant="secondary" loading={busy === 'keep'} onPress={act('keep', () => keepMine(user, d.id, d.league_id), 'Sent to an admin.')} /> : null}
            <Button label="Remove match" variant="ghost" onPress={() => Alert.alert('Remove this match?', 'You both agree it should go. Ratings are recalculated without it.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: act('remove', async () => { await removeByAgreement(user, d.id, d.league_id); router.back(); }) },
            ])} />
          </View>
        ) : role === 'opener' ? (
          <View style={{ gap: space[2] }}>
            {d.status === 'open' ? <Button label="Edit my version" variant="secondary" onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: match.id, edit: d.id } })} /> : null}
            <Button label="Withdraw dispute" variant="ghost" loading={busy === 'withdraw'} onPress={act('withdraw', () => withdrawDispute(user, d.id, d.league_id), correction ? 'Withdrawn.' : 'Withdrawn. The match counts as logged.')} />
          </View>
        ) : null}
        {v.isAdmin && !v.inMatch && d.status === 'escalated' ? <Button label="Decide" icon={Flag} onPress={() => router.push(`/league/dispute/${d.id}`)} /> : null}
      </View>
    );
  };

  const noShow = (d: NonNullable<typeof openX>) => {
    const opp = sideNames(match, 'b', members, meId);
    if (d.status === 'escalated') return <Card><T v="heading">An admin will decide</T><T c="text2">{opp === 'You' ? 'You said' : `${opp} says`} {opp === 'You' ? 'you were' : 'they were'} there.</T></Card>;
    if (role === 'answer') return (
      <View style={{ gap: space[3] }}>
        <T v="heading">{opener} reported a no show for {clock(match.played_at)}</T>
        <T c="text2">Reply within {left(d.deadline)}. No reply means a walkover, with no rating change.</T>
        <Button label="I was there" variant="secondary" loading={busy === 'there'} onPress={act('there', () => answerNoShowReport(user, match.id, 'there'), 'Sent to an admin.')} />
        <Button label="Sorry, I missed it" loading={busy === 'sorry'} onPress={act('sorry', () => answerNoShowReport(user, match.id, 'sorry'), 'Walkover recorded. No rating change.')} />
        <Button label="We moved it" variant="ghost" onPress={act('moved', async () => { await answerNoShowReport(user, match.id, 'moved'); router.back(); })} />
      </View>
    );
    return <Card style={{ gap: space[1] }}><T v="heading">Waiting for {opp} to reply</T><T c="text2">{left(d.deadline)} left. No reply means a walkover, with no rating change.</T></Card>;
  };

  const settledView = () => {
    const resolved = x?.status === 'resolved' ? x : undefined;
    const dup = status === 'void' && resolved?.resolution === 'duplicate';
    return (
      <View style={{ gap: space[3] }}>
        {status === 'walkover' ? <T c="text2">Walkover. No rating change for a walkover.</T>
          : status === 'void' ? <T c="text2">{dup ? 'Hidden as a duplicate. It does not count.' : 'This match does not count.'}</T>
          : <T c="text2">{v.confirmedBy ? `Confirmed by ${v.confirmedBy}.` : v.confirmedAt ? 'Counted automatically.' : 'This match counts.'}</T>}
        {resolved && resolved.resolution !== 'duplicate' && v.resolvedBy ? (
          <Card style={{ gap: 4 }}>
            <T v="heading">Resolved by {v.resolvedBy}</T>
            {resolved.note ? <T c="text2">“{resolved.note}”</T> : null}
          </Card>
        ) : null}
        {dup && v.logger?.id === meId ? <Button label="Bring it back" variant="secondary" loading={busy === 'restore'} onPress={act('restore', () => restore(user, match.id), 'It is back and waiting for confirmation.')} /> : null}
        {!status && v.inMatch ? (
          v.ageDays > 7 ? <Button label="Ask an admin" variant="secondary" onPress={() => router.push(`/dispute/${match.id}`)} />
            : <Button label="Request a correction" variant="secondary" onPress={() => router.push(`/dispute/${match.id}`)} />
        ) : null}
      </View>
    );
  };

  const subtitle = status === 'no_show' ? `${logger === 'You' ? 'You' : logger} reported this ${ago(match.played_at)}` : `${logger} logged this ${ago(match.played_at)}`;
  const preview = status === 'pending' && role === 'confirmer' && x === undefined;
  return (
    <Screen>
      <Header title={title} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <T c="text2">{subtitle}</T>
          <MatchCard match={match} members={members} meId={meId} />
          {preview ? <T v="small" c="text2">{versionText(match, { winner: match.winner, score_a: match.score_a, score_b: match.score_b }, members, meId)}</T> : null}
          {done ? <View style={{ backgroundColor: t.win, borderRadius: radius.md, padding: space[3] }}><T v="label" c="onWin">{done}</T></View> : null}
          {status === 'pending' ? pending()
            : openX && openX.kind === 'no_show' ? noShow(openX)
            : openX ? disputed(openX)
            : settledView()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
