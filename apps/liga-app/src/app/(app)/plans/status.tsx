// B5.6 Subscription status, B5.7 usage and limits, B5.8 restore.
import { router } from 'expo-router';
import { CreditCard, Receipt, RefreshCw, Repeat, Settings2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { moveSubscription, restore, setAutoRenew } from '@/lib/billing';
import { PLANS, entitled } from '@/lib/plans';
import { space } from '@/theme';
import { Button, Card, Screen, Skeleton, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';
import { StatusCard, UsageBar, openPaywall, useBillingInfo } from '@/ui/plan-kit';

export default function Status() {
  const { info, reload, league, user } = useBillingInfo();
  const [busy, setBusy] = useState(false);
  if (!info || !league || !user) return <Screen><Header title="Subscription" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={140} /><Skeleton h={120} /></View></Screen>;

  const { sub, usage } = info;
  const name = sub ? PLANS[sub.plan].name : 'Free';
  const full = usage.players >= usage.cap;
  const overLeagues = usage.leagueCap !== null && usage.leagues > usage.leagueCap;

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await reload(); } catch { Alert.alert('That did not work', 'Nothing changed. Try again in a moment.'); } setBusy(false); };
  const doRestore = () => run(async () => {
    const r = await restore(user, league.id);
    if (r.kind === 'restored') Alert.alert(`${PLANS[r.plan].name} restored for ${r.team}`);
    else if (r.kind === 'none') Alert.alert('Nothing to restore', "We didn't find a Liga subscription on this Apple ID.");
    else Alert.alert(`This subscription belongs to ${r.fromName}`, `Move it to ${r.team}? ${r.fromName} goes back to Free.`, [
      { text: 'Keep it there', style: 'cancel' },
      { text: 'Move it', onPress: () => run(() => moveSubscription(user, r.fromTeam, league.id)) },
    ]);
  });

  const action = () => {
    if (!sub || sub.status === 'expired') return <Button label="Upgrade" variant="brand" onPress={() => openPaywall('compare')} />;
    if (sub.status === 'ending' && sub.store !== 'promo') return info.isPayer ? <Button label={`Keep ${name}`} variant="brand" loading={busy} onPress={() => run(() => setAutoRenew(user, league.id, true))} /> : null;
    if (sub.status === 'billing_issue') return info.isPayer ? <Button label="Update payment" variant="brand" onPress={() => router.push('/plans/manage')} /> : null;
    return null;
  };

  return (
    <Screen>
      <Header title="Subscription" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <StatusCard sub={sub} team={info.team} />
        {info.admin ? action() : null}
        {sub && entitled(sub) ? (
          <T v="small" c="text2">
            {sub.store === 'promo' ? 'Free period from a promo code. Nothing is billed.'
              : info.isPayer ? 'Paid by you through the App Store.'
                : `Paid by ${info.payer} through the App Store. Only ${info.payer} can manage this subscription in their App Store account.`}
          </T>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <T v="heading">Usage</T>
          <UsageBar label="Players" used={usage.players} cap={usage.cap} />
          <UsageBar label="Leagues" used={usage.leagues} cap={usage.leagueCap} />
          <T v="caption" c="text3">Guests and players who left don&apos;t count.</T>
        </Card>

        {(full || overLeagues) && info.admin ? (
          <Card style={{ gap: space[3] }}>
            <T v="heading">{usage.players > usage.cap ? `${info.team} is over the ${PLANS[info.plan].name} limit` : `Your crew is full on ${PLANS[info.plan].name}`}</T>
            <T v="small" c="text2">
              {usage.players > usage.cap ? `The ${usage.cap} most active players keep logging, the others can watch. Nothing is deleted. A bigger plan makes room for everyone.`
                : 'A bigger plan makes room for everyone. New players can still join and watch.'}
            </T>
            <Button label="Upgrade" variant="brand" size="md" onPress={() => openPaywall(overLeagues ? 'leagues' : 'seats')} />
          </Card>
        ) : null}
        {!info.admin && (info.readOnly || full) ? (
          <Card style={{ gap: space[3] }}>
            <T v="heading">{info.readOnly ? 'You can watch for now' : `${info.team} is full`}</T>
            <T v="small" c="text2">{info.team} is over the {PLANS[info.plan].name} limit. Ask {info.owner} to upgrade.</T>
            <Button label={`Ask ${info.owner}`} size="md" variant="secondary" onPress={() => router.push({ pathname: '/plans/ask', params: { reason: 'seats' } })} />
          </Card>
        ) : null}

        {info.admin ? (
          <Group>
            <Row first icon={Settings2} label="Manage subscription" onPress={() => router.push('/plans/manage')} disabled={!sub || !entitled(sub)} />
            <Row icon={Repeat} label="Change plan" onPress={() => openPaywall('compare')} />
            <Row icon={RefreshCw} label="Restore purchases" onPress={doRestore} disabled={busy} />
            <Row icon={Receipt} label="Receipts" onPress={() => Alert.alert('Receipts', 'Your receipts are in your App Store account, under Purchase history.')} />
            <Row icon={CreditCard} label="Have a code?" onPress={() => router.push('/plans/promo')} />
          </Group>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
