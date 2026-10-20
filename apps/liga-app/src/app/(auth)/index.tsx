import { router } from 'expo-router';
import { Crown, Flame, Swords, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { fmt, radius, space, useTheme, type PlayerColour } from '@/theme';
import { Avatar, Button, Card, Icon, Pill, Screen, T } from '@/ui';

// A1 + A1.1: intro with three value pages, swipe at your own pace (no auto advance), then email sign in.
const LADDER: { name: string; colour: PlayerColour; jersey: number; rating: number; delta?: number }[] = [
  { name: 'Mira', colour: 'yellow', jersey: 10, rating: 1124 },
  { name: 'Kim', colour: 'red', jersey: 7, rating: 1078, delta: 16 },
  { name: 'Dave', colour: 'blue', jersey: 9, rating: 1062 },
  { name: 'Sam', colour: 'green', jersey: 23, rating: 1003 },
];
const FEATURES = ['Ladder', 'Challenges', 'Weekly cup', 'Seasons', 'Titles', 'Rivalries'];

export default function Intro() {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  const ladder = () => (
    <Card style={{ gap: 4, paddingVertical: space[3] }}>
      {LADDER.map((p, i) => (
        <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 6 }}>
          <T v="label" c={i === 0 ? 'text' : 'text3'} style={{ width: 18, textAlign: 'center' }}>{i + 1}</T>
          <Avatar name={p.name} colour={p.colour} jersey={p.jersey} size={40} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T v="heading">{p.name}</T>
            {i === 0 ? <Icon as={Crown} size={15} color={t.crown} /> : null}
          </View>
          {p.delta ? <Pill label={`+${p.delta}`} tone="win" /> : null}
          <T v="number">{fmt(p.rating)}</T>
        </View>
      ))}
    </Card>
  );

  const match = () => (
    <Card style={{ gap: space[4], alignItems: 'center', paddingVertical: space[5] }}>
      <T v="caption" c="text3">Foosball, 1v1</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <View style={{ alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: t.win, minWidth: 110 }}>
          <Avatar name="Kim" colour="red" jersey={7} size={56} />
          <T v="heading" c="onWin">Kim</T>
          <T v="caption" c="onWin">Winner</T>
        </View>
        <T v="section" c="text3">vs</T>
        <View style={{ alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: t.surface2, minWidth: 110 }}>
          <Avatar name="Dave" colour="blue" jersey={9} size={56} />
          <T v="heading">Dave</T>
          <T v="caption" c="text3">Tap the winner</T>
        </View>
      </View>
    </Card>
  );

  const features = () => (
    <Card style={{ gap: space[4], paddingVertical: space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={Swords} size={22} color={t.onBrand} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="heading">Kim challenged you</T>
          <T v="caption" c="text3">Win and you take her spot</T>
        </View>
        <Icon as={Flame} size={18} color={t.warning} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FEATURES.map((f) => <Pill key={f} label={f} />)}
      </View>
    </Card>
  );

  const pages = [
    { title: 'Play. Log.\nClimb.', body: 'A private ladder for your office, club or friends. Every match moves the ranks.', visual: ladder },
    { title: 'Log in\ntwo taps', body: 'Pick the players, tap the winner. Ratings update before you are back at your desk.', visual: match },
    { title: 'Challenge\nanyone', body: 'Cups, seasons and rivalries when you want them. Turn on what your crew likes.', visual: features },
  ];

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2] }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={Trophy} size={22} color={t.onBrand} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/email')} style={{ height: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
          <T v="label">Sign in</T>
        </Pressable>
      </View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
        scrollEventThrottle={32} onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {pages.map((p) => (
          <View key={p.title} style={{ width, padding: space[6], gap: space[5], justifyContent: 'center' }}>
            {p.visual()}
            <T v="display">{p.title}</T>
            <T c="text2">{p.body}</T>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: space[6], paddingBottom: space[4], gap: space[4] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityLabel={`Page ${page + 1} of ${pages.length}`}>
          {pages.map((p, i) => (
            <View key={p.title} style={{ width: i === page ? 20 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? t.text : t.lineStrong }} />
          ))}
        </View>
        <Button label="Get started" onPress={() => router.push('/email')} />
      </View>
    </Screen>
  );
}
