// G2 Cup settings (B4.5): schedule, size, seeding, walkover rule, prizes, reminders, pause. Admins edit, players read.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { CUP_DEFAULTS, DAYS, getCup, saveCupSettings, weekOf, tzOf, type CupSettings } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

export default function CupSettingsScreen() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me, reloadLeagues } = useLeague();
  const [base, setBase] = useState<CupSettings | null>(null);
  const [draft, setDraft] = useState<Partial<CupSettings>>({});
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const load = useCallback(async () => {
    if (!league) return;
    const x = await getCup(league.id);
    setBase(x?.cfg ?? CUP_DEFAULTS);
  }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!league || !base) return <View style={{ flex: 1, backgroundColor: t.bg }}><Header title="Cup settings" /></View>;
  const admin = isAdmin(me) && !league.archived_at;
  const cfg: CupSettings = { ...base, ...draft };
  const enabled = on ?? isOn(league, 'cup');
  const dirty = Object.keys(draft).some((k) => draft[k as keyof CupSettings] !== base[k as keyof CupSettings]) || (on !== null && on !== isOn(league, 'cup'));
  const coins = isOn(league, 'coins');
  const set = <K extends keyof CupSettings>(k: K, v: CupSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const thisWeek = weekOf(now, tzOf(league)).key;

  const chips = <V extends string | number>(value: V, opts: { v: V; label: string }[], onPick: (v: V) => void, disabled = false) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], padding: space[3] }}>
      {opts.map((o) => {
        const sel = o.v === value;
        return (
          <Pressable key={String(o.v)} accessibilityRole="button" accessibilityState={{ selected: sel, disabled }} disabled={disabled || !admin} onPress={() => onPick(o.v)}
            style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? t.primary : t.surface2 }}>
            <T v="label" c={sel ? 'onPrimary' : disabled ? 'text3' : 'text'}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
  const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ v: from + i, label: `${from + i}:00` }));
  const sw = (label: string, value: boolean, onChange: (v: boolean) => void, first = false) => (
    <Row first={first} label={label} right={<Switch value={value} disabled={!admin} onValueChange={onChange} trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" accessibilityLabel={label} />} />
  );

  const doSave = async (applyNow: boolean) => {
    if (!session) return;
    setBusy(true);
    try {
      await saveCupSettings(session.user, league.id, draft, { thisWeek: applyNow, on: on ?? undefined });
      await reloadLeagues(league.id);
      setDraft({}); setOn(null);
      await load();
    } catch { Alert.alert("Couldn't save", 'Try again.'); }
    setBusy(false);
  };
  const saveIt = () => Alert.alert('Apply from next week, or to this week too?', 'A cup that is already drawn keeps its times.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Next week', onPress: () => doSave(false) }, { text: 'This week too', onPress: () => doSave(true) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Cup settings" right={admin ? <Button label="Save" size="sm" disabled={!dirty} loading={busy} onPress={saveIt} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        {!admin ? <T c="text2">Only admins can change these. Here is how the cup runs.</T> : null}
        <Group footer={`All ${members.length} members see the sign up wall.`}>
          {sw('Run the weekly cup', enabled, (v) => setOn(v), true)}
        </Group>

        <Group title="Sign up opens">
          {chips(cfg.openDay, DAYS.slice(0, 5).map((d, i) => ({ v: i + 1, label: d })), (v) => set('openDay', v))}
          {chips(cfg.openHour, hours(7, 10), (v) => set('openHour', v))}
        </Group>
        <Group title="Sign up closes and the draw" footer="The draw runs automatically when sign up closes.">
          {chips(cfg.closeHour, hours(Math.max(cfg.openHour + 1, 10), 16), (v) => set('closeHour', v))}
        </Group>
        <Group title="Final deadline" footer="Earlier rounds get their deadlines spread through the week.">
          {chips(cfg.finalDay, DAYS.slice(cfg.openDay, 7).map((d, i) => ({ v: cfg.openDay + i + 1, label: d })), (v) => set('finalDay', v))}
          {chips(cfg.finalHour, hours(12, 19), (v) => set('finalHour', v))}
        </Group>
        <Group title="Players" footer={`Time zone ${tzOf(league)}, from the league.`}>
          <Row first label="Minimum" />
          {chips(cfg.min, [3, 4, 6].map((v) => ({ v, label: String(v) })), (v) => set('min', v))}
          <Row label="Maximum" />
          {chips(cfg.max, [4, 8, 16].map((v) => ({ v, label: String(v) })), (v) => set('max', v))}
          {sw('At least 1 match to sign up', cfg.minMatches, (v) => set('minMatches', v))}
        </Group>
        <Group title="Seeding">
          {chips(cfg.seeding, [{ v: 'rating' as const, label: 'By rating' }, { v: 'random' as const, label: 'Random' }], (v) => set('seeding', v))}
        </Group>
        <Group title="Unplayed after the deadline">
          {chips(cfg.walkover, [{ v: 'seed' as const, label: 'Ready player or higher seed goes through' }, { v: 'admin' as const, label: 'Admin decides' }], (v) => set('walkover', v))}
        </Group>
        <Group title="Prizes" footer={coins ? 'No entry fee. The league gives the prizes.' : 'Coin prizes need Coins. The cup badge is always on.'}>
          <Row first label="Winner coins" value={coins ? undefined : 'Needs Coins'} />
          {chips(cfg.winnerCoins, [100, 300, 500].map((v) => ({ v, label: String(v) })), (v) => set('winnerCoins', v), !coins)}
          <Row label="Runner up coins" value={coins ? undefined : 'Needs Coins'} />
          {chips(cfg.runnerUpCoins, [0, 100, 200].map((v) => ({ v, label: String(v) })), (v) => set('runnerUpCoins', v), !coins)}
        </Group>
        <Group title="Reminders">
          {sw('Remind players before deadlines', cfg.reminders, (v) => set('reminders', v), true)}
        </Group>
        <Group title="Breaks">
          {sw('Skip this week', cfg.skipWeek === thisWeek, (v) => set('skipWeek', v ? thisWeek : null), true)}
          <Row label="Pause the cup" value={cfg.pausedUntil ? `Until ${new Date(cfg.pausedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Off'} />
          {chips(cfg.pausedUntil ? Math.round((new Date(cfg.pausedUntil).getTime() - now) / (7 * 86400000)) : 0,
            [{ v: 0, label: 'Off' }, { v: 2, label: '2 weeks' }, { v: 4, label: '4 weeks' }],
            (v) => set('pausedUntil', v ? new Date(now + v * 7 * 86400000).toISOString() : null))}
        </Group>
        {admin ? <Button label="Manage this week's cup" variant="secondary" onPress={() => router.push('/cup/manage')} /> : null}
      </ScrollView>
    </View>
  );
}
