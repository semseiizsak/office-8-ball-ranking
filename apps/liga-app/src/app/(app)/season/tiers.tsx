// G3.4 Rating tiers: five rating bands from the league's starting rating, my tier, who is in each.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { shortDate, TIERS, tierOf, tierSince } from '@/lib/seasons';
import { PROVISIONAL } from '@/lib/stats';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Card, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';

export default function Tiers() {
  const { t } = useTheme();
  const { members, me, league } = useLeague();
  const [open, setOpen] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { if (league && me) (async () => setSince(await tierSince(league.id, me.id)))(); }, [league, me]));

  const base = (league as { start_rating?: number } | null)?.start_rating ?? 1000;
  const placed = members.filter((m) => m.wins + m.losses >= PROVISIONAL);
  const myPlayed = me ? me.wins + me.losses : 0;
  const mine = me && myPlayed >= PROVISIONAL ? tierOf(me.rating, base) : null;

  return (
    <Screen>
      <Header title="Rating tiers" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <Card style={{ gap: 4 }}>
          {mine ? (
            <>
              <T v="section">{mine.tier.label}</T>
              <T v="small" c="text2">{mine.next ? `${mine.toNext} rating to ${mine.next.label}` : 'You made it to the top tier.'}</T>
              {since ? <T v="caption" c="text3">{mine.tier.label} since {shortDate(since)}</T> : null}
            </>
          ) : (
            <>
              <T v="section">Unranked</T>
              <T v="small" c="text2">{PROVISIONAL - myPlayed} placement {PROVISIONAL - myPlayed === 1 ? 'match' : 'matches'} left</T>
            </>
          )}
        </Card>
        {[...TIERS].reverse().map((tier) => {
          const i = TIERS.findIndex((x) => x.key === tier.key);
          const on = mine?.i === i;
          const next = TIERS[i + 1];
          const who = placed.filter((m) => tierOf(m.rating, base).i === i).sort((a, b) => b.rating - a.rating);
          const label = tier.from === -Infinity ? `Under ${fmt(base)}` : next ? `${fmt(base + tier.from)} to ${fmt(base + next.from - 1)}` : `${fmt(base + tier.from)} and up`;
          return (
            <View key={tier.key} style={{ gap: space[2] }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === tier.key }} onPress={() => setOpen(open === tier.key ? null : tier.key)}
                style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md,
                  backgroundColor: on ? t.primary : pressed ? t.surface3 : t.surface })}>
                <View style={{ flex: 1 }}>
                  <T v="heading" c={on ? 'onPrimary' : 'text'}>{tier.label}</T>
                  <T v="caption" c={on ? 'onPrimary' : 'text3'}>{label}</T>
                </View>
                <T v="label" c={on ? 'onPrimary' : 'text2'}>{who.length} {who.length === 1 ? 'player' : 'players'}</T>
              </Pressable>
              {open === tier.key ? who.map((m) => (
                <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push(`/player/${m.id}`)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[4] }}>
                  <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={36} />
                  <T v="body" style={{ flex: 1 }}>{m.id === me?.id ? 'You' : m.display_name}</T>
                  <T v="label">{fmt(m.rating)}</T>
                </Pressable>
              )) : null}
            </View>
          );
        })}
        <T v="caption" c="text3" center>Tiers follow your rating, so they move with every match.</T>
      </ScrollView>
    </Screen>
  );
}
