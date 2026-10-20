// B1.7.3 Confirm: typed DELETE, a summary and an optional reason. Nothing changes unless it all goes through.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { deleteAccount, deletionSummary, type Handover } from '@/lib/account';
import { useAuth } from '@/providers/auth';
import { space } from '@/theme';
import { Button, Card, Field, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';

const REASONS = ['Not using it', 'Too many alerts', 'Something else'];

export default function ConfirmDelete() {
  const { session } = useAuth();
  const { handover } = useLocalSearchParams<{ handover?: string }>();
  const [sum, setSum] = useState<Awaited<ReturnType<typeof deletionSummary>> | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (session) setSum(await deletionSummary(session.user.id)); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const go = async () => {
    if (!session || typed !== 'DELETE') return;
    setBusy(true); setError(null);
    try {
      const plan = (handover ? JSON.parse(handover) : {}) as Handover;
      const r = await deleteAccount(session.user, plan, reason);
      router.dismissAll();
      router.replace({ pathname: '/account/deleted', params: { handed: JSON.stringify(r.handed), paying: sum?.paying.length ? '1' : '' } });
    } catch {
      setError("We couldn't delete your account. Nothing changed. Try again or contact support.");
      setBusy(false);
    }
  };

  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Delete account" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <T v="title">Last step</T>
          {sum?.paying.length ? <Card><T>Cancel your plan in the App Store too, so billing stops.</T></Card> : null}
          {sum ? <T c="text2">You leave {plural(sum.teams, 'team')} and {plural(sum.leagues, 'league')}. {sum.matches ? `Your ${plural(sum.matches, 'match', 'matches')} stay.` : ''}</T> : null}
          <View style={{ gap: space[1] }}>
            <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" />
            <T v="caption" c="text3">Capital letters, exactly as shown</T>
          </View>
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2">What made you leave? Optional</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {REASONS.map((r) => <Button key={r} label={r} size="sm" variant={reason === r ? 'primary' : 'secondary'} onPress={() => setReason(reason === r ? null : r)} />)}
            </View>
          </View>
          {error ? <T v="small" c="error">{error}</T> : null}
          <Button label={busy ? 'Deleting' : 'Delete account'} variant="danger" loading={busy} disabled={typed !== 'DELETE'} onPress={go} />
          <Button label="Cancel" variant="ghost" onPress={() => router.dismissAll()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
