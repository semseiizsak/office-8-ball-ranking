// G3.7 Past season, M6.5 Season archive, R1.9 closed season table: frozen podium, table, titles, stats and matches.
import { router, useLocalSearchParams } from 'expo-router';
import { Clapperboard, Crown } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { leagueMatches } from '@/lib/api';
import { lastDay, nameIn, range } from '@/lib/seasons';
import type { MatchRow } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, signed, space, useTheme } from '@/theme';
import { Button, Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { MatchCard } from '@/ui/match-card';
import { Podium, ReadOnly, StandingRow, useSeasons } from '@/ui/season';

export default function PastSeason() {
  const { t } = useTheme();
  const { n } = useLocalSearchParams<{ n: string }>();
  const { members, me, league } = useLeague();
  const { data } = useSeasons();
  const [feed, setFeed] = useState<MatchRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!data) return <Screen><Header title="Season" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={160} /><Skeleton h={240} /></View></Screen>;
  const s = data.list.find((x) => x.n === Number(n));
  if (!s || !s.closed) {
    return <Screen><Header title="Season" /><Empty icon={Crown} title="This season is still running" body="Its table freezes when it ends." action={<Button label="Back to live" size="md" onPress={() => router.replace('/season')} />} /></Screen>;
  }
  const name = (id: string) => nameIn(members, id, me?.id);
  const mine = s.rows.find((r) => r.id === me?.id);
  const next = data.list.find((x) => x.n === s.n + 1);
  const base = data.league.start_rating;
  const kept = mine && next ? Math.round((mine.rating - base) * (next.carry / 100)) : null;
  const showMatches = async () => {
    if (!league) return;
    setLoading(true);
    const ids = new Set(s.matches.map((m) => m.id));
    setFeed((await leagueMatches(league.id, 5000)).filter((m) => ids.has(m.id)));
    setLoading(false);
  };

  return (
    <Screen>
      <Header title={`Season ${s.n}, final`} right={<ReadOnly />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        <T v="small" c="text2">{range(s)}, closed {lastDay(s.end!)}</T>
        {s.rows.length ? (
          <>
            <Card style={{ alignItems: 'center', gap: space[2], backgroundColor: t.crown }}>
              <Icon as={Crown} size={28} color={t.onCrown} />
              <T v="section" c="onCrown" center>{mine?.rank === 1 ? 'You won the season' : `${name(s.rows[0].id)} won the season`}</T>
              <T v="small" c="onCrown">{fmt(s.rows[0].rating)} season rating, {s.rows[0].won}W {s.rows[0].lost}L</T>
            </Card>
            <Podium ids={s.rows.slice(0, 3).map((r) => r.id)} members={members} meId={me?.id} />
            {mine ? (
              <Card style={{ gap: 4 }}>
                <T v="heading">You finished #{mine.rank}, {fmt(mine.rating)}</T>
                {kept !== null ? <T v="small" c="text2">Kept {signed(kept)} after the reset.</T> : null}
              </Card>
            ) : null}
            {data.config.wrap && mine ? <Button label="Watch the wrap" icon={Clapperboard} variant="brand" onPress={() => router.push(`/season/wrap/${s.n}`)} /> : null}
            <View style={{ gap: 2 }}>
              <T v="heading" style={{ paddingHorizontal: space[1], paddingBottom: space[2] }}>Final table</T>
              {s.rows.map((r) => <StandingRow key={r.id} r={r} members={members} meId={me?.id} />)}
            </View>
            {s.titles.length ? (
              <Card style={{ gap: space[2] }}>
                <T v="heading">Titles</T>
                {s.titles.map((x) => (
                  <View key={x.key} style={{ flexDirection: 'row', gap: space[2] }}>
                    <T v="small" style={{ flex: 1 }}>{x.label}</T>
                    <T v="small" c="text2">{name(x.who)}, {x.value}</T>
                  </View>
                ))}
              </Card>
            ) : null}
            <Card style={{ gap: 4 }}>
              <T v="heading">Season in numbers</T>
              <T v="small" c="text2">{s.matches.length} matches, {s.rows.length} players</T>
              {s.busiestDay ? <T v="small" c="text2">Busiest day: {new Date(s.busiestDay.day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}, {s.busiestDay.count} matches</T> : null}
            </Card>
            {feed ? (
              <View style={{ gap: space[3] }}>
                {feed.map((m) => <MatchCard key={m.id} match={m} members={members} meId={me?.id} />)}
              </View>
            ) : <Button label={`Show ${s.matches.length} matches`} variant="secondary" loading={loading} onPress={showMatches} />}
          </>
        ) : <Empty icon={Crown} title="No matches this season" body="Nobody played, so nobody won." />}
        <Button label="Back to live" variant="secondary" onPress={() => router.replace('/season')} />
      </ScrollView>
    </Screen>
  );
}
