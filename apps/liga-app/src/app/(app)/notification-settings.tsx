// K6 and B2.4 notification settings, K6.1 per type detail, K6.2 quiet hours, K6.3 and B2.4.1 per league level.
// Stored on this phone. Test build: notifications are local; remote push needs a dev build.
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, BellOff, ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, Switch, View } from 'react-native';

import {
  CATALOGUE, CATEGORIES, DEFAULT_PREFS, getPrefs, levelOf, pushStatus, requestPush, sendTest, setPrefs,
  type Category, type LeagueLevel, type Level, type Prefs, type PushStatus,
} from '@/lib/inbox';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Icon, IconButton, Screen, Seg, T } from '@/ui';
import { showBanner } from '@/ui/inbox-runtime';

const HOUR = 3600000;
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const until = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const future = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
const tomorrow8 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); };

export default function NotificationSettings() {
  const { t } = useTheme();
  const { leagues } = useLeague();
  const [p, setP] = useState<Prefs | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [open, setOpen] = useState<Category | null>(null);

  const load = useCallback(async () => { const [prefs, s] = await Promise.all([getPrefs(), pushStatus()]); setP(prefs); setStatus(s); }, []);
  useFocusEffect(useCallback(() => {
    load();
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') load(); });
    return () => sub.remove();
  }, [load]));

  if (!p) return <Screen>{null}</Screen>;
  const update = (next: Prefs) => { setP(next); setPrefs(next); };
  const setType = (kind: string, l: Level) => update({ ...p, types: { ...p.types, [kind]: l } });
  const catOn = (c: Category) => CATALOGUE.some((x) => x.category === c && levelOf(p, x.kind) === 'push');
  const toggleCat = (c: Category, on: boolean) => {
    const list = CATALOGUE.filter((x) => x.category === c);
    const anyDef = list.some((x) => x.def === 'push');
    const types = { ...p.types };
    list.forEach((x) => { types[x.kind] = on ? (anyDef ? x.def : 'push') : levelOf(p, x.kind) === 'off' ? 'off' : 'inbox'; });
    update({ ...p, types });
  };
  const lg = (id: string) => p.leagues[id] ?? { level: 'default' as LeagueLevel, muteUntil: null };
  const setLg = (id: string, v: Partial<Prefs['leagues'][string]>) => update({ ...p, leagues: { ...p.leagues, [id]: { ...lg(id), ...v } } });
  const off = status === 'denied';

  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={off && label !== 'Product news'}
      trackColor={{ false: t.surface3, true: t.win }} thumbColor="#FFFFFF" ios_backgroundColor={t.surface3} />
  );
  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} hitSlop={4}
      style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <T v="label" c={on ? 'onPrimary' : 'text'}>{label}</T>
    </Pressable>
  );
  const stepper = (label: string, value: number, onChange: (h: number) => void) => (
    <View style={{ flex: 1, gap: 6 }}>
      <T v="label" c="text2">{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.surface2, borderRadius: radius.pill, padding: 4 }}>
        <IconButton icon={Minus} label={`${label} earlier`} tone="ghost" onPress={() => onChange((value + 23) % 24)} />
        <T v="number">{hh(value)}</T>
        <IconButton icon={Plus} label={`${label} later`} tone="ghost" onPress={() => onChange((value + 1) % 24)} />
      </View>
    </View>
  );
  const typeRow = (kind: string, label: string, action?: boolean) => (
    <View key={kind} style={{ gap: space[2], paddingTop: space[3] }}>
      <T v="label">{label}</T>
      <Seg<Level> value={levelOf(p, kind)} onChange={(l) => setType(kind, l)}
        options={action ? [{ value: 'push', label: 'Push and inbox' }, { value: 'inbox', label: 'Inbox only' }] : [{ value: 'push', label: 'Push' }, { value: 'inbox', label: 'Inbox only' }, { value: 'off', label: 'Off' }]} />
      {action ? <T v="caption" c="text3">{"You'll still see this in your inbox because it needs a response."}</T> : null}
    </View>
  );
  const category = (c: (typeof CATEGORIES)[number]) => {
    const expanded = open === c.id;
    return (
      <Card key={c.id} style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${c.label} details`} accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : c.id)}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <T v="heading">{c.label}</T>
              <T v="small" c="text2">{catOn(c.id) ? c.sub : 'Inbox only'}</T>
            </View>
            <Icon as={expanded ? ChevronUp : ChevronDown} size={18} color={t.text3} />
          </Pressable>
          {toggle(catOn(c.id), (v) => toggleCat(c.id, v), c.label)}
        </View>
        {expanded ? CATALOGUE.filter((x) => x.category === c.id).map((x) => typeRow(x.kind, x.label, x.action)) : null}
      </Card>
    );
  };
  const leagueCard = (l: { id: string; name: string }) => {
    const s = lg(l.id), muted = future(s.muteUntil);
    return (
      <Card key={l.id} style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{l.name}</T>
          {muted ? <Icon as={BellOff} size={18} color={t.text2} /> : null}
        </View>
        <Seg<LeagueLevel> value={s.level} onChange={(level) => setLg(l.id, { level })}
          options={[{ value: 'default', label: 'Default' }, { value: 'mine', label: 'About me' }, { value: 'off', label: 'Off' }]} />
        <T v="caption" c="text3">
          {s.level === 'default' ? 'Uses your categories above.' : s.level === 'mine' ? 'Only things about you, like matches with you.' : 'Nothing, only things that need you land in your inbox.'}
        </T>
        {muted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <T v="small" c="text2" style={{ flex: 1 }}>{s.muteUntil!.startsWith('9999') ? 'Muted until you turn it back on' : `Muted until ${until(s.muteUntil!)}`}</T>
            <Button label="Unmute" size="sm" variant="secondary" onPress={() => setLg(l.id, { muteUntil: null })} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {chip('Mute 1 hour', false, () => setLg(l.id, { muteUntil: inHours(1) }))}
            {chip('8 hours', false, () => setLg(l.id, { muteUntil: inHours(8) }))}
            {chip('1 week', false, () => setLg(l.id, { muteUntil: inHours(168) }))}
            {chip('Until I turn it on', false, () => setLg(l.id, { muteUntil: '9999-01-01T00:00:00.000Z' }))}
          </View>
        )}
      </Card>
    );
  };

  const paused = future(p.pauseUntil);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="section">Notifications</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        {off ? (
          <Card style={{ gap: space[3] }}>
            <T v="heading">{"Notifications are off for Liga"}</T>
            <T v="small" c="text2">{"You'll miss challenges and match news. Turn them on in Settings, it takes 10 seconds. Your inbox keeps collecting either way."}</T>
            <Button label="Open Settings" size="md" onPress={() => Linking.openSettings()} />
          </Card>
        ) : status === 'undetermined' ? (
          <Card style={{ gap: space[3] }}>
            <T v="heading">{"Notifications aren't on yet"}</T>
            <Button label="Turn on notifications" size="md" onPress={async () => { setStatus(await requestPush()); }} />
          </Card>
        ) : null}

        <Card style={{ gap: space[3] }}>
          <T v="heading">Pause all</T>
          <T v="small" c="text2">{paused ? `Paused until ${until(p.pauseUntil!)}` : 'Everything still lands in your inbox while paused.'}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {chip('Off', !paused, () => update({ ...p, pauseUntil: null }))}
            {chip('1 hour', false, () => update({ ...p, pauseUntil: inHours(1) }))}
            {chip('8 hours', false, () => update({ ...p, pauseUntil: inHours(8) }))}
            {chip('Until 8:00', false, () => update({ ...p, pauseUntil: tomorrow8() }))}
            {chip('1 week', false, () => update({ ...p, pauseUntil: inHours(168) }))}
          </View>
        </Card>

        <Card style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <T v="heading">Quiet hours</T>
              <T v="small" c="text2">{p.quiet.on ? `${hh(p.quiet.from)} to ${hh(p.quiet.to)}, your phone's time` : 'Off'}</T>
            </View>
            {toggle(p.quiet.on, (on) => update({ ...p, quiet: { ...p.quiet, on } }), 'Quiet hours')}
          </View>
          {p.quiet.on ? (
            <>
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                {stepper('From', p.quiet.from, (from) => update({ ...p, quiet: { ...p.quiet, from } }))}
                {stepper('To', p.quiet.to, (to) => update({ ...p, quiet: { ...p.quiet, to } }))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <T v="small" c="text2" style={{ flex: 1 }}>Notifications wait in your inbox. Allow urgent ones about your own deadlines.</T>
                {toggle(p.quiet.urgent, (urgent) => update({ ...p, quiet: { ...p.quiet, urgent } }), 'Allow urgent ones')}
              </View>
            </>
          ) : null}
        </Card>

        <T v="section" style={{ marginTop: space[2] }}>Categories</T>
        {CATEGORIES.map(category)}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <T v="heading">Product news</T>
            <T v="small" c="text2">{p.product ? 'New features, now and then' : 'Off'}</T>
          </View>
          {toggle(p.product, (product) => update({ ...p, product }), 'Product news')}
        </Card>

        <T v="section" style={{ marginTop: space[2] }}>Leagues</T>
        {leagues.map(leagueCard)}

        <Button label="Send a test notification" variant="secondary" disabled={status !== 'granted'}
          onPress={async () => { if (await sendTest()) showBanner({ title: 'Test sent', body: 'Lock your phone, it arrives in 3 seconds.' }); }} />
        <Button label="Reset to defaults" variant="ghost" onPress={() => update(DEFAULT_PREFS)} />
        <T v="caption" c="text3" center>{"Account and security notifications can't be turned off."}</T>
        <T v="caption" c="text3" center>{"Test build: notifications come from this phone. Push from other people's phones needs the full app."}</T>
      </ScrollView>
    </Screen>
  );
}
