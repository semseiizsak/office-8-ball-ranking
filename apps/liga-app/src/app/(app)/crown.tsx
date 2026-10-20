import { router, useFocusEffect } from 'expo-router';
import { Crown, Swords, User } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { eloPreview } from '@/lib/elo';
import { crownHistory, daysBetween, splitLadder } from '@/lib/stats';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Pill, Skeleton, T } from '@/ui';
import { goChallenge } from '@/ui/player-menu';

type Data = Awaited<ReturnType<typeof crownHistory>>;

const span = (n: number) => (n === 0 ? 'under a day' : n === 1 ? '1 day' : `${n} days`);

// R1.4 Crown sheet without the bounty module: who wears it, since when, defences and the last holders.
export default function CrownSheet() {
  const { t } = useTheme();
  const { members, me, league } = useLeague();
  const [d, setD] = useState<Data | null>(null);
  const king = splitLadder(members).ranked[0] ?? null;

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => setD(await crownHistory(league.id, king?.id ?? null)))();
  }, [league, king?.id]));

  const name = (id: string | null) => (!id ? '' : id === me?.id ? 'You' : members.find((m) => m.id === id)?.display_name ?? 'Former player');

  if (!king) {
    return (
      <View style={{ padding: space[5], gap: space[3], alignItems: 'center' }}>
        <Pill label="Crown" tone="crown" icon={Crown} />
        <T v="heading" center>No one wears the crown yet.</T>
        <T v="small" c="text2" center>The top player with five matches takes it.</T>
      </View>
    );
  }
  const mine = king.id === me?.id;
  const odds = me && !mine ? eloPreview(me.rating, king.rating, league?.k_factor ?? 32) : null;
  const num = (label: string, value: string) => (
    <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 2 }}>
      <T v="number">{value}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: space[5], gap: space[4], paddingBottom: 48 }}>
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <View style={{ padding: 4, borderRadius: 60, backgroundColor: t.crown }}>
          <Avatar name={king.display_name} colour={king.colour} jersey={king.jersey} size={96} />
        </View>
        <T v="section" center>{mine ? 'You wear the crown' : `${king.display_name} wears the crown`}</T>
        <T v="caption" c="text2">{fmt(king.rating)} rating, {king.wins}W {king.losses}L</T>
      </View>
      {!d ? <Skeleton h={72} /> : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {num('Held for', d.current && daysBetween(d.current.from, null) ? span(daysBetween(d.current.from, null)) : 'Today')}
          {num('Defended', d.current ? `${d.current.defences}×` : '0×')}
        </View>
      )}
      {odds ? (
        <Card style={{ gap: 4 }}>
          <T v="label">Your chance against {king.display_name}: {Math.round(odds.chanceA * 100)}%</T>
          <T v="small" c="text2">Win: {signed(odds.aWins)}. Lose: {signed(odds.bWins)}.</T>
        </Card>
      ) : mine ? <T v="small" c="text2" center>Every win while you wear it counts as a defence.</T> : null}
      {d && d.past.length ? (
        <Card style={{ gap: space[2] }}>
          <T v="heading">Previous holders</T>
          {d.past.map((r, i) => (
            <T key={i} v="small" c="text2">{name(r.holder)}, {span(daysBetween(r.from, r.to))}{r.takenBy ? `, lost to ${name(r.takenBy)}` : ''}</T>
          ))}
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {!mine ? <Button label={`Challenge ${king.display_name}`} icon={Swords} size="md" style={{ flex: 1 }} onPress={() => { router.back(); goChallenge(king.id); }} /> : null}
        <Button label="View profile" icon={User} size="md" variant="secondary" style={{ flex: mine ? 1 : undefined }} onPress={() => { router.back(); router.push(`/player/${king.id}`); }} />
      </View>
    </ScrollView>
  );
}
