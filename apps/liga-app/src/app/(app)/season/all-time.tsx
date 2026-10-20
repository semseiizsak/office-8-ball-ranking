// M6.3 All time table: the whole league history without season resets, sorted by the chosen column.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { allTime } from '@/lib/seasons';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { Chip } from '@/ui/tabs';

type Col = 'rating' | 'wins' | 'played' | 'rate' | 'peak';
type Rows = Awaited<ReturnType<typeof allTime>>['rows'];
const COLS: { value: Col; label: string }[] = [
  { value: 'rating', label: 'Rating' }, { value: 'wins', label: 'Wins' }, { value: 'played', label: 'Matches' }, { value: 'rate', label: 'Win rate' }, { value: 'peak', label: 'Peak' },
];
const RATE_MIN = 10;

export default function AllTime() {
  const { t } = useTheme();
  const { league, me } = useLeague();
  const [rows, setRows] = useState<Rows | null>(null);
  const [col, setCol] = useState<Col>('rating');
  useFocusEffect(useCallback(() => { if (league) (async () => setRows((await allTime(league.id)).rows))(); }, [league]));

  const value = (r: Rows[number]) => ({ rating: r.m.rating, wins: r.m.wins, played: r.played, rate: r.rate, peak: r.peak }[col]);
  const shown = (rows ?? []).filter((r) => r.played > 0 && (col !== 'rate' || r.played >= RATE_MIN)).sort((a, b) => value(b) - value(a));
  const label = (r: Rows[number]) => (col === 'rate' ? `${Math.round(r.rate * 100)}%` : fmt(value(r)));

  return (
    <Screen>
      <Header title="All time" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        {COLS.map((c) => <Chip key={c.value} label={c.label} on={col === c.value} onPress={() => setCol(c.value)} />)}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: 2, paddingBottom: 64 }}>
        {!rows ? <Skeleton h={240} /> : shown.length ? shown.map((r, i) => {
          const mine = r.m.id === me?.id;
          return (
            <Pressable key={r.m.id} accessibilityRole="button" onPress={() => router.push(`/player/${r.m.id}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : mine ? t.surface2 : 'transparent' })}>
              <T v="label" c="text3" style={{ width: 22, textAlign: 'center' }}>{i + 1}</T>
              <Avatar name={r.m.display_name} colour={r.m.colour} jersey={r.m.jersey} size={40} />
              <View style={{ flex: 1 }}>
                <T v="heading" numberOfLines={1}>{mine ? 'You' : r.m.display_name}</T>
                <T v="caption" c="text3">{r.m.wins}W {r.m.losses}L</T>
              </View>
              <T v="number">{label(r)}</T>
            </Pressable>
          );
        }) : <T v="small" c="text2" center>Play {RATE_MIN} matches to get on the all time board.</T>}
        {col === 'rate' && rows ? <T v="caption" c="text3" center style={{ paddingTop: space[3] }}>Win rate counts players with {RATE_MIN} or more matches.</T> : null}
      </ScrollView>
    </Screen>
  );
}
