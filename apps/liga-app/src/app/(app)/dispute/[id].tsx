// M3.2 Dispute result, M4.4 Request a correction
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { confirmView, dispute, editProposal, type ConfirmView, type Proposal } from '@/lib/confirm';
import { REASONS, type Reason } from '@/lib/confirm-engine';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Field, Icon, Screen, Skeleton, T } from '@/ui';
import { sideNames, versionText } from '@/ui/confirm-kit';
import { Header } from '@/ui/list-row';

type R = Exclude<Reason, 'no_show'>;

export default function DisputeResult() {
  const { t } = useTheme();
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { session } = useAuth();
  const { members, refresh } = useLeague();
  const [v, setV] = useState<ConfirmView | null | undefined>(undefined);
  const [reason, setReason] = useState<R | null>(null);
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    confirmView(session!.user, id).then((x) => {
      setV(x);
      const p = x?.dispute && edit ? x.dispute : null;
      if (p) { setReason(p.reason as R); setMessage(p.message); setSa(String(p.proposal?.score_a ?? '')); setSb(String(p.proposal?.score_b ?? '')); }
      else if (x) { setSa(String(x.match.score_a ?? '')); setSb(String(x.match.score_b ?? '')); }
    });
  }, [id, edit, session]);

  if (v === undefined) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={300} /></View></Screen>;
  if (v === null) return <Screen><Header title="Report a problem" /><View style={{ padding: space[4] }}><T c="text2">This match was removed.</T></View></Screen>;

  const m = v.match, meId = v.me?.id;
  const counted = !v.status;
  const old = counted && v.ageDays > 7;
  const others = m.match_players.filter((p) => !m.match_players.some((q) => q.member_id === meId && q.side === p.side)).map((p) => members.find((x) => x.id === p.member_id)?.display_name ?? 'Someone');
  const flipped: Exclude<Proposal, null> = { winner: m.winner === 'a' ? 'b' : 'a', score_a: m.score_b, score_b: m.score_a };
  const scoreOk = sa !== '' && sb !== '' && sa !== sb;
  const proposal: Proposal = reason === 'winner' ? flipped
    : reason === 'score' && scoreOk ? { winner: Number(sa) > Number(sb) ? 'a' : 'b', score_a: Number(sa), score_b: Number(sb) } : null;
  const ready = !!reason && (reason !== 'score' || scoreOk);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      if (edit) await editProposal(session!.user, edit, v.me!.league_id, { reason, proposal, message });
      else await dispute(session!.user, m.id, { reason, proposal, message });
      await refresh();
      router.back();
    } catch { Alert.alert('That did not work', 'Someone may have settled it already. Try again in a moment.'); }
    setBusy(false);
  };

  const option = (r: (typeof REASONS)[number]) => {
    const on = reason === r.id;
    return (
      <Pressable key={r.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setReason(r.id)}
        style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], borderRadius: radius.md,
          backgroundColor: on ? t.primary : pressed ? t.surface3 : t.surface })}>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? t.onPrimary : t.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Icon as={Check} size={14} color={t.onPrimary} /> : null}
        </View>
        <T v="heading" c={on ? 'onPrimary' : 'text'}>{r.label}</T>
      </Pressable>
    );
  };

  const scoreInput = (val: string, set: (s: string) => void, side: 'a' | 'b') => (
    <View style={{ flex: 1, gap: 6 }}>
      <T v="caption" c="text2" numberOfLines={1}>{sideNames(m, side, members, meId)}</T>
      <TextInput value={val} onChangeText={(x) => set(x.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} placeholder="0" placeholderTextColor={t.text3}
        accessibilityLabel={`Score for ${sideNames(m, side, members, meId)}`}
        style={{ height: 56, borderRadius: radius.sm, backgroundColor: t.surface2, color: t.text, textAlign: 'center', fontFamily: font.heavy, fontSize: 24 }} />
    </View>
  );

  return (
    <Screen>
      <Header title={edit ? 'Edit my version' : counted ? 'Request a correction' : "What's wrong?"} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <T c="text2">Logged: {versionText(m, { winner: m.winner, score_a: m.score_a, score_b: m.score_b }, members, meId)}</T>
          {counted ? (
            <View style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space[3] }}>
              <T v="label">{old ? 'This match is older than 7 days, so an admin fixes it. Your note goes straight to them.' : `This match already counted. ${others.join(' and ') || 'The other side'} has ${v.rules.disputeHours} h to accept your fix.`}</T>
            </View>
          ) : null}
          <View style={{ gap: space[2] }}>{REASONS.filter((r) => !(counted && r.id === 'twice')).map(option)}</View>

          {reason === 'winner' ? <T v="heading">Your version: {versionText(m, flipped, members, meId)}</T> : null}
          {reason === 'score' ? <View style={{ flexDirection: 'row', gap: space[3] }}>{scoreInput(sa, setSa, 'a')}{scoreInput(sb, setSb, 'b')}</View> : null}
          {reason === 'twice' ? <T v="small" c="text2">We hide it right away. {v.logger?.display_name ?? 'The logger'} can bring it back within 24 h.</T> : null}

          <Field label="Message (optional)" value={message} onChangeText={setMessage} maxLength={200} placeholder="It was 10 : 8 for me" multiline style={{ height: 88, paddingTop: 14 }} />
          {!counted && reason !== 'twice' ? <T v="small" c="text2">Ratings stay frozen until you agree. If you can’t agree within {v.rules.disputeHours} h, an admin decides.</T> : null}
          <Button label="Send" onPress={send} loading={busy} disabled={!ready} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
