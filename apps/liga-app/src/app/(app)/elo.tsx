import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { eloPreview } from '@/lib/elo';
import { DORMANT_DAYS, PROVISIONAL, UPSET, splitLadder, standingOf } from '@/lib/stats';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Card, Icon, T } from '@/ui';

// R9.1 How ratings work, and R9.2 New player rating (topic=new). Form sheet.
export default function Elo() {
  const { t } = useTheme();
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const { members, me, league } = useLeague();
  const [formula, setFormula] = useState(false);
  const k = league?.k_factor ?? 32;

  const card = (title: string, body: string) => (
    <Card key={title} style={{ gap: 4, backgroundColor: t.surface }}>
      <T v="heading">{title}</T>
      <T v="small" c="text2">{body}</T>
    </Card>
  );

  if (topic === 'new') {
    const st = me ? standingOf(members, me.id) : null;
    const done = me ? me.wins + me.losses : 0;
    return (
      <ScrollView contentContainerStyle={{ padding: space[5], gap: space[4], paddingBottom: 48 }}>
        <T v="title">New players</T>
        {card('Your rating is still settling.', `Your first ${PROVISIONAL} matches find your level. Until then you are listed under New players, with a question mark next to your rating, and you cannot take the crown.`)}
        {st?.kind === 'new' ? (
          <Card style={{ gap: space[2] }}>
            <T v="label">{done} of {PROVISIONAL} matches</T>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: PROVISIONAL }, (_, i) => <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < done ? t.brand : t.surface3 }} />)}
            </View>
          </Card>
        ) : st ? <T v="small" c="text2">You are ranked. Your rating moves at normal speed.</T> : null}
        {st?.kind === 'new' ? <Button label="Log match" icon={Plus} onPress={() => { router.back(); router.push('/log'); }} /> : null}
      </ScrollView>
    );
  }

  // Real example from the league: the players just above and below you, or the top two.
  const { ranked } = splitLadder(members);
  const base = me ?? ranked[0];
  const others = members.filter((m) => m.id !== base?.id).sort((x, y) => y.rating - x.rating);
  const stronger = others.find((m) => m.rating > (base?.rating ?? 0)) ?? others[0];
  const weaker = [...others].reverse().find((m) => m.rating < (base?.rating ?? 0)) ?? others[others.length - 1];
  const who = base && base.id === me?.id ? 'You' : base?.display_name;
  const example = base && stronger && weaker && stronger.id !== weaker.id
    ? `${who} (${fmt(base.rating)}) beat ${stronger.display_name} (${fmt(stronger.rating)}): ${signed(eloPreview(base.rating, stronger.rating, k).aWins)}. ${who} beat ${weaker.display_name} (${fmt(weaker.rating)}): ${signed(eloPreview(base.rating, weaker.rating, k).aWins)}.`
    : 'Beat someone rated 100 above you and you gain about 20. Beat someone 100 below and you gain about 12.';

  return (
    <ScrollView contentContainerStyle={{ padding: space[5], gap: space[3], paddingBottom: 48 }}>
      <T v="title" style={{ marginBottom: space[1] }}>How ratings work</T>
      {card('Everyone starts at 1 000.', 'Win and you gain points. Lose and you give them to the winner.')}
      {card('Beating a stronger player pays more.', example)}
      {card('Upsets count.', `When the winner had less than a ${Math.round(UPSET * 100)}% chance, the match is an upset.`)}
      <T v="small" c="text2">Before every match you see what is at stake, for example +20 if you win and −12 if you lose.</T>
      <Card style={{ gap: 4 }}>
        <T v="label">This league</T>
        <T v="small" c="text2">K {k}, start 1 000, new players settle in {PROVISIONAL} matches, dormant after {DORMANT_DAYS} days without a match.</T>
      </Card>
      <Card style={{ gap: 4 }}>
        <T v="label">Doubles</T>
        <T v="small" c="text2">In 2v2 your side plays as the average rating of both players. Both partners win or lose the same points.</T>
      </Card>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/elo', params: { topic: 'new' } })}
        style={({ pressed }) => ({ minHeight: 48, borderRadius: radius.md, paddingHorizontal: space[4], justifyContent: 'center', backgroundColor: pressed ? t.surface3 : t.surface })}>
        <T v="label">New players</T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: formula }} onPress={() => setFormula(!formula)}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 6 }}>
        <T v="label" c="text2" style={{ flex: 1 }}>Advanced: the formula</T>
        <Icon as={formula ? ChevronUp : ChevronDown} size={18} color={t.text2} />
      </Pressable>
      {formula ? (
        <Card style={{ gap: 6 }}>
          <T v="small" c="text2">Expected score E = 1 ÷ (1 + 10 ^ ((Rb − Ra) ÷ 400))</T>
          <T v="small" c="text2">Change = K × (result − E), where result is 1 for a win and 0 for a loss.</T>
        </Card>
      ) : null}
    </ScrollView>
  );
}
