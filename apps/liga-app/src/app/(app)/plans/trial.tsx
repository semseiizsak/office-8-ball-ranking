// B5.4 Start your trial: the full trial terms before the store sheet, then B5.5 purchase states.
import { router, useLocalSearchParams } from 'expo-router';
import { Bell, CreditCard, Sparkles, Ticket, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PLANS, TRIAL_DAYS, euro, productById, shortDate } from '@/lib/plans';
import { radius, space, useTheme } from '@/theme';
import { Card, Icon, Screen, Skeleton, T } from '@/ui';
import { Header, Row } from '@/ui/list-row';
import { PurchaseButton, useBillingInfo, useBuy } from '@/ui/plan-kit';

const DAY = 86400000;

export default function Trial() {
  const { t } = useTheme();
  const { product: id } = useLocalSearchParams<{ product: string }>();
  const { info, league } = useBillingInfo();
  const { state, error, buy } = useBuy(league?.id, () => router.dismiss(2));
  const [now] = useState(Date.now);
  const p = productById(id ?? '');
  if (!p || !info) return <Screen><Header title="Free trial" /><View style={{ padding: space[4] }}><Skeleton h={300} /></View></Screen>;

  const name = PLANS[p.plan].name;
  const end = new Date(now + TRIAL_DAYS * DAY).toISOString(), remind = new Date(now + (TRIAL_DAYS - 2) * DAY).toISOString();
  const who = p.band ? `up to ${p.band} players` : `${PLANS[p.plan].players} players`;
  const eligible = info.trialEligible;
  const step = (icon: LucideIcon, title: string, body: string, last?: boolean) => (
    <View key={title} style={{ flexDirection: 'row', gap: space[3] }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon as={icon} size={18} /></View>
        {last ? null : <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: t.line }} />}
      </View>
      <View style={{ flex: 1, gap: 2, paddingBottom: space[4] }}>
        <T v="heading">{title}</T>
        <T v="small" c="text2">{body}</T>
      </View>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Free trial" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 40 }}>
        <View style={{ gap: space[2] }}>
          <T v="title">{eligible ? `${TRIAL_DAYS} days of ${name}, free` : `${name} for ${info.team}`}</T>
          <T c="text2">{eligible ? 'Every feature, every player. Nothing to pay today.' : 'This team already had its free trial, so billing starts today.'}</T>
        </View>
        {eligible ? (
          <View>
            {step(Sparkles, 'Today', `Full ${name} for ${who}.`)}
            {step(Bell, shortDate(remind), 'We remind you 2 days before.')}
            {step(CreditCard, shortDate(end), 'Billing starts. Cancel before and pay nothing.', true)}
          </View>
        ) : null}
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
          <Row first icon={Ticket} label="Have a code?" onPress={() => router.push('/plans/promo')} />
        </View>
        <Card style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row' }}>
            <T style={{ flex: 1 }}>{name} {p.period}, {who}</T>
            <T v="label">{euro(p.price)}</T>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <T v="heading" style={{ flex: 1 }}>Due today</T>
            <T v="heading">{euro(eligible ? 0 : p.price)}</T>
          </View>
        </Card>
        <View style={{ gap: space[2] }}>
          <PurchaseButton state={state} plan={p.plan} label={eligible ? 'Start free trial' : `Subscribe for ${euro(p.price)}`} onPress={() => buy(p.id, eligible)} />
          <T v="caption" c="text2" center>
            {eligible ? `Then ${euro(p.price)} ${p.period === 'yearly' ? 'a year' : 'a month'}. Cancel any time before ${shortDate(end)} in Settings, Subscription.`
              : 'Renews until you cancel. Cancel any time in Settings, Subscription.'}
          </T>
          {state === 'pending' ? <T v="small" c="text2" center>Waiting for approval. We&apos;ll unlock {name} when it comes through.</T> : null}
          {error ? <T v="small" c="error" center>{error}</T> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
