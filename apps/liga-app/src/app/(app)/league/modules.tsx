// B4.4 Modules, B4.4.2 Needs another module, A8.3 Apply a setup (league settings)
import { Check, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { MODULES, type ModuleId } from '@/lib/modules';
import { applySetupModules, isCustomised, moduleOf, names, needsOf, planToggle, setModules, setupOf, SETUPS, stateOf, type SetupId } from '@/lib/module-settings';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Icon, Pill, Screen, T } from '@/ui';
import { Group, Header } from '@/ui/list-row';

const GROUPS: { title: string; ids: ModuleId[] }[] = [
  { title: 'Compete', ids: ['challenges', 'live', 'schedule', 'confirm'] },
  { title: 'Events', ids: ['cup', 'seasons', 'awards'] },
  { title: 'Economy', ids: ['coins', 'quests', 'shop', 'cards', 'pass'] },
  { title: 'Fun', ids: ['badges', 'xp', 'shame', 'predictions'] },
  { title: 'Social', ids: ['chat'] },
  { title: 'Place', ids: ['kiosk'] },
];

export default function Modules() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me, reloadLeagues } = useLeague();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!league || !session) return null;
  const user = session.user;
  const can = isAdmin(me) && !league.archived_at;
  const state = stateOf(league);
  const onCount = MODULES.filter((m) => state[m.id]).length;
  const setup = setupOf(league.template);
  const custom = isCustomised(league);

  const fail = () => Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.');
  const write = async (changes: Partial<Record<ModuleId, boolean>>, msg: string) => {
    setBusy(true);
    try { await setModules(user, league.id, changes); await reloadLeagues(league.id); setNote(msg); } catch { fail(); }
    setBusy(false);
  };

  const flip = (id: ModuleId, on: boolean) => {
    const m = moduleOf(id);
    const { changes, extra } = planToggle(league, id, on);
    if (!extra.length) return write(changes, `${m.label} is ${on ? 'on' : 'off'} for everyone.`);
    if (on) return Alert.alert(`${m.label} needs ${names(extra)}`, `We'll turn on ${extra.length === 1 ? 'both' : `all ${extra.length + 1}`}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: extra.length === 1 ? 'Turn on both' : `Turn on all ${extra.length + 1}`, onPress: () => write(changes, `${names([id, ...extra])} are on for everyone.`) },
    ]);
    Alert.alert(`Turn off ${m.label}?`, `Turning off ${m.label} also turns off ${names(extra)}. Their data is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn off', style: 'destructive', onPress: () => write(changes, `${names([id, ...extra])} are off. Nothing was deleted.`) },
    ]);
  };

  const pickSetup = (id: SetupId) => {
    if (id === setup.id && !custom) return;
    const s = setupOf(id);
    Alert.alert(`Switch to ${s.label}?`, 'Every module goes back to what this setup turns on. Nothing is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apply', onPress: async () => {
        setBusy(true);
        try { await applySetupModules(user, league.id, id); await reloadLeagues(league.id); setNote(`${s.label} applied.`); } catch { fail(); }
        setBusy(false);
      } },
    ]);
  };

  const setupRow = (s: (typeof SETUPS)[number], i: number) => {
    const on = s.id === setup.id;
    return (
      <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !can }} disabled={!can || busy} onPress={() => pickSetup(s.id)}
        style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3],
          backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading">{on && custom ? `${s.label}, customised` : s.label}</T>
          <T v="small" c="text2">{s.body}</T>
        </View>
        {on ? <Icon as={Check} size={20} /> : null}
      </Pressable>
    );
  };

  const moduleRow = (id: ModuleId, i: number) => {
    const m = moduleOf(id);
    const needs = needsOf(id);
    const missing = needs.filter((x) => !state[x]);
    return (
      <View key={id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading">{m.label}</T>
          <T v="small" c="text2">{m.body}</T>
          {needs.length ? <T v="caption" c={missing.length ? 'text' : 'text3'}>Needs {names(needs)}</T> : null}
        </View>
        <Switch accessibilityLabel={m.label} value={state[id]} disabled={!can || busy} onValueChange={(v) => flip(id, v)}
          trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />
      </View>
    );
  };

  return (
    <Screen>
      <Header title="Modules" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <View style={{ gap: space[2] }}>
          <T v="body" c="text2">Turn parts of Liga on or off for everyone in this league. Nothing is deleted when you switch one off.</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Pill label={`${onCount} of ${MODULES.length} modules on`} />
            {!can ? <Pill label={league.archived_at ? 'Archived' : 'View only'} icon={Lock} /> : null}
          </View>
          {!can && !league.archived_at ? <T v="small" c="text3">Owners and admins switch modules. Here is what this league uses.</T> : null}
          {note ? <T v="small" c="text">{note}</T> : null}
        </View>

        <Group title="Setup" footer="A starting point. Switch any module on or off below.">
          {SETUPS.map(setupRow)}
        </Group>

        <Group title="Core">
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="heading">Rating and ladder</T>
              <T v="small" c="text2">Match log, profiles, history and inbox. Always on.</T>
            </View>
            <Pill label="Core" />
          </View>
        </Group>

        {GROUPS.map((g) => <Group key={g.title} title={g.title}>{g.ids.map(moduleRow)}</Group>)}
      </ScrollView>
    </Screen>
  );
}
