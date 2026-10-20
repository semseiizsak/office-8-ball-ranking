// G3 Season hub: progress, my season row, race preview, tier, title leaders, wrap hero, links.
import { router } from 'expo-router';
import { Award, BarChart3, ChevronRight, Clapperboard, History, Settings, Trophy } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { countdown, lastDay, nameIn, progressOf, range, shortDate, tierOf } from '@/lib/seasons';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Card, Empty, Icon, Pill, Screen, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';
import { Group, Header, Row } from '@/ui/list-row';
import { useSeasons } from '@/ui/season';

export default function SeasonHub() {
  const { t } = useTheme();
  const { members, me, league } = useLeague();
  const { data } = useSeasons();
  const admin = isAdmin(me);

  if (!data) return <Screen><Header title="Season" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={96} /><Skeleton h={180} /></View></Screen>;
  if (!data.on) {
    return (
      <Screen>
        <Header title="Season" />
        <Empty icon={Trophy} title="Seasons are off" body="The ladder runs forever. An admin can turn seasons on." action={admin ? <Button label="Season settings" size="md" onPress={() => router.push('/season/settings')} /> : undefined} />
      </Screen>
    );
  }

  const s = data.current;
  const p = progressOf(s);
  const mine = s.rows.find((r) => r.id === me?.id);
  const base = data.league.start_rating;
  const tier = me && me.wins + me.losses >= 5 ? tierOf(me.rating, base) : null;
  const top = s.rows.slice(0, 5);
  const pct = p.days ? Math.min(1, p.day / p.days) : 0;
  const lastClosed = data.closed[0];
  const freshWrap = lastClosed && data.fresh && data.config.wrap && lastClosed.rows.some((r) => r.id === me?.id);
  const name = (id: string) => nameIn(members, id, me?.id);
  const week = (n: number) => Math.ceil(n / 7);
  const when = !p.days ? `${range(s)}, day ${p.day}` : p.days > 14 ? `${range(s)}, week ${week(p.day)} of ${week(p.days)}` : `${range(s)}, day ${Math.min(p.day, p.days)} of ${p.days}`;

  return (
    <Screen>
      <Header title={`Season ${s.n}`} right={admin ? <Button label="Settings" icon={Settings} size="sm" variant="secondary" onPress={() => router.push('/season/settings')} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        <Card style={{ gap: space[3] }}>
          <T v="small" c="text2">{when}</T>
          {p.days ? (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(pct * 100)}%`, height: 8, backgroundColor: t.brand }} />
            </View>
          ) : null}
          {p.left !== null && p.lastWeek ? <Pill label={`Season ends in ${countdown(p.left)}`} tone="live" />
            : s.n === 1 && p.day <= 7 && p.days ? <T v="label">Season 1 has started. {week(p.days)} weeks to go.</T>
              : p.left === null ? <T v="caption" c="text3">This season ends when an admin closes it.</T> : null}
        </Card>

        {freshWrap ? (
          <Card onPress={() => router.push(`/season/wrap/${lastClosed.n}`)} style={{ backgroundColor: t.brand, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Icon as={Clapperboard} size={28} color={t.onBrand} />
            <View style={{ flex: 1 }}>
              <T v="section" c="onBrand">Season {lastClosed.n} wrapped</T>
              <T v="small" c="onBrand">Your story is ready. Tap to watch.</T>
            </View>
          </Card>
        ) : null}

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {mine ? (
            <>
              <T v="bigNumber">#{mine.rank}</T>
              <View style={{ flex: 1 }}>
                <T v="heading">{fmt(mine.rating)} season rating</T>
                <T v="small" c="text2">{signed(mine.change)} since {shortDate(s.start)}, {mine.won}W {mine.lost}L</T>
              </View>
            </>
          ) : (
            <View style={{ flex: 1, gap: 4 }}>
              <T v="heading">{'You\'re not in the race yet'}</T>
              <T v="small" c="text2">One match this season puts you on the board.</T>
            </View>
          )}
        </Card>

        <Card style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T v="heading" style={{ flex: 1 }}>Season race</T>
            <Button label="Full race" size="sm" variant="secondary" onPress={() => router.push('/season/race')} />
          </View>
          {s.race.length >= 3 && top.length ? (
            <LineChart peak={false} height={140} series={top.map((r) => ({
              values: s.race.map((pt) => pt.ratings[r.id] ?? r.start),
              color: r.id === me?.id ? t.brand : t.pct[members.find((m) => m.id === r.id)?.colour ?? 'ink'],
            }))} />
          ) : <T v="small" c="text2">The race chart fills in after a few days.</T>}
          {top.slice(0, 3).map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: space[2] }}>
              <T v="label" c="text3" style={{ width: 20 }}>{r.rank}</T>
              <T v="label" style={{ flex: 1 }}>{name(r.id)}</T>
              <T v="label">{fmt(r.rating)}</T>
            </View>
          ))}
        </Card>

        {tier ? (
          <Card onPress={() => router.push('/season/tiers')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: t.surface3, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={Award} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="heading">{tier.tier.label}</T>
              <T v="small" c="text2">{tier.next ? `${tier.toNext} rating to ${tier.next.label}` : 'Top tier. Enjoy the view.'}</T>
            </View>
            <Icon as={ChevronRight} size={18} color={t.text3} />
          </Card>
        ) : null}

        {s.titles.length ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading">Title race</T>
            {s.titles.map((x) => (
              <View key={x.key} style={{ flexDirection: 'row', gap: space[2] }}>
                <T v="small" style={{ flex: 1 }}>{x.label}</T>
                <T v="small" c="text2">{name(x.who)}, {x.value}</T>
              </View>
            ))}
            <T v="caption" c="text3">Titles go to the leaders when the season ends{s.end ? ` on ${lastDay(s.end)}` : ''}.</T>
          </Card>
        ) : null}

        <Group>
          <Row first icon={BarChart3} label="Full race" onPress={() => router.push('/season/race')} />
          <Row icon={Award} label="Rating tiers" onPress={() => router.push('/season/tiers')} />
          <Row icon={History} label="Past seasons" value={data.closed.length ? `${data.closed.length}` : undefined} onPress={() => router.push('/season/archive')} />
          <Row icon={Trophy} label="All time" onPress={() => router.push('/season/all-time')} />
          {admin ? <Row icon={Settings} label="Season settings" onPress={() => router.push('/season/settings')} /> : null}
        </Group>
        {league ? <T v="caption" c="text3" center>Every season starts with a soft reset: ratings keep {data.carry}% of the gap to {fmt(base)}.</T> : null}
      </ScrollView>
    </Screen>
  );
}
