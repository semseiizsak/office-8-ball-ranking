import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { PAIR_MIN, pairRatings, splitPair } from '@/lib/stats';
import type { MatchRow } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, IconButton, Screen, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';
import { MatchCard } from '@/ui/match-card';

type Data = Awaited<ReturnType<typeof pairRatings>>;

// R1.10.1 Pair detail: the duo's rating, record, rival pairs and shared matches.
export default function PairDetail() {
  const { t } = useTheme();
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { members, me, league } = useLeague();
  const [d, setD] = useState<Data | null>(null);
  const [all, setAll] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => setD(await pairRatings(league.id)))();
  }, [league]));

  const key = [a, b].sort().join('+');
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => (id === me?.id ? 'You' : byId.get(id)?.display_name ?? 'Former player');
  const pairName = (k: string) => splitPair(k).map(name).join(' and ');

  if (!d) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={160} /></View></Screen>;
  const p = [...d.ranked, ...d.unranked].find((x) => x.key === key);
  const rank = d.ranked.findIndex((x) => x.key === key) + 1;
  const matches: MatchRow[] = d.matches(key);
  const opps = d.opponents(key).filter((o) => o.won + o.lost > 0);
  const beaten = [...opps].sort((x, y) => y.won - x.won)[0];
  const beatBy = [...opps].sort((x, y) => y.lost - x.lost)[0];
  const formerHere = [a, b].some((id) => !byId.has(id));

  return (
    <Screen>
      <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <View style={{ flexDirection: 'row' }}>
            {[a, b].map((id, i) => {
              const m = byId.get(id);
              return (
                <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Open ${name(id)}`} disabled={!m} onPress={() => router.push(`/player/${id}`)} style={{ marginLeft: i ? -18 : 0 }}>
                  {m ? <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={80} /> : <Avatar name="?" colour="ink" size={80} ring={false} />}
                </Pressable>
              );
            })}
          </View>
          <T v="section" center>{name(a)} and {name(b)}</T>
          {p ? <T v="label" c="text2">{fmt(p.rating)}{rank ? `, #${rank} of ${d.ranked.length} pairs` : ''}</T> : null}
        </View>
        {!p ? (
          <Empty icon={Users} title="No matches together yet" body="Team up in a 2v2 match to start this pair." />
        ) : (
          <>
            {p.played < PAIR_MIN ? <T v="small" c="text2" center>Ranked after {PAIR_MIN} matches together.</T> : null}
            {formerHere ? <T v="small" c="text2" center>One of them is no longer in the league.</T> : null}
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {[['Played', String(p.played)], ['Won', String(p.won)], ['Win rate', `${Math.round((p.won / p.played) * 100)}%`], ['Best streak', `W${p.bestStreak}`]].map(([l, v]) => (
                <View key={l} style={{ flex: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 2 }}>
                  <T v="number">{v}</T>
                  <T v="caption" c="text3">{l}</T>
                </View>
              ))}
            </View>
            {p.history.length >= 3 ? (
              <Card style={{ gap: space[3] }}>
                <T v="heading">Pair rating</T>
                <LineChart series={[{ values: p.history, color: t.pct[byId.get(a)?.colour ?? 'ink'] }]} height={140} baseline={p.history[0]} />
              </Card>
            ) : null}
            {beaten || beatBy ? (
              <Card style={{ gap: space[2] }}>
                <T v="heading">Rival pairs</T>
                {beaten && beaten.won ? <T v="small" c="text2">Beat most: {pairName(beaten.key)}, {beaten.won} {beaten.won === 1 ? 'win' : 'wins'}</T> : null}
                {beatBy && beatBy.lost ? <T v="small" c="text2">Toughest: {pairName(beatBy.key)}, {beatBy.lost} losses</T> : null}
              </Card>
            ) : null}
            <T v="section" style={{ marginTop: space[2] }}>Matches together</T>
            {(all ? matches : matches.slice(0, 5)).map((r) => <MatchCard key={r.id} match={r} members={members} meId={me?.id} />)}
            {!all && matches.length > 5 ? <Button label={`See all ${matches.length}`} variant="secondary" size="md" onPress={() => setAll(true)} /> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
