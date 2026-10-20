// Shared pieces for B5 plans: paywall entry, plan card, usage bar, status card, purchase button.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronRight, Gem, Loader } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { billingInfo, purchase, PurchaseError, type BillingInfo } from '@/lib/billing';
import { PLANS, euro, longDate, shortDate, statusLine, type Period, type PlanId, type Reason, type Sub } from '@/lib/plans';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Icon, Pill, T } from '@/ui';

// Every paywall opens from a reason (B5.1). Members land on Ask your admin instead.
export const openPaywall = (reason: Reason | string = 'compare') => router.push({ pathname: '/plans', params: { reason } });

export function priceText(plan: PlanId, period: Period, band: number | null) {
  if (plan === 'free') return { big: '€0', small: 'Free forever' };
  if (plan === 'team') return period === 'yearly' ? { big: '€5.00 a month', small: '€59.99 billed yearly' } : { big: '€5.99 a month', small: 'Billed monthly' };
  const per = plan === 'club' ? (period === 'yearly' ? 0.79 : 0.99) : period === 'yearly' ? 1.99 : 2.49;
  const b = band ?? 20;
  return { big: `${euro(per)} a player`, small: period === 'yearly' ? `Up to ${b} players, ${euro(per * b * 12)} billed yearly` : `Up to ${b} players, ${euro(per * b)} a month` };
}

export function PlanCard({ plan, period, band, selected, current, recommended, onPress }: {
  plan: PlanId; period: Period; band: number | null; selected: boolean; current?: boolean; recommended?: boolean; onPress?: () => void;
}) {
  const { t } = useTheme();
  const p = priceText(plan, period, band);
  const fg = selected ? t.onBrand : t.text;
  const fg2 = selected ? t.onBrand : t.text2;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected, disabled: current }} disabled={current} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: selected ? t.brand : pressed ? t.surface3 : t.surface, borderRadius: radius.md, padding: space[4], gap: 4, minHeight: 44 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="heading" style={{ flex: 1, color: fg }}>{PLANS[plan].name}</T>
        {current ? <Pill label="Current" /> : recommended ? <Pill label="Recommended" tone={selected ? 'neutral' : 'brand'} /> : null}
      </View>
      <T v="number" style={{ color: fg }}>{p.big}</T>
      <T v="small" style={{ color: fg2 }}>{p.small}</T>
    </Pressable>
  );
}

export function Lines({ plan }: { plan: PlanId }) {
  const { t } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      {PLANS[plan].lines.map((l) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon as={Check} size={18} color={t.win} />
          <T>{l}</T>
        </View>
      ))}
    </View>
  );
}

// B5.7: the bar turns warning only at the limit.
export function UsageBar({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const { t } = useTheme();
  const full = cap !== null && used >= cap;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <T v="label" style={{ flex: 1 }}>{label}</T>
        <T v="label" c="text2">{cap === null ? `${used}, no limit` : `${used} of ${cap}`}</T>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${cap === null ? 8 : Math.min(100, (used / cap) * 100)}%`, backgroundColor: full ? t.warning : t.text }} />
      </View>
    </View>
  );
}

export function StatusCard({ sub, team, onPress }: { sub: Sub | null; team: string; onPress?: () => void }) {
  const s = statusLine(sub, team);
  return (
    <Card onPress={onPress} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="section" style={{ flex: 1 }} numberOfLines={1}>{s.title}</T>
        <Pill label={s.label} tone={s.tone} />
      </View>
      <T v="small" c="text2">{team}</T>
      <T>{s.body}</T>
    </Card>
  );
}

export type BuyState = 'idle' | 'confirming' | 'success' | 'pending';
// B5.5: four states in one place.
export function PurchaseButton({ state, label, plan, onPress, disabled }: { state: BuyState; label: string; plan: PlanId; onPress: () => void; disabled?: boolean }) {
  if (state === 'confirming') return <Button label="Waiting for the App Store" icon={Loader} variant="secondary" disabled />;
  if (state === 'success') return <Button label={`You're on ${PLANS[plan].name}`} icon={Check} variant="brand" />;
  if (state === 'pending') return <Button label="Waiting for approval" variant="secondary" disabled />;
  return <Button label={label} variant="brand" onPress={onPress} disabled={disabled} />;
}

// Runs a purchase through the mock store and maps the outcome to the button states.
export function useBuy(leagueId: string | undefined, onDone?: () => void) {
  const { session } = useAuth();
  const [state, setState] = useState<BuyState>('idle');
  const [error, setError] = useState<string | null>(null);
  const buy = async (productId: string, trial: boolean) => {
    if (!session || !leagueId) return;
    setState('confirming'); setError(null);
    try {
      const r = await purchase(session.user, leagueId, productId, trial);
      if (r === 'pending') { setState('pending'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState('success');
      setTimeout(() => onDone?.(), 1800);
    } catch (e) {
      setState('idle');
      if (e instanceof PurchaseError && e.kind === 'cancelled') return; // the person backed out, no message
      setError(e instanceof PurchaseError && e.kind === 'store' ? "Couldn't reach the App Store. Try again." : "Purchase didn't go through. Nothing was charged.");
    }
  };
  return { state, error, buy };
}

// Billing info for the current league's team, reloaded on focus.
export function useBillingInfo() {
  const { session } = useAuth();
  const { league } = useLeague();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const load = useCallback(async () => {
    if (session && league) setInfo(await billingInfo(session.user.id, league.id));
  }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { info, reload: load, league, user: session?.user ?? null };
}

// B0 subscription card: plan and renewal for owners and admins, plan name for members.
export function PlanSummary() {
  const { t } = useTheme();
  const { info } = useBillingInfo();
  if (!info) return null;
  const s = info.sub;
  const name = PLANS[info.plan].name;
  const line = info.plan === 'free' ? `Free, ${info.usage.players} of ${info.usage.cap} players`
    : !info.admin ? `${name} plan`
      : s?.status === 'trial' ? `${name} trial, ends ${shortDate(s.trial_ends_at!)}`
        : s?.status === 'ending' ? `${name} plan, ends ${longDate(s.renews_at)}`
          : s?.status === 'billing_issue' ? `${name} plan, payment didn't go through`
            : `${name} plan, renews ${longDate(s!.renews_at)}`;
  return (
    <Card onPress={() => router.push('/plans/status')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <Icon as={Gem} />
      <View style={{ flex: 1 }}>
        <T v="heading">{info.team}</T>
        <T v="caption" c="text3">{line}</T>
      </View>
      {s?.status === 'billing_issue' || s?.status === 'pending' ? <Pill label={s.status === 'pending' ? 'Waiting' : 'Payment issue'} tone="warning" /> : <Icon as={ChevronRight} color={t.text3} />}
    </Card>
  );
}

// B5.7 soft limit on invite screens: full crews see the reason and an Upgrade, members an Ask.
export function SeatsNotice() {
  const { info } = useBillingInfo();
  if (!info || info.usage.players < info.usage.cap) return null;
  const name = PLANS[info.plan].name;
  return (
    <Card style={{ gap: space[3] }}>
      <T v="heading">Your crew is full on {name}, {info.usage.players} of {info.usage.cap}</T>
      <T v="small" c="text2">{info.admin ? 'New players can still join and watch. A bigger plan lets everyone log matches.' : `New players can join and watch. Ask ${info.owner} to make room.`}</T>
      <Button label={info.admin ? 'Upgrade' : `Ask ${info.owner}`} size="md" variant={info.admin ? 'brand' : 'secondary'} onPress={() => openPaywall('seats')} />
    </Card>
  );
}
