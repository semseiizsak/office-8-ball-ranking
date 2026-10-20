// G1.3 The draw, with the G1.2 "Drawing the bracket" moment (1.2 s, skipped with reduced motion)
import { router, useLocalSearchParams } from 'expo-router';
import { Share2, Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, Share, View } from 'react-native';

import { dayHm, getCup, getGame, markSeen, roundName, roundShort } from '@/lib/cup';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, motion, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Icon, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { who } from '@/ui/cup';

type Data = NonNullable<Awaited<ReturnType<typeof getCup>>>;
type Mine = Awaited<ReturnType<typeof getGame>>;

export default function Draw() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [d, setD] = useState<Data | null | undefined>(undefined);
  const [mine, setMine] = useState<Mine>(null);
  const [drawing, setDrawing] = useState(true);
  const [p] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!league || !session) return;
    (async () => {
      const x = await getCup(league.id, id);
      setD(x);
      if (!x) return;
      markSeen(session.user, x.cup.id, 'draw');
      const g = x.cup.games.find((g) => g.round === 0 && g.status === 'open' && (g.a === me?.id || g.b === me?.id));
      if (g) setMine(await getGame(g.id));
    })();
  }, [league, session, id, me?.id]);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) { setDrawing(false); return; }
      Animated.timing(p, { toValue: 1, duration: motion.scene, easing: Easing.bezier(...motion.easing), useNativeDriver: false }).start(() => live && setDrawing(false));
    });
    return () => { live = false; };
  }, [p]);

  const name = (x: string | null) => who(members, x, me?.id) ?? '';
  const c = d?.cup;

  if (d === null || (c && c.status !== 'running' && c.status !== 'done')) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="The draw" />
        <Empty icon={Trophy} title="No draw yet" body="The bracket is drawn when sign up closes." />
      </View>
    );
  }

  if (drawing || !c || !d) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[8] }}>
        <Icon as={Trophy} size={40} />
        <T v="section" center>Drawing the bracket</T>
        <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
          <Animated.View style={{ height: 8, backgroundColor: t.brand, width: p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
      </View>
    );
  }

  const tz = d.tz;
  const firstRound = c.games.filter((g) => g.round === 0);
  const byes = new Set(firstRound.filter((g) => g.status === 'bye').map((g) => g.winner));
  const deadlines = Array.from({ length: c.rounds }, (_, r) => c.games.find((g) => g.round === r)!);
  const g = mine?.game;
  const opp = g ? (g.a === me?.id ? g.b : g.a) : null;
  const lead = mine && g ? (g.a === me?.id ? [mine.h2h.a, mine.h2h.b] : [mine.h2h.b, mine.h2h.a]) : null;
  const next = g ? c.games.find((x) => x.round === 1 && x.slot === Math.floor(g.slot / 2)) : null;
  const waiting = next ? (g!.slot % 2 === 0 ? next.b : next.a) : null;
  const myBye = me && byes.has(me.id);

  const share = () => Share.share({ message: `The cup draw, week ${c.week_no}:\n${firstRound.map((x) => x.status === 'bye' ? `${name(x.winner)} has a bye` : `${name(x.a)} vs ${name(x.b)}`).join('\n')}` });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="The draw" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <T c="text2">{c.seeds.length} players, seeded {d.cfg.seeding === 'rating' ? 'by rating' : 'at random'}. {roundShort(0, c.rounds)} until {dayHm(deadlines[0].deadline, tz)}.</T>

        {g && opp ? (
          <Card style={{ gap: space[2], borderWidth: 2, borderColor: t.brand }}>
            <T v="section">You drew {name(opp)}</T>
            {lead ? <T c="text2">{lead[0] + lead[1] ? `You ${lead[0] > lead[1] ? 'lead' : lead[0] < lead[1] ? 'trail' : 'are level'} ${lead[0]} : ${lead[1]}.` : 'Your first meeting.'}{waiting ? ` Winner meets ${name(waiting)} in the ${roundName(1, c.rounds).toLowerCase()}.` : ''}</T> : null}
            <Button label="See my match" onPress={() => router.replace(`/cup/game/${g.id}`)} />
          </Card>
        ) : myBye ? (
          <Card style={{ gap: space[2], borderWidth: 2, borderColor: t.brand }}>
            <T v="section">You got a bye</T>
            <T c="text2">Straight to the {roundName(1, c.rounds).toLowerCase()}.</T>
          </Card>
        ) : null}

        <View style={{ gap: space[2] }}>
          <T v="heading">Seeds</T>
          <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
            {c.seeds.map((sid, i) => {
              const m = members.find((x) => x.id === sid);
              return (
                <View key={sid} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                  <T v="label" c="text3" style={{ width: 20 }}>{i + 1}</T>
                  {m ? <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={36} /> : null}
                  <View style={{ flex: 1 }}>
                    <T v="label" numberOfLines={1}>{name(sid)}</T>
                    {byes.has(sid) ? <T v="caption" c="text3">Bye, straight to the {roundName(1, c.rounds).toLowerCase()}</T> : null}
                  </View>
                  {m ? <T v="label" c="text2">{fmt(m.rating)}</T> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <T v="heading">Deadlines</T>
          {deadlines.map((x, r) => (
            <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' }}>
              <T c="text2">{roundShort(r, c.rounds)}</T>
              <T v="label">{dayHm(x.deadline, tz)}</T>
            </View>
          ))}
        </View>

        <View style={{ gap: space[2] }}>
          <Button label="Full bracket" variant="secondary" onPress={() => router.replace(`/cup/bracket?id=${c.id}`)} />
          <Button label="Share the draw" variant="ghost" icon={Share2} onPress={share} />
        </View>
      </ScrollView>
    </View>
  );
}
