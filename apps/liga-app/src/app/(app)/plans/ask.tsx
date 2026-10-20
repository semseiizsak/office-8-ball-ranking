// B5.10 Ask your admin: members ask for an upgrade, one request a day, no pressure.
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { askAdmin } from '@/lib/billing';
import { PLANS, reasonCopy, shortDate } from '@/lib/plans';
import { space, useTheme } from '@/theme';
import { Button, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { Lines, useBillingInfo } from '@/ui/plan-kit';

export default function Ask() {
  const { t } = useTheme();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { info, league, user } = useBillingInfo();
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Owners and admins can buy themselves, so they get the paywall instead of asking themselves.
  useEffect(() => { if (info?.admin) router.replace({ pathname: '/plans', params: { reason: reason ?? 'compare' } }); }, [info, reason]);
  if (!info || !league || !user) return <Screen><Header title="Ask for an upgrade" /><View style={{ padding: space[4] }}><Skeleton h={240} /></View></Screen>;

  const copy = reasonCopy(reason, info.team, { players: info.usage.players, cap: info.usage.cap });
  const asked = sent ?? info.lastAsk;
  const send = async () => { setBusy(true); try { setSent(await askAdmin(user, league.id, copy.feature)); } catch { /* stays enabled to retry */ } setBusy(false); };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Ask for an upgrade" />
      <View style={{ flex: 1, padding: space[4], gap: space[4] }}>
        <T v="title">{copy.title}</T>
        <T c="text2">{copy.body}</T>
        <T v="label" c="text2">{PLANS[copy.min].name} includes</T>
        <Lines plan={copy.min} />
        <View style={{ flex: 1 }} />
        {asked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], justifyContent: 'center' }}>
            <Icon as={Check} size={18} color={t.win} />
            <T c="text2">You asked {info.owner} on {shortDate(asked)}.</T>
          </View>
        ) : <Button label={`Ask ${info.owner} to upgrade`} variant="brand" loading={busy} onPress={send} />}
        <Button label={asked ? 'Done' : 'Not now'} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
