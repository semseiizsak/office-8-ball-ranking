// B5.3 Price for your crew: Club and Business by player band (store products come in bands of 20, 40, 80, 150).
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PLANS, bandFor, euro, product } from '@/lib/plans';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, IconButton, Screen, Seg, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { useBillingInfo } from '@/ui/plan-kit';

const MIN = 10, MAX = 200, PICKS = [20, 50, 100, 150];

export default function Calculator() {
  const { t } = useTheme();
  const { plan: start } = useLocalSearchParams<{ plan?: 'club' | 'business' }>();
  const { info } = useBillingInfo();
  const [plan, setPlan] = useState<'club' | 'business'>(start === 'business' ? 'business' : 'club');
  const [chosen, setChosen] = useState<number | null>(null);
  const [width, setWidth] = useState(1);
  const n = chosen ?? Math.min(MAX, Math.max(MIN, info?.usage.players ?? 20));
  const band = bandFor(n);
  const set = (v: number) => { const c = Math.round(Math.min(MAX, Math.max(MIN, v))); if (c !== n) Haptics.selectionAsync(); setChosen(c); };
  const fromX = (x: number) => set(MIN + (x / width) * (MAX - MIN));
  const yearly = band ? product(plan, 'yearly', band) : null;

  const compare = (name: string, line: string, fits: boolean) => (
    <View key={name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space[3], borderTopWidth: 1, borderTopColor: t.line }}>
      <T v="heading" style={{ flex: 1 }}>{name}</T>
      <T v="small" c={fits ? 'text' : 'text3'}>{line}</T>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Price for your crew" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }}>
        <Seg value={plan} onChange={setPlan} options={[{ value: 'club', label: 'Club' }, { value: 'business', label: 'Business' }]} />

        <Card style={{ gap: space[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <IconButton icon={Minus} label="Fewer players" onPress={() => set(n - 1)} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <T v="bigNumber">{n}</T>
              <T v="small" c="text2">players</T>
            </View>
            <IconButton icon={Plus} label="More players" onPress={() => set(n + 1)} />
          </View>
          <View accessibilityRole="adjustable" accessibilityLabel="Players" accessibilityValue={{ min: MIN, max: MAX, now: n }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => set(n + (e.nativeEvent.actionName === 'increment' ? 5 : -5))}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => fromX(e.nativeEvent.locationX)} onResponderMove={(e) => fromX(e.nativeEvent.locationX)}
            style={{ height: 44, justifyContent: 'center' }}>
            <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3 }}>
              <View style={{ height: 8, borderRadius: 4, width: `${((n - MIN) / (MAX - MIN)) * 100}%`, backgroundColor: t.brand }} />
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', left: ((n - MIN) / (MAX - MIN)) * width - 12, width: 24, height: 24, borderRadius: 12, backgroundColor: t.primary }} />
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {PICKS.map((p) => <Button key={p} label={String(p)} size="sm" variant={n === p ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => set(p)} />)}
          </View>
        </Card>

        {yearly ? (
          <View style={{ gap: space[1] }}>
            <T v="title">{euro(yearly.price / 12)} a month</T>
            <T c="text2">Up to {band} players on {PLANS[plan].name}, {euro(yearly.price)} billed yearly.</T>
          </View>
        ) : (
          <Card style={{ gap: space[3], borderRadius: radius.md }}>
            <T v="heading">More than 150? Talk to us</T>
            <T v="small" c="text2">We set up big crews with invoices and single sign on.</T>
            <Button label="Talk to us" variant="secondary" onPress={() => router.push('/plans/contact')} />
          </Card>
        )}

        <View>
          <T v="label" c="text2" style={{ paddingBottom: space[2] }}>Same crew on every plan</T>
          {compare('Team', n <= 30 ? `${euro(59.99 / 12)} a month` : 'Up to 30, too small', n <= 30)}
          {compare('Club', band ? `${euro(product('club', 'yearly', band).price / 12)} a month` : 'Talk to us', !!band)}
          {compare('Business', band ? `${euro(product('business', 'yearly', band).price / 12)} a month` : 'Talk to us', !!band)}
        </View>
        <T v="small" c="text2">Only active players count. Guests are always free.</T>

        {band ? <Button label={`Choose ${PLANS[plan].name} for up to ${band} players`} variant="brand"
          onPress={() => router.dismissTo({ pathname: '/plans', params: { reason: 'compare', plan, band: String(band) } })} /> : null}
      </ScrollView>
    </Screen>
  );
}
