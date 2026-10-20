// B5.1 Paywall (plans sheet), B5.5 purchase states, B5.8 restore. Opened with a reason: /plans?reason=seats
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { getOfferings, moveSubscription, restore } from '@/lib/billing';
import { PLANS, RANK, bandFor, entitled, euro, product, reasonCopy, savePct, type Period, type PlanId } from '@/lib/plans';
import { space } from '@/theme';
import { Button, IconButton, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { Lines, PlanCard, PurchaseButton, useBillingInfo, useBuy } from '@/ui/plan-kit';

const ORDER: PlanId[] = ['free', 'team', 'club', 'business'];

export default function Paywall() {
  const { reason, plan, band: bandParam } = useLocalSearchParams<{ reason?: string; plan?: PlanId; band?: string }>();
  const { info, reload, league, user } = useBillingInfo();
  const [period, setPeriod] = useState<Period>('yearly');
  const [pick, setPick] = useState<PlanId | null>(null);
  const [store, setStore] = useState<'loading' | 'ready' | 'error'>('loading');
  const [restoring, setRestoring] = useState(false);
  const { state, error, buy } = useBuy(league?.id, () => router.back());

  const fetchStore = useCallback(() => {
    const timer = setTimeout(() => setStore((s) => (s === 'loading' ? 'error' : s)), 5000);
    getOfferings().then(() => setStore('ready')).catch(() => setStore('error')).finally(() => clearTimeout(timer));
  }, []);
  const loadStore = () => { setStore('loading'); fetchStore(); };
  useEffect(() => { fetchStore(); }, [fetchStore]);
  // Members cannot buy: they get Ask your admin (B5.10).
  useEffect(() => { if (info && !info.admin) router.replace({ pathname: '/plans/ask', params: { reason: reason ?? 'compare' } }); }, [info, reason]);

  if (!info || !league) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={80} /><Skeleton h={300} /></View></Screen>;

  const copy = reasonCopy(reason, info.team, { players: info.usage.players, cap: info.usage.cap });
  const current = info.plan;
  const minPlan = RANK[copy.min] > RANK[current] ? copy.min : ORDER[Math.min(3, RANK[current] + 1)];
  const sel = pick ?? (plan && ORDER.includes(plan) && plan !== current ? plan : minPlan);
  const band = Number(bandParam) || bandFor(info.usage.players) || 150;
  const paid = sel !== 'free';
  const p = paid ? product(sel, period, sel === 'team' ? null : band) : null;
  const trial = info.trialEligible && !entitled(info.sub) && paid;
  const per = period === 'yearly' ? 'a year' : 'a month';
  const upgrade = entitled(info.sub) && RANK[sel] > RANK[current];
  const label = !p ? 'Stay on Free' : trial ? `Try ${PLANS[sel].name} free for 14 days` : upgrade ? `Upgrade to ${PLANS[sel].name}` : `Subscribe for ${euro(p.price)} ${per}`;

  const onBuy = () => {
    if (!p) return router.back();
    if (trial) return router.push({ pathname: '/plans/trial', params: { product: p.id } });
    buy(p.id, false);
  };

  const doRestore = async () => {
    if (!user) return;
    setRestoring(true);
    try {
      const r = await restore(user, league.id);
      if (r.kind === 'restored') Alert.alert(`${PLANS[r.plan].name} restored for ${r.team}`);
      else if (r.kind === 'none') Alert.alert('Nothing to restore', "We didn't find a Liga subscription on this Apple ID.");
      else Alert.alert(`This subscription belongs to ${r.fromName}`, `Move it to ${r.team}? ${r.fromName} goes back to Free.`, [
        { text: 'Keep it there', style: 'cancel' },
        { text: 'Move it', onPress: async () => { try { await moveSubscription(user, r.fromTeam, league.id); await reload(); } catch { Alert.alert('Could not move it', 'You need to be an owner or admin in both teams.'); } } },
      ]);
      await reload();
    } catch { Alert.alert("Couldn't reach the App Store", 'Try again in a moment.'); }
    setRestoring(false);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
        <Button label={restoring ? 'Restoring' : 'Restore'} size="sm" variant="ghost" loading={restoring} onPress={doRestore} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }}>
        <View style={{ gap: space[2] }}>
          <T v="title">{copy.title}</T>
          <T c="text2">{copy.body}</T>
        </View>

        <View style={{ gap: space[2] }}>
          <Seg value={period} onChange={setPeriod} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
          {paid && period === 'yearly' ? <Pill tone="win" label={`Save ${savePct(sel)}%`} /> : null}
        </View>

        {store === 'loading' ? <View style={{ gap: space[3] }}>{ORDER.map((o) => <Skeleton key={o} h={92} />)}</View> : null}
        {store === 'error' ? (
          <View style={{ gap: space[3], alignItems: 'flex-start' }}>
            <T c="text2">Couldn&apos;t reach the App Store. Try again.</T>
            <Button label="Try again" size="md" variant="secondary" onPress={loadStore} />
          </View>
        ) : null}
        {store === 'ready' ? (
          <View style={{ gap: space[3] }} accessibilityRole="radiogroup">
            {ORDER.map((o) => (
              <View key={o} style={{ gap: space[1] }}>
                <PlanCard plan={o} period={period} band={o === 'club' || o === 'business' ? band : null} selected={sel === o} current={o === current}
                  recommended={o === minPlan} onPress={() => setPick(o)} />
                {sel === o && (o === 'club' || o === 'business') ? (
                  <Button label={`See price for ${info.usage.players} ${info.usage.players === 1 ? 'player' : 'players'}`} size="sm" variant="ghost" onPress={() => router.push({ pathname: '/plans/calculator', params: { plan: o } })} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Lines plan={sel} />
        <View style={{ gap: 2 }}>
          <T>&ldquo;From 12 to 31 players in a week.&rdquo;</T>
          <T v="small" c="text2">Dave, admin at Acme Studio</T>
        </View>
        <Button label="Compare all features" variant="ghost" size="md" onPress={() => router.push('/plans/compare')} />

        <View style={{ gap: space[2] }}>
          <PurchaseButton state={state} label={label} plan={sel} onPress={onBuy} disabled={store !== 'ready' || (sel === current && sel !== 'free')} />
          {p ? (
            <T v="caption" c="text2" center>
              {trial ? `Then ${euro(p.price)} ${per} for ${info.team}. Renews until you cancel. Cancel any time in Settings, Subscription.`
                : `${euro(p.price)} ${per} for ${info.team}. Renews until you cancel. Cancel any time in Settings, Subscription.`}
            </T>
          ) : null}
          {state === 'pending' ? <T v="small" c="text2" center>Waiting for approval. We&apos;ll unlock {PLANS[sel].name} when it comes through.</T> : null}
          {error ? <T v="small" c="error" center>{error}</T> : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[2] }}>
          {footer('Restore', doRestore)}
          {footer('Terms', () => router.push('/about'))}
          {footer('Privacy', () => router.push('/about'))}
          {footer('Have a code?', () => router.push('/plans/promo'))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function footer(label: string, onPress: () => void) {
  return (
    <Pressable key={label} accessibilityRole="link" onPress={onPress} style={{ minHeight: 44, paddingHorizontal: space[2], justifyContent: 'center' }}>
      <T v="small" c="text2">{label}</T>
    </Pressable>
  );
}
