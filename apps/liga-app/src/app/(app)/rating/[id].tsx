import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronRight, Info } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { historySince, playerStats, PROVISIONAL, type PlayerStats } from '@/lib/stats';
import { clock, dayLabel } from '@/lib/time';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Card, Icon, IconButton, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';

type Period = '30' | 'all';

// R4 Rating history with R4.1 point detail (tap or drag the chart).
export default function RatingHistory() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, me, league } = useLeague();
  const [s, setS] = useState<PlayerStats | null>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [sel, setSel] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => setS(await playerStats(league.id, id)))();
  }, [league, id]));

  const m = members.find((x) => x.id === id);
  const name = (mid: string) => (mid === me?.id ? 'you' : members.find((x) => x.id === mid)?.display_name ?? 'Former player');

  if (!s || !m) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={80} /><Skeleton h={220} /></View></Screen>;

  const points = historySince(s.history, period === '30' ? 30 : null);
  const change = points[points.length - 1].rating - points[0].rating;
  const i = sel !== null && sel < points.length ? sel : points.length - 1;
  const p = points[i];
  const e = p.matchId ? s.entries.find((x) => x.match.id === p.matchId) : null;
  const deltas = points.slice(1).map((x) => x.delta);
  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="label">{value}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );
  const score = e && e.match.score_a != null ? ` ${e.mp.side === 'a' ? e.match.score_a : e.match.score_b} : ${e.mp.side === 'a' ? e.match.score_b : e.match.score_a}` : '';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <IconButton icon={Info} label="How ratings work" onPress={() => router.push('/elo')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: 60 }}>
        <View style={{ gap: 2 }}>
          <T v="title">{m.id === me?.id ? 'Your rating' : `${m.display_name}'s rating`}</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[3] }}>
            <T v="bigNumber">{fmt(m.rating)}</T>
            <T v="label" c={change > 0 ? 'win' : 'text2'}>{signed(change)} {period === '30' ? 'in 30 days' : 'all time'}</T>
          </View>
        </View>
        <Seg value={period} onChange={(v) => { setPeriod(v); setSel(null); }} options={[{ value: '30', label: '30 days' }, { value: 'all', label: 'All time' }]} />
        {s.played < 3 ? (
          <Card><T v="small" c="text2" center>Your chart starts here. Play 3 matches and your rating line shows up.</T></Card>
        ) : (
          <Card style={{ gap: space[3] }}>
            <LineChart series={[{ values: points.map((x) => x.rating), color: t.pct[m.colour] }]} height={200} baseline={points[0].rating} selected={i} onSelect={setSel} />
            <View style={{ backgroundColor: t.surface2, borderRadius: radius.sm, padding: space[3], gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <T v="number">{fmt(p.rating)}</T>
                {p.matchId ? <T v="label" c={p.delta > 0 ? 'win' : 'text2'}>{signed(p.delta)}</T> : null}
                <View style={{ flex: 1 }} />
                {e?.upset ? <Pill label="Upset" tone="brand" /> : null}
              </View>
              <T v="caption" c="text2">
                {e ? `${dayLabel(e.at)}, ${clock(e.at)}, vs ${e.opponents.map(name).join(' and ')}, ${e.won ? 'won' : 'lost'}${score}` : i === 0 && period === 'all' ? `Start, ${fmt(s.start)}` : 'Start of this period'}
              </T>
              {e ? <Button label="Open match" size="sm" variant="secondary" onPress={() => router.push(`/match/${e.match.id}`)} style={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
            </View>
            <T v="caption" c="text3">Dashed line, start of the period. Ringed dot, the peak.</T>
          </Card>
        )}
        <Card style={{ flexDirection: 'row', gap: space[2] }}>
          {stat('Highest', fmt(Math.max(...points.map((x) => x.rating))))}
          {stat('Lowest', fmt(Math.min(...points.map((x) => x.rating))))}
          {stat('Biggest gain', signed(Math.max(0, ...deltas)))}
          {stat('Biggest drop', signed(Math.min(0, ...deltas)))}
        </Card>
        {s.played > 0 && s.played < PROVISIONAL ? <T v="caption" c="text3">Ratings move faster in the first {PROVISIONAL} matches while they settle.</T> : null}
        <T v="section">Match by match</T>
        {points.slice(1).reverse().map((x) => {
          const en = s.entries.find((y) => y.match.id === x.matchId)!;
          return (
            <Pressable key={x.matchId} accessibilityRole="button" onPress={() => router.push(`/match/${x.matchId}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : t.surface })}>
              <View style={{ flex: 1 }}>
                <T v="label" numberOfLines={1}>vs {en.opponents.map(name).join(' and ')}</T>
                <T v="caption" c="text3">{dayLabel(x.at)}, {clock(x.at)}</T>
              </View>
              <T v="label">{fmt(x.rating)}</T>
              <T v="label" c={x.delta > 0 ? 'win' : 'text2'} style={{ width: 40, textAlign: 'right' }}>{signed(x.delta)}</T>
              <Icon as={ChevronRight} size={16} color={t.text3} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
