// B5.12 Promo code. Store offer codes open the App Store sheet in the dev build; this build checks server codes
// (try OFFICE20, CLUB30, or the ended SUMMER25).
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { redeemPromo } from '@/lib/billing';
import { PLANS, longDate } from '@/lib/plans';
import { space } from '@/theme';
import { Button, Field, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { useBillingInfo } from '@/ui/plan-kit';

export default function Promo() {
  const { info, reload, league, user } = useBillingInfo();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'applied'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  const apply = async () => {
    if (!user || !league) return;
    setState('checking'); setMsg(null);
    const r = await redeemPromo(user, league.id, code);
    if (r.ok) { setState('applied'); setMsg(`${PLANS[r.plan].name} is on for ${r.days} days. Nothing is billed.`); await reload(); return; }
    setState('idle');
    setMsg({ invalid: "We don't know this code. Check the spelling and try again.", ended: `This code ended on ${longDate(r.ends ?? '')}. Try another one.`, used: 'This team already used this code.', paid: 'Your team already has this plan or a bigger one.' }[r.why]);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Promo code" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space[4], gap: space[4] }}>
        <T c="text2">{info?.admin === false ? 'Only owners and admins can add a code for the team.' : `Add a code for ${info?.team ?? 'your team'}.`}</T>
        <Field label="Code" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setMsg(null); if (state === 'applied') setState('idle'); }} autoCapitalize="characters" autoCorrect={false}
          placeholder="OFFICE20" maxLength={20} editable={info?.admin !== false} error={state === 'idle' && msg ? msg : undefined} />
        {state === 'applied' && msg ? <T c="win">{msg}</T> : null}
        <View style={{ flex: 1 }} />
        {state === 'applied'
          ? <Button label="Done" onPress={() => router.back()} />
          : <Button label={state === 'checking' ? 'Checking' : 'Apply'} variant="brand" loading={state === 'checking'} disabled={code.trim().length < 3 || info?.admin === false} onPress={apply} />}
      </KeyboardAvoidingView>
    </Screen>
  );
}
