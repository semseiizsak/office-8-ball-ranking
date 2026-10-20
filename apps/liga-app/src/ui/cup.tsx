// Shared cup pieces (DS #cup): a bracket match cell and a ticking clock.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { countdown, dayHm, H, roundName, type Cup, type CupGame } from '@/lib/cup';
import type { Member } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Pill, T } from '@/ui';

// Re-renders every `ms`, for countdowns.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

export const who = (members: Member[], id: string | null, meId?: string) => (!id ? null : id === meId ? 'You' : members.find((m) => m.id === id)?.display_name ?? 'Former player');

// Empty seat names the game it waits for: "Winner quarterfinal 4".
export function feederLabel(c: Cup, g: CupGame, side: 'a' | 'b') {
  if (g.round === 0) return 'Bye';
  const slot = g.slot * 2 + (side === 'a' ? 0 : 1);
  return `Winner ${roundName(g.round - 1, c.rounds).toLowerCase()} ${slot + 1}`;
}

export function GameCell({ c, g, members, meId, tz, now }: { c: Cup; g: CupGame; members: Member[]; meId?: string; tz: string; now: number }) {
  const { t } = useTheme();
  const mine = !!meId && (g.a === meId || g.b === meId);
  const decided = g.status === 'played' || g.status === 'wo' || g.status === 'bye';
  const left = new Date(g.deadline).getTime() - now;
  const soon = g.status === 'open' && left > 0 && left < 3 * H;
  const champ = c.status === 'done' && g.round === c.rounds - 1;
  const seat = (side: 'a' | 'b') => {
    const id = g[side];
    const m = id ? members.find((x) => x.id === id) : undefined;
    const won = decided && !!id && g.winner === id;
    const lost = decided && !!id && g.winner !== id;
    const score = g.score ? g.score[side === 'a' ? 0 : 1] : null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40, paddingHorizontal: space[2], borderRadius: radius.xs, backgroundColor: won ? t.win : 'transparent' }}>
        <T v="caption" c={won ? 'onWin' : 'text3'} style={{ width: 16, textAlign: 'center' }}>{(side === 'a' ? g.seed_a : g.seed_b) ?? ''}</T>
        {m ? <Avatar name={m.display_name} colour={m.colour} size={26} ring={false} /> : null}
        <T v="label" c={won ? 'onWin' : lost || !id ? 'text3' : 'text'} style={{ flex: 1 }} numberOfLines={1}>
          {who(members, id, meId) ?? (g.status === 'bye' ? 'Bye' : feederLabel(c, g, side))}
        </T>
        {won && g.status === 'wo' ? <T v="caption" c="onWin">Walkover</T> : null}
        {score !== null ? <T v="label" c={won ? 'onWin' : 'text3'}>{score}</T> : null}
      </View>
    );
  };
  const status = g.status === 'bye' ? 'Bye, through' : g.status === 'wo' ? 'Walkover' : g.status === 'played' ? 'Played' : g.status === 'open' ? `Due ${dayHm(g.deadline, tz)}` : `Upcoming, ${dayHm(g.deadline, tz)}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${roundName(g.round, c.rounds)} ${g.slot + 1}`} onPress={() => router.push(`/cup/game/${g.id}`)}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface3 : t.surface, borderRadius: radius.md, padding: space[2], gap: 2,
        borderWidth: 2, borderColor: champ ? t.crown : mine ? t.brand : 'transparent' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[2], paddingTop: 2, minHeight: 24 }}>
        <T v="caption" c="text3">{roundName(g.round, c.rounds)} {g.slot + 1}</T>
        {soon ? <Pill tone="warning" label={`Due in ${countdown(new Date(g.deadline).getTime(), now)}`} /> : <T v="caption" c="text3">{status}</T>}
      </View>
      {seat('a')}
      {seat('b')}
    </Pressable>
  );
}
