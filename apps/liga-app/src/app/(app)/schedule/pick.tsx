// M10.1 Pick a time (for a cup match): quick picks, a day, then a 15 minute slot, in league time
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DAYS, dayHm, hm, suggestTime, tzOf, weekday } from '@/lib/cup';
import { dayStarts, quickTimes, slotsFor, zoneNote } from '@/lib/schedule';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, IconButton, T } from '@/ui';

export default function PickTime() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league } = useLeague();
  const { cup } = useLocalSearchParams<{ cup?: string }>();
  const tz = tzOf(league);
  const [now] = useState(() => Date.now());
  const days = dayStarts(tz, now);
  const [day, setDay] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const note = zoneNote(tz);

  const chip = (key: string, label: string, sel: boolean, onPress: () => void, disabled = false) => (
    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: sel, disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? t.primary : t.surface2 }}>
      <T v="label" c={sel ? 'onPrimary' : disabled ? 'text3' : 'text'} style={disabled ? { textDecorationLine: 'line-through' } : undefined}>{label}</T>
    </Pressable>
  );

  const done = async () => {
    if (!at || !session || !cup) return;
    setBusy(true);
    try { await suggestTime(session.user, cup, new Date(at).toISOString()); router.back(); }
    catch { Alert.alert('That did not work', 'Try again in a moment.'); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
        <T v="section">Pick a time</T>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], gap: space[4], paddingBottom: 140 }}>
        {note ? <T v="small" c="text2">Times are in {note}.</T> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {quickTimes(tz, now).map((q) => chip(q.label, q.label, at === q.at, () => setAt(q.at)))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {days.map((start, i) => chip(String(start), i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[weekday(start + 3600000, tz) - 1], day === i, () => setDay(i)))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {slotsFor(days[day], tz).map((s) => chip(String(s), hm(s, tz), at === s, () => setAt(s), s < now))}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space[4], paddingBottom: insets.bottom + space[3], backgroundColor: t.bg, gap: space[2] }}>
        {at ? <T v="label" center>{dayHm(at, tz)}</T> : null}
        <Button label="Done" disabled={!at || !cup} loading={busy} onPress={done} />
      </View>
    </View>
  );
}
