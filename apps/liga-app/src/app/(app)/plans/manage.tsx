// B5.9 Manage subscription. Stands in for the store's own sheet (showManageSubscriptions in the dev build),
// with the skippable "Before you go" step before turning auto renew off.
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { fixPayment, setAutoRenew } from '@/lib/billing';
import { PLANS, RANK, euro, longDate, product } from '@/lib/plans';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { useBillingInfo } from '@/ui/plan-kit';

const MISSING = ['Too pricey', 'We play less', 'Missing a feature', 'Something else'];

export default function Manage() {
  const { t } = useTheme();
  const { info, reload, league, user } = useBillingInfo();
  const [step, setStep] = useState<'store' | 'before'>('store');
  const [missing, setMissing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!info || !league || !user) return <Screen><Header title="Manage subscription" /><View style={{ padding: space[4] }}><Skeleton h={200} /></View></Screen>;
  const sub = info.sub;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); await reload(); if (done) Alert.alert(done); router.back(); } catch { Alert.alert('That did not work', 'Nothing changed. Try again in a moment.'); }
    setBusy(false);
  };

  if (!sub || !info.isPayer) {
    return (
      <Screen>
        <Header title="Manage subscription" />
        <View style={{ padding: space[4], gap: space[4] }}>
          <T v="heading">{sub ? `Only ${info.payer} can change this` : `${info.team} is on Free`}</T>
          <T c="text2">{sub ? `The subscription runs on ${info.payer}'s App Store account. Ask them to make the change.` : 'There is nothing to manage yet.'}</T>
          {sub ? <Button label={`Ask ${info.payer}`} variant="secondary" onPress={() => router.replace({ pathname: '/plans/ask', params: { reason: 'compare' } })} /> : null}
        </View>
      </Screen>
    );
  }

  const name = PLANS[sub.plan].name;
  const chip = (label: string) => {
    const on = missing === label;
    return <Button key={label} label={label} size="sm" variant={on ? 'primary' : 'secondary'} onPress={() => setMissing(on ? null : label)} />;
  };

  if (step === 'before') {
    const team = product('team', 'yearly');
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Before you go" />
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }}>
          {RANK[sub.plan] > RANK.team ? (
            <Card style={{ gap: space[3] }}>
              <T v="heading">Switch to Team instead</T>
              <T v="small" c="text2">{euro(team.price)} a year for up to 30 players and 3 leagues. Your history stays.</T>
              <Button label="Switch to Team" size="md" variant="secondary" onPress={() => router.replace({ pathname: '/plans', params: { reason: 'compare', plan: 'team' } })} />
            </Card>
          ) : null}
          <Card style={{ gap: space[3] }}>
            <T v="heading">Pause instead?</T>
            <T v="small" c="text2">Turn off modules you don&apos;t use and keep your history. Free keeps every match.</T>
            <Button label="Open modules" size="md" variant="secondary" onPress={() => router.push('/league/modules')} />
          </Card>
          <View style={{ gap: space[2] }}>
            <T v="heading">What&apos;s missing?</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{MISSING.map(chip)}</View>
          </View>
          <Button label="Turn off auto renew" variant="secondary" loading={busy}
            onPress={() => run(() => setAutoRenew(user, league.id, false), `${name} stays on until ${longDate(sub.renews_at)}`)} />
          <Button label={`Keep ${name}`} variant="brand" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Manage subscription" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }}>
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space[4], gap: space[2] }}>
          <T v="caption" c="text3">App Store, test build</T>
          <T v="heading">Liga {name}, {info.team}</T>
          <T c="text2">{sub.status === 'ending' ? `Ends ${longDate(sub.renews_at)}`
            : sub.status === 'expired' ? `Ended. ${info.team} is back on Free.`
            : sub.status === 'pending' ? 'Waiting for approval'
            : sub.status === 'trial' ? `Free until ${longDate(sub.renews_at)}, then ${euro(sub.price)} ${sub.period === 'yearly' ? 'a year' : 'a month'}`
            : `${euro(sub.price)} ${sub.period === 'yearly' ? 'a year' : 'a month'}, renews ${longDate(sub.renews_at)}`}</T>
        </View>
        {sub.status === 'billing_issue' ? <Button label="Update payment method" variant="brand" loading={busy} onPress={() => run(() => fixPayment(user, league.id), 'Payment updated')} /> : null}
        {sub.status === 'ending' ? <Button label="Turn auto renew back on" variant="brand" loading={busy} onPress={() => run(() => setAutoRenew(user, league.id, true))} /> : null}
        {sub.status === 'active' || sub.status === 'trial' || sub.status === 'billing_issue'
          ? <Button label={sub.status === 'trial' ? 'Cancel free trial' : 'Cancel subscription'} variant="secondary" onPress={() => setStep('before')} /> : null}
        <Button label="Change plan" variant="ghost" onPress={() => router.replace({ pathname: '/plans', params: { reason: 'compare' } })} />
      </ScrollView>
    </Screen>
  );
}
