// B4.3 Match rules and M16.1 Results settings: confirmation mode, auto confirm hours, dispute time.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { confirmState, openDisputeCount, saveRules, type MatchRules } from '@/lib/confirm';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space } from '@/theme';
import { Screen, Seg, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

const HOURS = [12, 24, 48], DISPUTE = [24, 48, 72];

export default function MatchRulesScreen() {
  const { session } = useAuth();
  const { league, me } = useLeague();
  const [rules, setRules] = useState<MatchRules | null>(null);
  const [disputes, setDisputes] = useState(0);

  const load = useCallback(async () => {
    if (!league) return;
    setRules((await confirmState(league.id)).rules);
    setDisputes(await openDisputeCount(league.id));
  }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!league || !session) return null;

  const on = isOn(league, 'confirm');
  const admin = isAdmin(me) && !league.archived_at;
  const set = async (p: Partial<MatchRules>) => {
    if (!rules) return;
    setRules({ ...rules, ...p });
    try { await saveRules(session.user, league.id, p); } catch { Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.'); load(); }
  };
  const seg = (label: string, value: number, list: number[], key: keyof MatchRules) => (
    <View style={{ gap: space[2] }}>
      <T v="label" c="text2">{label}</T>
      {admin ? <Seg value={String(value)} onChange={(x) => set({ [key]: Number(x) })} options={list.map((h) => ({ value: String(h), label: `${h} h` }))} />
        : <Group><Row first label={`${value} h`} /></Group>}
    </View>
  );

  return (
    <Screen>
      <Header title="Match rules" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <Group title="Who can log" footer="Anyone in the league can log a match they played or saw.">
          <Row first label="Players and teammates" value="Default" />
        </Group>

        {!on ? (
          <Group title="Confirmation" footer="Results count right away. Turn on Match confirmation so the other side confirms first.">
            <Row first label="Turn on Match confirmation" onPress={admin ? () => router.push('/league/modules') : undefined} disabled={!admin} />
          </Group>
        ) : rules ? (
          <View style={{ gap: space[4] }}>
            <View style={{ gap: space[2] }}>
              <T v="label" c="text2">Confirmation</T>
              {admin ? (
                <Seg value={rules.mode} onChange={(mode) => set({ mode })} options={[{ value: 'auto', label: 'Auto confirm' }, { value: 'required', label: 'Must confirm' }]} />
              ) : <Group><Row first label={rules.mode === 'auto' ? 'Auto confirm' : 'Must confirm'} /></Group>}
              <T v="small" c="text2">{rules.mode === 'auto'
                ? `The other side confirms. No answer in ${rules.autoHours} h and the result counts anyway.`
                : 'The other side has to confirm. No answer in 72 h and the match does not count.'}</T>
            </View>
            {rules.mode === 'auto' ? seg('Auto confirm after', rules.autoHours, HOURS, 'autoHours') : null}
            {seg('Time to agree on a dispute', rules.disputeHours, DISPUTE, 'disputeHours')}
            <Group title="Disputes" footer="Disputed matches go to admins when the players don't agree in time.">
              <Row first label="Open disputes" value={String(disputes)} onPress={() => router.push('/league/disputes')} />
            </Group>
          </View>
        ) : null}

        <Group title="Fixing results" footer="Changes apply to new matches.">
          <Row first label="Edit window" value="15 min, then admins" />
          <Row label="Walkover" value="No rating change" />
        </Group>
        {!admin ? <T v="caption" c="text3">Owners and admins set these rules.</T> : null}
      </ScrollView>
    </Screen>
  );
}
