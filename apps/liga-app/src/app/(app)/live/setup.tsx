// M11.1 Live setup (players come from the Log screen, a challenge or a cup game)
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Radio, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { busyPlayer, createLive, formatLabel, type LiveFormat } from '@/lib/live';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, IconButton, Seg, T } from '@/ui';
import { LiveTheme } from '@/ui/live';

const TARGET: Record<string, number> = { foosball: 10, pingpong: 11, pool: 5, darts: 3, chess: 1, esports: 3 };
const ids = (s?: string) => (s ? s.split(',').filter(Boolean) : []);

export default function LiveSetupScreen() {
  return <LiveTheme><LiveSetup /></LiveTheme>;
}

function LiveSetup() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const p = useLocalSearchParams<{ a?: string; b?: string; challenge?: string; cup?: string }>();
  const [a] = useState(() => ids(p.a)), [b] = useState(() => ids(p.b));
  const def = TARGET[league?.sport ?? ''] ?? 10;
  const [kind, setKind] = useState<LiveFormat['kind']>('first');
  const [to, setTo] = useState(def);
  const [minutes, setMinutes] = useState(10);
  const [scorers, setScorers] = useState<'both' | 'me'>('both');
  const [visibility, setVisibility] = useState<'league' | 'private'>('league');
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (league) busyPlayer(league.id, [...a, ...b]).then((x) => setBusy(x?.name ?? null));
  }, [league, a, b]);

  const byId = new Map(members.map((m) => [m.id, m]));
  const format: LiveFormat = kind === 'first' ? { kind, to } : kind === 'timed' ? { kind, minutes } : { kind };
  const ok = !!league && isOn(league, 'live') && a.length > 0 && a.length === b.length && !busy && !!me && [...a, ...b].includes(me.id);

  const go = async () => {
    if (!league || !session) return;
    setSaving(true); setError(undefined);
    try {
      const id = await createLive(session.user, { league: league.id, a, b, format, scorers, visibility: p.cup ? 'league' : visibility, challenge: p.challenge ?? null, cup: p.cup ?? null });
      router.replace(`/live/${id}`);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error && e.message === 'already live' ? 'Someone here is already live.' : 'Could not go live. Try again.');
    }
  };

  const side = (list: string[]) => (
    <View style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
      <View style={{ flexDirection: 'row', gap: space[1] }}>
        {list.map((id) => { const m = byId.get(id); return m ? <Avatar key={id} name={m.display_name} colour={m.colour} jersey={m.jersey} size={56} /> : null; })}
      </View>
      <T v="section" center numberOfLines={2}>{list.map((id) => (id === me?.id ? 'You' : byId.get(id)?.display_name ?? '')).join(' and ')}</T>
    </View>
  );

  const chip = (label: string, on: boolean, press: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={press}
      style={{ minWidth: 56, height: 44, paddingHorizontal: space[4], borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
      <T v="label" c={on ? 'onPrimary' : 'text'}>{label}</T>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
        <T v="section">Play live</T>
        <IconButton icon={X} label="Cancel" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 140, gap: space[6] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: radius.lg, paddingVertical: space[5], paddingHorizontal: space[3] }}>
          {side(a)}
          <T v="label" c="text3">vs</T>
          {side(b)}
        </View>
        {busy ? <T c="warning">{busy} is already live. Finish that match first.</T> : null}

        <View style={{ gap: space[3] }}>
          <T v="heading">Format</T>
          <Seg value={kind} onChange={setKind} options={[{ value: 'first', label: 'First to' }, { value: 'timed', label: 'Timed' }, { value: 'open', label: 'No target' }]} />
          {kind === 'first' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{[...new Set([def, 5, 7, 10, 11, 21])].sort((x, y) => x - y).map((n) => chip(String(n), to === n, () => setTo(n)))}</View> : null}
          {kind === 'timed' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{[5, 10, 15, 20].map((n) => chip(`${n} min`, minutes === n, () => setMinutes(n)))}</View> : null}
          <T v="small" c="text3">{formatLabel(format)}{kind === 'open' ? '. Finish when you are done, the leader wins.' : kind === 'timed' ? '. The leader at the whistle wins.' : '.'}</T>
        </View>

        <View style={{ gap: space[3] }}>
          <T v="heading">Who keeps score</T>
          <Seg value={scorers} onChange={setScorers} options={[{ value: 'both', label: 'Both phones' }, { value: 'me', label: 'Only me' }]} />
          <T v="small" c="text3">A kiosk tablet can keep score too once the Kiosk module is set up.</T>
        </View>

        {p.cup ? null : (
          <View style={{ gap: space[3] }}>
            <T v="heading">Who can watch</T>
            <Seg value={visibility} onChange={setVisibility} options={[{ value: 'league', label: 'Whole league' }, { value: 'private', label: 'Only us' }]} />
            <T v="small" c="text3">{visibility === 'league' ? 'Teammates can watch, react and chat.' : 'No viewers and no chat, just the scoreboard.'}</T>
          </View>
        )}
        {error ? <T v="small" c="error">{error}</T> : null}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space[4], paddingBottom: insets.bottom + space[3], backgroundColor: t.bg }}>
        <Button label="Go live" icon={Radio} onPress={go} loading={saving} disabled={!ok} variant="danger" />
      </View>
    </View>
  );
}
