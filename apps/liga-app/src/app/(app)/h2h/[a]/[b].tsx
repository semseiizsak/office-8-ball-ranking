import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, BarChart3, Swords } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { eloPreview } from '@/lib/elo';
import { headToHead, standingOf } from '@/lib/stats';
import { dayLabel } from '@/lib/time';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, IconButton, Screen, Skeleton, T } from '@/ui';
import { FormDots } from '@/ui/chart';
import { MatchCard } from '@/ui/match-card';
import { goChallenge, goCompare } from '@/ui/player-menu';

type H2H = Awaited<ReturnType<typeof headToHead>>;

// R5 Head to head between any two players of the league.
export default function HeadToHead() {
  const { t } = useTheme();
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { members, me, league } = useLeague();
  const [h, setH] = useState<H2H | null>(null);
  const [all, setAll] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => setH(await headToHead(league.id, a, b)))();
  }, [league, a, b]));

  const A = members.find((x) => x.id === a), B = members.find((x) => x.id === b);
  const name = (m: Member | undefined) => (!m ? 'Former player' : m.id === me?.id ? 'You' : m.display_name);
  const includesMe = me && (a === me.id || b === me.id);
  const other = includesMe ? (a === me!.id ? B : A) : null;

  if (!h) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={160} /><Skeleton h={120} /></View></Screen>;

  const side = (m: Member | undefined) => {
    const st = m ? standingOf(members, m.id) : null;
    return (
      <Pressable accessibilityRole="button" disabled={!m} onPress={() => m && router.push(`/player/${m.id}`)} style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
        {m ? <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={72} /> : <Avatar name="?" colour="ink" size={72} ring={false} />}
        <T v="heading" center numberOfLines={1}>{name(m)}</T>
        <T v="caption" c="text3">{m ? `${fmt(m.rating)}${st?.kind === 'ranked' ? `, #${st.rank}` : ''}` : 'Left the league'}</T>
      </Pressable>
    );
  };
  const k = league?.k_factor ?? 32;
  // Stakes for the next match, from the viewer's side when they are in it.
  const [p1, p2] = includesMe && b === me!.id ? [B, A] : [A, B];
  const stake = p1 && p2 ? eloPreview(p1.rating, p2.rating, k) : null;
  const total = h.aWins + h.bWins;
  const swingWho = h.swing >= 0 ? A : B;
  const swingFrom = h.swing >= 0 ? B : A;
  const nameIn = (id: string) => name(members.find((x) => x.id === id));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="heading" style={{ flex: 1, textAlign: 'center' }}>Head to head</T>
        <IconButton icon={BarChart3} label="Compare" onPress={() => goCompare(a, b)} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: 60 }}>
        <Card style={{ gap: space[4], paddingVertical: space[5] }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {side(A)}
            <View style={{ width: 96, alignItems: 'center', paddingTop: 18 }}>
              <T v="bigNumber" style={{ fontSize: 34, lineHeight: 38 }}>{h.aWins} : {h.bWins}</T>
            </View>
            {side(B)}
          </View>
          {total ? (
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
              {h.aWins ? <View style={{ flex: h.aWins, backgroundColor: t.pct[A?.colour ?? 'ink'] }} /> : null}
              {h.bWins ? <View style={{ flex: h.bWins, backgroundColor: t.pct[B?.colour ?? 'ink'] }} /> : null}
            </View>
          ) : null}
          <T v="caption" c="text2" center>{total ? `${total} played since ${dayLabel(h.first!)}` : 'No matches together yet'}</T>
        </Card>

        {total ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading">Rating swing</T>
            <T v="small" c="text2">{h.swing === 0 ? 'Dead even. Nobody is ahead on points.' : `${name(swingWho)} took ${signed(Math.abs(h.swing))} from ${name(swingFrom).toLowerCase() === 'you' ? 'you' : name(swingFrom)} in total.`}</T>
          </Card>
        ) : null}

        {stake && p1 && p2 ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading">Next match</T>
            <T v="small" c="text2">
              {includesMe ? `Win ${signed(stake.aWins)}, lose ${signed(stake.bWins)}, your chance ${Math.round(stake.chanceA * 100)}%.`
                : `If ${p1.display_name} wins ${signed(stake.aWins)}, if ${p2.display_name} wins ${signed(-stake.bWins)}. ${p1.display_name}'s chance ${Math.round(stake.chanceA * 100)}%.`}
            </T>
            {includesMe && other ? <Button label={`Challenge ${other.display_name}`} icon={Swords} size="md" onPress={() => goChallenge(other.id)} style={{ marginTop: space[2] }} /> : null}
          </Card>
        ) : null}

        {total ? (
          <Card style={{ gap: space[3] }}>
            <T v="heading">Last {h.form.length}, from {name(A).toLowerCase() === 'you' ? 'your' : `${name(A)}'s`} side</T>
            <FormDots form={h.form} />
          </Card>
        ) : null}

        {h.longest || h.biggestUpset ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading">Milestones</T>
            {h.longest ? <T v="small" c="text2">Longest streak: {nameIn(h.longest.who)}, {h.longest.n} wins, {dayLabel(h.longest.at)}</T> : null}
            {h.biggestUpset ? <T v="small" c="text2">Biggest upset: {nameIn(h.biggestUpset.who)}, {dayLabel(h.biggestUpset.at)}, {signed(h.biggestUpset.delta)}</T> : null}
          </Card>
        ) : null}

        <T v="section" style={{ marginTop: space[2] }}>Matches</T>
        {h.matches.length ? (
          <View style={{ gap: space[2] }}>
            {(all ? h.matches : h.matches.slice(0, 5)).map((r) => <MatchCard key={r.id} match={r} members={members} meId={me?.id} />)}
            {!all && h.matches.length > 5 ? <Button label={`See all ${h.matches.length}`} variant="secondary" size="md" onPress={() => setAll(true)} /> : null}
          </View>
        ) : (
          <Empty icon={Swords} title="Not played yet" body={stake ? `First meeting. ${name(p1)} ${name(p1) === 'You' ? 'have' : 'has'} a ${Math.round(stake.chanceA * 100)}% chance.` : 'Their first match shows up here.'} />
        )}
        <View style={{ height: 1, backgroundColor: t.line, borderRadius: radius.xs }} />
        <T v="caption" c="text3" center>Counts every match where they played on opposite sides, 1v1 and 2v2.</T>
      </ScrollView>
    </Screen>
  );
}
