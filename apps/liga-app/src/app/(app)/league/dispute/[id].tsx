// M16.3 Admin decision on a dispute, with the thread and the match log (M16.4).
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { disputeView, resolve, type Decision } from '@/lib/confirm';
import { clock, dayLabel } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Card, Field, Screen, Skeleton, T } from '@/ui';
import { ago, reasonLabel, sideNames, versionText, Versions } from '@/ui/confirm-kit';
import { Header } from '@/ui/list-row';
import { MatchCard } from '@/ui/match-card';

type View_ = Awaited<ReturnType<typeof disputeView>>;
type Kind = Decision['kind'];

export default function ResolveDispute() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { members, refresh } = useLeague();
  const [v, setV] = useState<View_ | undefined>(undefined);
  const [kind, setKind] = useState<Kind | null>(null);
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setV(await disputeView(session!.user, id)); }, [id, session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (v === undefined) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={300} /></View></Screen>;
  if (v === null) return <Screen><Header title="Dispute" /><View style={{ padding: space[4] }}><T c="text2">This match was removed.</T></View></Screen>;

  const x = v.dispute, m = v.match;
  const noShow = x.kind === 'no_show';
  const options: { k: Kind; label: string }[] = noShow
    ? [{ k: 'walkover', label: 'Walkover stands' }, { k: 'void', label: 'Void match' }]
    : [{ k: 'original', label: `Keep ${v.logger}'s` }, ...(x.proposal ? [{ k: 'proposal' as Kind, label: `Use ${v.opener}'s` }] : []), { k: 'custom', label: 'Set result' }, { k: 'void', label: 'Void match' }];
  const customOk = sa !== '' && sb !== '' && sa !== sb;
  const can = v.admin && !v.involved && x.status !== 'resolved';
  const ready = !!kind && note.trim().length > 0 && (kind !== 'custom' || customOk);
  const effect = kind === 'original' ? versionText(m, { winner: m.winner, score_a: m.score_a, score_b: m.score_b }, members)
    : kind === 'proposal' && x.proposal ? versionText(m, x.proposal, members)
    : kind === 'custom' && customOk ? versionText(m, { winner: Number(sa) > Number(sb) ? 'a' : 'b', score_a: Number(sa), score_b: Number(sb) }, members)
    : kind === 'void' ? 'No result, no rating change' : kind === 'walkover' ? `${sideNames(m, 'a', members)} win on a walkover, no rating change` : null;

  const submit = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      const decision: Decision = kind === 'custom' ? { kind, winner: Number(sa) > Number(sb) ? 'a' : 'b', score_a: Number(sa), score_b: Number(sb) } : { kind };
      await resolve(session!.user, x.id, x.league_id, decision, note);
      await refresh();
      router.back();
    } catch { Alert.alert('That did not work', 'It may be settled already. Try again in a moment.'); load(); }
    setBusy(false);
  };

  const chip = (o: { k: Kind; label: string }) => {
    const on = kind === o.k;
    return (
      <Pressable key={o.k} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setKind(o.k)}
        style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surface2 }}>
        <T v="label" c={on ? 'onPrimary' : 'text'}>{o.label}</T>
      </Pressable>
    );
  };
  const scoreBox = (val: string, set: (s: string) => void, side: 'a' | 'b') => (
    <View style={{ flex: 1, gap: 6 }}>
      <T v="caption" c="text2" numberOfLines={1}>{sideNames(m, side, members)}</T>
      <TextInput value={val} onChangeText={(s) => set(s.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} placeholder="0" placeholderTextColor={t.text3} accessibilityLabel={`Score for ${sideNames(m, side, members)}`}
        style={{ height: 56, borderRadius: radius.sm, backgroundColor: t.surface2, color: t.text, textAlign: 'center', fontFamily: font.heavy, fontSize: 24 }} />
    </View>
  );

  return (
    <Screen>
      <Header title="Resolve dispute" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <MatchCard match={m} members={members} onPress={() => router.push(`/match/${m.id}`)} />
          <T v="label" c="text2">{reasonLabel(x)}, opened by {v.opener} {ago(x.created_at)}</T>
          {noShow ? <T>{v.opener} says {sideNames(m, 'b', members)} did not show up. {sideNames(m, 'b', members)} says they were there.</T>
            : <Versions match={m} dispute={x} members={members} logger={v.logger} opener={v.opener} />}
          {x.message ? <Card><T v="caption" c="text2">{v.opener}</T><T>{x.message}</T></Card> : null}
          {x.messages.map((msg, i) => <Card key={i}><T v="caption" c="text2">{v.name(msg.member_id)}, {ago(msg.at)}</T><T>{msg.text}</T></Card>)}

          <View style={{ gap: space[2] }}>
            <T v="heading">Match log</T>
            {v.audit.map((a) => <T key={a.id} v="small" c="text2">{dayLabel(a.at)}, {clock(a.at)}: {a.text}</T>)}
          </View>

          {x.status === 'resolved' ? (
            <Card style={{ gap: 4 }}><T v="heading">{v.resolvedBy ? `Resolved by ${v.resolvedBy}` : 'Already settled by the players'}</T>{x.note ? <T c="text2">“{x.note}”</T> : null}</Card>
          ) : !v.admin ? <T v="small" c="text2">Owners and admins decide disputes.</T>
          : v.involved ? <T v="small" c="text2">You are in this match, so another admin decides.</T> : (
            <View style={{ gap: space[3] }}>
              <T v="heading">Decision</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{options.map(chip)}</View>
              {kind === 'custom' ? <View style={{ flexDirection: 'row', gap: space[3] }}>{scoreBox(sa, setSa, 'a')}{scoreBox(sb, setSb, 'b')}</View> : null}
              <Field label="Reason, both players see it" value={note} onChangeText={setNote} maxLength={160} placeholder="Photo shows 10 : 8" />
              {effect ? <Card><T v="caption" c="text2">Result</T><T v="heading">{effect}</T><T v="caption" c="text3">Ratings are replayed in played order.</T></Card> : null}
              <Button label="Resolve" onPress={submit} loading={busy} disabled={!ready || !can} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
