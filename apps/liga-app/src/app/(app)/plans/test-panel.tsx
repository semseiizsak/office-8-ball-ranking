// Billing test panel (test build only, 7 taps on the logo in About): store outcomes, subscription states,
// time skips and the local remote config for A0.1, B9.3, B9.4 and B9.5.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import {
  setSim, simState, testApprovePending, testMakeMeAdmin, testResetStore, testSetStatus, testSkipToEnd, type Outcome,
} from '@/lib/billing';
import { setConfig, useRemoteConfig, type RemoteConfig } from '@/lib/remote-config';
import { useLeague } from '@/providers/league';
import { space } from '@/theme';
import { Button, Card, Screen, Seg, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { StatusCard, openPaywall, useBillingInfo } from '@/ui/plan-kit';

type Status = Parameters<typeof testSetStatus>[2];
const STATUSES: { value: Status; label: string }[] = [
  { value: 'none', label: 'Free' }, { value: 'trial', label: 'Trial' }, { value: 'active', label: 'Active' }, { value: 'ending', label: 'Ending' },
  { value: 'billing_issue', label: 'Payment issue' }, { value: 'expired', label: 'Expired' }, { value: 'pending', label: 'Waiting' },
];
const REASONS = ['seats', 'leagues', 'kiosk', 'seasons', 'history', 'cardart', 'export', 'readonly', 'pass', 'trial_end', 'compare'];

export default function TestPanel() {
  const { info, reload, league, user } = useBillingInfo();
  const { refresh } = useLeague();
  const cfg = useRemoteConfig();
  const [sim, setSimState] = useState<{ outcome: Outcome; storeDown: boolean } | null>(null);
  const [plan, setPlan] = useState<'team' | 'club' | 'business'>('team');
  useFocusEffect(useCallback(() => { simState().then(setSimState); }, []));

  const sim2 = async (p: Partial<{ outcome: Outcome; storeDown: boolean }>) => { await setSim(p); setSimState(await simState()); };
  const run = async (fn: () => Promise<unknown>) => { await fn(); await reload(); };
  const conf = (p: Partial<RemoteConfig>) => setConfig(p);
  const section = (title: string, body: ReactNode) => (
    <Card key={title} style={{ gap: space[3] }}>
      <T v="heading">{title}</T>
      {body}
    </Card>
  );

  return (
    <Screen>
      <Header title="Billing test panel" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <T v="small" c="text2">Test build only. Changes apply to {info?.team ?? 'this team'} on this phone.</T>
        {info ? <StatusCard sub={info.sub} team={info.team} /> : null}

        {section('Next purchase', sim ? (
          <View style={{ gap: space[3] }}>
            <Seg value={sim.outcome} onChange={(v) => sim2({ outcome: v })} options={[{ value: 'success', label: 'Success' }, { value: 'cancel', label: 'Cancel' }, { value: 'fail', label: 'Fail' }, { value: 'pending', label: 'Pending' }]} />
            <Seg value={sim.storeDown ? 'down' : 'up'} onChange={(v) => sim2({ storeDown: v === 'down' })} options={[{ value: 'up', label: 'Store reachable' }, { value: 'down', label: 'Store down' }]} />
          </View>
        ) : null)}

        {section('Subscription state', (
          <View style={{ gap: space[3] }}>
            <Seg value={plan} onChange={setPlan} options={[{ value: 'team', label: 'Team' }, { value: 'club', label: 'Club' }, { value: 'business', label: 'Business' }]} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {STATUSES.map((s) => <Button key={s.value} label={s.label} size="sm" variant="secondary" onPress={() => user && league && run(() => testSetStatus(user, league.id, s.value, plan))} />)}
            </View>
            <Button label="Skip to end of trial or period" size="md" variant="secondary" onPress={() => league && run(() => testSkipToEnd(league.id))} />
            <Button label="Approve waiting purchase" size="md" variant="secondary" onPress={() => league && run(() => testApprovePending(league.id))} />
            <Button label="Reset trial, purchases and requests" size="md" variant="secondary" onPress={() => league && run(() => testResetStore(league.id))} />
            <Button label={info?.admin ? 'You are an admin here' : 'Make me an admin here'} size="md" variant="secondary" disabled={!!info?.admin}
              onPress={() => user && league && run(async () => { await testMakeMeAdmin(user, league.id); await refresh(); Alert.alert('You are an admin here', 'You can buy plans for this team now.'); })} />
          </View>
        ))}

        {section('Open the paywall', (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {REASONS.map((r) => <Button key={r} label={r} size="sm" variant="secondary" onPress={() => openPaywall(r)} />)}
          </View>
        ))}

        {section('Remote config', (
          <View style={{ gap: space[3] }}>
            <T v="label" c="text2">App update</T>
            <Seg value={cfg.update} onChange={(v) => conf({ update: v, bannerHiddenAt: null })} options={[{ value: 'none', label: 'None' }, { value: 'recommended', label: 'Recommended' }, { value: 'required', label: 'Required' }]} />
            <Seg value={cfg.storeHasUpdate ? 'yes' : 'no'} onChange={(v) => conf({ storeHasUpdate: v === 'yes' })} options={[{ value: 'yes', label: 'In the store' }, { value: 'no', label: 'Not yet in store' }]} />
            <T v="label" c="text2">Server</T>
            <Seg value={cfg.maintenance} onChange={(v) => conf({ maintenance: v })} options={[{ value: 'none', label: 'Normal' }, { value: 'planned', label: 'Maintenance' }, { value: 'outage', label: 'Outage' }]} />
            <T v="caption" c="text3">Required update and outage cover the whole app. Their own buttons switch them back off in the test build.</T>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
