// G5.1 Level and level road, G5.3 Weekly streak with freezes, G5.3.1 freeze explainer (no buying, nothing is ever lost).
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, Flame, Snowflake, TrendingUp } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { weekStart } from '@/lib/progress-engine';
import { FREEZE_EVERY, FREEZE_MAX, levelName, MAX_LEVEL, progressFor, streakLine, XP, type ProgressView } from '@/lib/xp';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { Bar, LevelHex } from '@/ui/badges-kit';
import { Header } from '@/ui/list-row';

const SOURCES: [string, string][] = [
  ['Play a match', `${XP.played} XP`], ['Win it', `+${XP.win} XP`], ['Win as the underdog', `+${XP.upset} XP`], ['Weekly cup match', `+${XP.cup} XP`],
  [`After ${XP.dailyFull} matches in a day`, 'Half XP'], [`${XP.boostWeeks} weeks in a row or more`, `+${XP.boost * 100}% XP`],
];

export default function Progress() {
  const { t } = useTheme();
  const { member: param } = useLocalSearchParams<{ member?: string }>();
  const { league, members, me } = useLeague();
  const id = param ?? me?.id ?? '';
  const m = members.find((x) => x.id === id);
  const isMe = id === me?.id;
  const [p, setP] = useState<ProgressView | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    if (!league || !id) return;
    (async () => setP(await progressFor(league.id, id)))();
  }, [league, id]));

  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.sm, padding: space[3], gap: 2 }}>
      <T v="number">{value}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );

  const road = (v: ProgressView) => {
    const L = v.level.level, from = Math.max(1, Math.min(L - 2, MAX_LEVEL - 10)), to = Math.min(MAX_LEVEL, from + 10);
    const items = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[3], paddingVertical: space[1] }}>
        {items.map((n) => {
          const done = n <= L;
          const left = n === L + 1 ? v.level.need - v.level.into : null;
          return (
            <View key={n} style={{ alignItems: 'center', gap: 6, width: 56 }}>
              <LevelHex level={n} size={40} tone={n % 10 === 0 ? 'crown' : n === L ? 'brand' : done ? 'brand' : 'off'} />
              {done && n < L ? (
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.win, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon as={Check} size={13} color={t.onWin} />
                </View>
              ) : <T v="caption" c={n === L ? 'text' : 'text3'} numberOfLines={1}>{n === L ? 'Now' : left !== null ? `${fmt(left)} XP` : n % 10 === 0 ? 'Milestone' : ' '}</T>}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const body = () => {
    if (p === undefined) return [0, 1].map((i) => <Skeleton key={i} h={160} />);
    if (!p) return <Empty icon={TrendingUp} title="Levels are off" body="An admin can turn on levels and streaks in the league modules." />;
    const s = p.streak;
    const marks = s.marks.slice(-8);
    return (
      <>
        <Card style={{ alignItems: 'center', gap: space[3], paddingVertical: space[5] }}>
          <LevelHex level={p.level.level} size={96} />
          <T v="section" center>Level {p.level.level}</T>
          <T v="small" c="text2" center>{levelName(p.level.level)}{isMe && p.weekXp ? `, +${fmt(p.weekXp)} XP this week` : ''}</T>
          {isMe ? (
            <View style={{ alignSelf: 'stretch', gap: 6 }}>
              <Bar value={p.level.need ? p.level.into / p.level.need : 1} color={t.brand} h={8} />
              <T v="caption" c="text3" center>{p.level.need ? `${fmt(p.level.into)} of ${fmt(p.level.need)} XP to level ${p.level.level + 1}` : 'Max level. Every match still counts for badges.'}</T>
            </View>
          ) : null}
        </Card>
        {isMe ? (
          <>
            <T v="section" style={{ marginTop: space[2] }}>Level road</T>
            <Card>{road(p)}</Card>
            <Card style={{ gap: space[2] }}>
              <T v="heading">How you earn XP</T>
              {SOURCES.map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 24 }}>
                  <T v="small" c="text2">{k}</T>
                  <T v="label">{v}</T>
                </View>
              ))}
            </Card>

            <T v="section" style={{ marginTop: space[2] }}>Streak</T>
            <Card style={{ gap: space[4] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Icon as={Flame} size={36} color={s.current ? t.warning : t.text3} />
                <View style={{ flex: 1 }}>
                  <T v="title">{s.current} {s.current === 1 ? 'week' : 'weeks'}</T>
                  <T v="small" c="text2">{streakLine(p)}</T>
                </View>
              </View>
              {marks.length ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {marks.map((w) => (
                    <View key={w.week} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={`Week of ${new Date(weekStart(w.week)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${w.mark}`}>
                      <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: w.mark === 'played' ? t.warning : w.mark === 'freeze' ? t.info : 'transparent',
                        borderWidth: w.mark === 'missed' || w.mark === 'open' ? 2 : 0, borderColor: t.lineStrong, borderStyle: w.mark === 'open' ? 'dashed' : 'solid' }}>
                        {w.mark === 'played' ? <Icon as={Flame} size={15} color="#0A0A0A" /> : w.mark === 'freeze' ? <Icon as={Snowflake} size={15} color="#FFFFFF" /> : null}
                      </View>
                      <T v="caption" c="text3">{new Date(weekStart(w.week)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</T>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                {stat('Best streak', `${s.best} ${s.best === 1 ? 'week' : 'weeks'}`)}
                {stat('Freezes left', `${s.freezes} of ${FREEZE_MAX}`)}
                {stat('XP boost', s.current >= XP.boostWeeks ? `+${XP.boost * 100}%` : `At ${XP.boostWeeks}`)}
              </View>
            </Card>
            <Card style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Icon as={Snowflake} size={18} color={t.info} />
                <T v="heading">Freezes</T>
              </View>
              <T v="small" c="text2">Freezes cover a week you miss. They are used automatically. You can hold {FREEZE_MAX}.</T>
              <T v="small" c="text2">You start with one and get another for every {FREEZE_EVERY} weeks in a row. They are never sold.</T>
              <T v="small" c="text2">When a streak ends nothing is taken away. Your XP, level and badges stay.</T>
            </Card>
          </>
        ) : <T v="caption" c="text3" center>Only {m?.display_name ?? 'the player'} sees their XP and streak details.</T>}
      </>
    );
  };

  return (
    <Screen>
      <Header title={isMe || !m ? 'Level and streak' : m.display_name} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: space[2], gap: space[3], paddingBottom: 60 }}>{body()}</ScrollView>
    </Screen>
  );
}
