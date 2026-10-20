// Shared season UI: data hook, Ranks entry band (G3 entry, R1.9 picker), podium and standings rows.
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, History, Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { isOn } from '@/lib/modules';
import { countdown, progressOf, seasonData, syncLeague, type Row, type SeasonData } from '@/lib/seasons';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Card, Icon, IconButton, Pill, T } from '@/ui';

// Loads every season of the current league on focus; runs the lazy season and dormant notices first.
export function useSeasons() {
  const { league } = useLeague();
  const [data, setData] = useState<SeasonData | null>(null);
  const load = useCallback(async () => {
    if (!league) return;
    await syncLeague(league.id);
    setData(await seasonData(league.id));
  }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, reload: load };
}

// Ranks entry: current season, time left and my season rank. Hidden when the module is off.
export function SeasonBand() {
  const { t } = useTheme();
  const { league, me } = useLeague();
  const { data } = useSeasons();
  if (!league || !isOn(league, 'seasons') || !data?.current) return null;
  const s = data.current;
  const p = progressOf(s);
  const mine = s.rows.find((r) => r.id === me?.id);
  const when = p.left === null ? `Day ${p.day}` : p.lastWeek ? `Ends in ${countdown(p.left)}` : `${Math.ceil(p.left / 604800000)} weeks left`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Card onPress={() => router.push('/season')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={Trophy} size={20} color={t.onBrand} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="label">Season {s.n}, {when}</T>
          <T v="caption" c="text2">{mine ? `You're #${mine.rank}, ${signed(mine.change)} this season` : 'One match puts you in the race'}</T>
        </View>
        <Icon as={ChevronRight} size={18} color={t.text3} />
      </Card>
      {data.closed.length ? <IconButton icon={History} label="All seasons" onPress={() => router.push('/season/archive')} /> : null}
    </View>
  );
}

// Podium 2, 1, 3 with solid crown for the winner.
export function Podium({ ids, members, meId }: { ids: string[]; members: Member[]; meId?: string }) {
  const { t } = useTheme();
  const order = [ids[1], ids[0], ids[2]];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: space[3] }}>
      {order.map((id, i) => {
        if (!id) return <View key={i} style={{ flex: 1 }} />;
        const m = members.find((x) => x.id === id);
        const place = i === 1 ? 1 : i === 0 ? 2 : 3;
        return (
          <Pressable key={id} accessibilityRole="button" onPress={() => router.push(`/player/${id}`)} style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
            <Avatar name={m?.display_name ?? '?'} colour={m?.colour ?? 'ink'} jersey={m?.jersey} size={place === 1 ? 64 : 52} />
            <T v="label" numberOfLines={1} center>{id === meId ? 'You' : m?.display_name ?? 'Former player'}</T>
            <View style={{ alignSelf: 'stretch', height: place === 1 ? 72 : place === 2 ? 52 : 40, borderRadius: radius.sm, backgroundColor: place === 1 ? t.crown : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <T v="number" c={place === 1 ? t.onCrown : 'text'}>{place}</T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// Season standings row: rank, player, W L, season rating and change since the season started.
export function StandingRow({ r, members, meId, onPress }: { r: Row; members: Member[]; meId?: string; onPress?: () => void }) {
  const { t } = useTheme();
  const m = members.find((x) => x.id === r.id);
  const mine = r.id === meId;
  return (
    <Pressable accessibilityRole="button" onPress={onPress ?? (() => router.push(`/player/${r.id}`))}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : mine ? t.surface2 : 'transparent' })}>
      <T v="label" c={r.rank === 1 ? 'text' : 'text3'} style={{ width: 22, textAlign: 'center' }}>{r.rank}</T>
      <Avatar name={m?.display_name ?? '?'} colour={m?.colour ?? 'ink'} jersey={m?.jersey} size={40} />
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={1}>{mine ? 'You' : m?.display_name ?? 'Former player'}</T>
        <T v="caption" c="text3">{r.won}W {r.lost}L</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="number">{fmt(r.rating)}</T>
        <T v="caption" c={r.change > 0 ? 'win' : 'text3'}>{signed(r.change)}</T>
      </View>
    </Pressable>
  );
}

export function ReadOnly() { return <Pill label="Read only" />; }
