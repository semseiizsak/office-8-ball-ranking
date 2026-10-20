import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { headToHead, historySince, playerStats, standingOf, type PlayerStats } from '@/lib/stats';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Card, Icon, IconButton, Screen, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';
import { Chip } from '@/ui/tabs';

type Data = { a: PlayerStats; b: PlayerStats; h: Awaited<ReturnType<typeof headToHead>> };

// R6 Compare two players, with R6.1 as an inline picker for the second player.
export default function Compare() {
  const { t } = useTheme();
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { members, me, league } = useLeague();
  const [d, setD] = useState<Data | null>(null);

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => {
      const [sa, sb, h] = await Promise.all([playerStats(league.id, a), playerStats(league.id, b), headToHead(league.id, a, b)]);
      setD({ a: sa, b: sb, h });
    })();
  }, [league, a, b]));

  const A = members.find((x) => x.id === a), B = members.find((x) => x.id === b);
  const label = (m?: Member) => (!m ? 'Former player' : m.id === me?.id ? 'You' : m.display_name);
  if (!d || !A || !B) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={120} /><Skeleton h={300} /></View></Screen>;

  const rank = (m: Member) => { const s = standingOf(members, m.id); return s?.kind === 'ranked' ? s.rank : null; };
  const rate = (s: PlayerStats) => (s.played ? Math.round((s.won / s.played) * 100) : 0);
  // Higher is better unless lowerWins; the better value is bolder, never coloured.
  const rows: [string, number | null, number | null, string, string, boolean?][] = [
    ['Rating', A.rating, B.rating, fmt(A.rating), fmt(B.rating)],
    ['Peak', d.a.peak, d.b.peak, fmt(d.a.peak), fmt(d.b.peak)],
    ['Rank', rank(A), rank(B), rank(A) ? `#${rank(A)}` : 'Unranked', rank(B) ? `#${rank(B)}` : 'Unranked', true],
    ['Matches', d.a.played, d.b.played, String(d.a.played), String(d.b.played)],
    ['Win rate', rate(d.a), rate(d.b), `${rate(d.a)}%`, `${rate(d.b)}%`],
    ['Best streak', d.a.bestStreak, d.b.bestStreak, `W${d.a.bestStreak}`, `W${d.b.bestStreak}`],
    ['Upsets', d.a.upsets.won, d.b.upsets.won, String(d.a.upsets.won), String(d.b.upsets.won)],
    ['Avg opponent', d.a.avgOpp, d.b.avgOpp, d.a.avgOpp ? fmt(d.a.avgOpp) : '0', d.b.avgOpp ? fmt(d.b.avgOpp) : '0'],
  ];
  const better = (x: number | null, y: number | null, low?: boolean) => (x === null || y === null || x === y ? 0 : (low ? x < y : x > y) ? 1 : -1);
  const la = historySince(d.a.history, 30).map((p) => p.rating), lb = historySince(d.b.history, 30).map((p) => p.rating);
  const settling = [A, B].filter((m) => standingOf(members, m.id)?.kind === 'new');

  const head = (m: Member) => (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/player/${m.id}`)} style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
      <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={64} />
      <T v="heading" center numberOfLines={1}>{label(m)}</T>
    </Pressable>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="heading" style={{ flex: 1, textAlign: 'center' }}>Compare</T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {head(A)}
          <T v="label" c="text3" style={{ paddingTop: 24 }}>vs</T>
          {head(B)}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {members.filter((m) => m.id !== a).map((m) => (
            <Chip key={m.id} label={label(m)} on={m.id === b} onPress={() => router.setParams({ b: m.id })} />
          ))}
        </ScrollView>
        {settling.length ? <T v="caption" c="text2">Ratings are still settling for {settling.map(label).join(' and ')}.</T> : null}
        <Card style={{ gap: 0, paddingVertical: space[2] }}>
          {rows.map(([l, x, y, sx, sy, low], i) => {
            const w = better(x, y, low);
            return (
              <View key={l} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                <T v={w === 1 ? 'heading' : 'body'} c={w === 1 ? 'text' : 'text2'} style={{ flex: 1 }}>{sx}</T>
                <T v="caption" c="text3" center style={{ flex: 1 }}>{l}</T>
                <T v={w === -1 ? 'heading' : 'body'} c={w === -1 ? 'text' : 'text2'} style={{ flex: 1, textAlign: 'right' }}>{sy}</T>
              </View>
            );
          })}
        </Card>
        <Card style={{ gap: space[3] }}>
          <T v="heading">Rating, 30 days</T>
          <LineChart series={[{ values: la, color: t.pct[A.colour] }, { values: lb, color: t.pct[B.colour] }]} height={160} peak={false} />
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            {[A, B].map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.pct[m.colour] }} />
                <T v="caption" c="text2">{label(m)}</T>
              </View>
            ))}
          </View>
          {A.colour === B.colour ? <T v="caption" c="text3">Same colour, so both lines match. The dot on the right is now.</T> : null}
        </Card>
        <Card onPress={() => router.push({ pathname: '/h2h/[a]/[b]', params: { a, b } })} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <T v="label">Head to head</T>
            <T v="caption" c="text3">{d.h.played} played</T>
          </View>
          <T v="number">{d.h.aWins} : {d.h.bWins}</T>
          <Icon as={ChevronRight} size={18} color={t.text3} />
        </Card>
        <View style={{ height: 1, backgroundColor: t.line, borderRadius: radius.xs }} />
        <T v="caption" c="text3" center>The better value in each row is bold.</T>
      </ScrollView>
    </Screen>
  );
}
