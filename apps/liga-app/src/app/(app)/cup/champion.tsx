// G1.7 Champion scene and K7.3 cup champion card (shared as text; image share needs a dev build)
import { router, useLocalSearchParams } from 'expo-router';
import { Share2, Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cabinet, getCup, markSeen, roundShort } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, motion, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Icon, T } from '@/ui';
import { who } from '@/ui/cup';

type Data = Awaited<ReturnType<typeof getCup>>;
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export default function Champion() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [d, setD] = useState<Data>(null);
  const [titles, setTitles] = useState(0);
  const [a] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!league || !session) return;
    (async () => {
      const x = await getCup(league.id, id);
      setD(x);
      if (!x || !x.cup.champion_id) return;
      markSeen(session.user, x.cup.id, 'champion');
      setTitles((await cabinet(league.id, x.cup.champion_id)).wins);
    })();
  }, [league, session, id]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) a.setValue(1);
      else Animated.timing(a, { toValue: 1, duration: motion.scene, easing: Easing.bezier(...motion.easing), useNativeDriver: true }).start();
    });
  }, [a]);

  const c = d?.cup;
  if (!c || c.status !== 'done') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: space[6], justifyContent: 'center', gap: space[4] }}>
        <T v="section" center>No champion yet</T>
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  const champ = members.find((m) => m.id === c.champion_id);
  const name = (x: string | null) => who(members, x, me?.id) ?? 'Former player';
  const mine = c.champion_id === me?.id;
  const runner = c.runner_up_id === me?.id;
  const path = c.games.filter((g) => g.winner === c.champion_id && g.status !== 'bye').sort((x, y) => x.round - y.round)
    .map((g) => `${roundShort(g.round, c.rounds)} beat ${name(g.a === c.champion_id ? g.b : g.a)}${g.status === 'wo' ? ' by walkover' : g.score ? ` ${Math.max(...g.score)} : ${Math.min(...g.score)}` : ''}`);
  const coins = isOn(league, 'coins');
  const rewards = [
    coins ? (mine ? `+${fmt(c.prizes.winner)} coins` : runner ? `+${fmt(c.prizes.runner)} coins` : null) : null,
    mine ? `Cup badge, week ${c.week_no}` : runner ? 'Finalist, week ' + c.week_no : null,
  ].filter(Boolean) as string[];
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  const share = () => Share.share({ message: `${mine ? 'I am' : `${name(c.champion_id)} is`} the weekly cup champion 🏆\nWeek ${c.week_no}, ${c.seeds.length} players\n${path.join('\n')}\n${ord(titles || 1)} title, ${league?.name}` });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space[6], paddingTop: insets.top + space[8], gap: space[5], alignItems: 'center' }}>
        <Animated.View style={{ opacity: a, transform: [{ scale }], alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: t.crown, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={Trophy} size={56} color={t.onCrown} />
          </View>
          <T v="display" center>{runner ? 'Runner up' : 'Champion'}</T>
        </Animated.View>
        <T c="text2" center>
          Weekly cup, week {c.week_no}. {mine ? `You beat ${name(c.runner_up_id)}` : runner ? `${name(c.champion_id)} beat you` : `${name(c.champion_id)} beat ${name(c.runner_up_id)}`}{c.final_score ? ` ${c.final_score[0]} : ${c.final_score[1]}` : ''} in the final.
        </T>

        <View style={{ alignSelf: 'stretch', backgroundColor: t.surface, borderRadius: radius.lg, padding: space[5], gap: space[3], alignItems: 'center' }}>
          {champ ? <View style={{ padding: 3, borderRadius: 40, backgroundColor: t.crown }}><Avatar name={champ.display_name} colour={champ.colour} jersey={champ.jersey} size={64} /></View> : null}
          <T v="heading" center>{name(c.champion_id)}</T>
          <T v="caption" c="text3" center>Week {c.week_no}, {c.seeds.length} players, {ord(titles || 1)} title</T>
          {path.map((p) => <T key={p} v="small" c="text2" center>{p}</T>)}
        </View>

        {rewards.map((r) => (
          <View key={r} style={{ alignSelf: 'stretch', minHeight: 52, borderRadius: radius.md, backgroundColor: t.surface2, justifyContent: 'center', paddingHorizontal: space[4] }}>
            <T v="heading">{r}</T>
          </View>
        ))}
      </ScrollView>
      <View style={{ padding: space[4], paddingBottom: insets.bottom + space[3], gap: space[2] }}>
        {mine || runner ? <Button label="Share" icon={Share2} variant="brand" onPress={share} /> : null}
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
