// M10.5 Plan: everything with a time this week (challenges, cup times and deadlines, match of the day)
import { router, useFocusEffect } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { dayKey, DAYS, hm } from '@/lib/cup';
import { weekPlan, type PlanItem } from '@/lib/schedule';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { playerColours, radius, space, useTheme } from '@/theme';
import { Button, Empty, IconButton, Seg, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof weekPlan>>;

export default function Plan() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [d, setD] = useState<Data | null>(null);
  const [view, setView] = useState<'week' | 'agenda'>('agenda');
  const [offset, setOffset] = useState(0);
  const [now] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { if (league && session) weekPlan(session.user, league.id, offset).then(setD); }, [league, session, offset]));

  const colour = (x: PlanItem) => (x.kind === 'cup' || x.kind === 'deadline' ? t.crown : x.mine ? t.brand : x.colour ? playerColours[x.colour] : t.text3);
  const today = d ? dayKey(now, d.tz) : '';
  const total = d?.days.reduce((n, x) => n + x.items.length, 0) ?? 0;
  const dayName = (start: number, i: number) => `${DAYS[i]} ${new Date(start + 12 * 3600000).getUTCDate()}`;

  const item = (x: PlanItem, i: number) => (
    <Pressable key={x.kind + x.at + x.title} accessibilityRole="button" onPress={() => router.push(x.href as never)}
      style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colour(x) }} />
      <T v="label" style={{ width: 48 }}>{hm(x.at, d!.tz)}</T>
      <View style={{ flex: 1 }}>
        <T v="label" numberOfLines={1}>{x.title}</T>
        <T v="caption" c="text3" numberOfLines={2}>{x.body}</T>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={d?.week ? `Plan, week ${d.week}` : 'Plan'} right={(
        <View style={{ flexDirection: 'row', gap: space[1] }}>
          <IconButton icon={ChevronLeft} label="Previous week" tone="ghost" onPress={() => setOffset((o) => o - 1)} />
          <IconButton icon={ChevronRight} label="Next week" tone="ghost" onPress={() => setOffset((o) => o + 1)} />
        </View>
      )} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <Seg value={view} onChange={setView} options={[{ value: 'week', label: 'Week' }, { value: 'agenda', label: 'Agenda' }]} />
        {!d ? <Skeleton h={240} /> : !total ? (
          <Empty icon={CalendarDays} title="Nothing planned" body="Challenge someone." action={<Button label="Go to the Arena" variant="secondary" onPress={() => router.navigate('/arena')} />} />
        ) : view === 'week' ? (
          <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
            {d.days.map((day, i) => (
              <View key={day.start} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                <T v="label" c={dayKey(day.start + 3600000, d.tz) === today ? 'text' : 'text2'} style={{ width: 56 }}>{dayName(day.start, i)}</T>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {day.items.map((x) => (
                    <View key={x.kind + x.at + x.title} style={{ height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colour(x), justifyContent: 'center' }}>
                      <T v="caption" c={x.kind === 'cup' || x.kind === 'deadline' || (!x.mine && x.colour === 'yellow') ? 'onCrown' : '#FFFFFF'}>{hm(x.at, d.tz)}</T>
                    </View>
                  ))}
                  {!day.items.length ? <T v="caption" c="text3">Free</T> : null}
                </View>
              </View>
            ))}
          </View>
        ) : d.days.filter((day) => day.items.length).map((day) => (
          <View key={day.start} style={{ gap: space[2] }}>
            <T v="heading">{dayKey(day.start + 3600000, d.tz) === today ? 'Today' : dayName(day.start, d.days.indexOf(day))}</T>
            <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>{day.items.map(item)}</View>
          </View>
        ))}
        {d ? <T v="caption" c="text3">Yours in purple, cup in gold, others in their colour.</T> : null}
      </ScrollView>
    </View>
  );
}
