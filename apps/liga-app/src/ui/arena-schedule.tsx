// Arena blocks of the Scheduling module: M7.3 Match of the day and M7.5 Who's free, plus the Plan link (M10.5).
import { router, useFocusEffect } from 'expo-router';
import { CalendarDays, Check, Flame, Swords } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { hm, tzOf } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { FREE_FOR, matchOfTheDay, setFree, whosFree, type Free, type Motd } from '@/lib/schedule';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Icon, Pill, T } from '@/ui';

export function ArenaSchedule() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me } = useLeague();
  const [motd, setMotd] = useState<Motd | null>(null);
  const [free, setFreeList] = useState<{ list: Free[]; mine: string | null } | null>(null);
  const on = isOn(league, 'schedule');

  const load = useCallback(async () => {
    if (!league || !session || !isOn(league, 'schedule')) return;
    const [m, f] = await Promise.all([matchOfTheDay(session.user, league.id), whosFree(session.user, league.id)]);
    setMotd(m); setFreeList(f);
  }, [league, session]);
  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]));

  if (!on || !me) return null;
  const tz = tzOf(league);
  const challenges = isOn(league, 'challenges');
  const pick = async (min: number) => { if (session && league) { await setFree(session.user, league.id, min); load(); } };
  const others = free?.list.filter((f) => !f.mine) ?? [];

  const motdCard = () => {
    if (!motd || motd.hidden) return null;
    if (motd.off) return <Card><T v="heading">Day off today</T><T v="small" c="text2">An odd number of players, so you sit this one out.</T></Card>;
    const o = motd.opp!;
    return (
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Avatar name={o.display_name} colour={o.colour} jersey={o.jersey} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="text3">Your match of the day</T>
            <T v="heading" numberOfLines={1}>You vs {o.display_name}</T>
            <T v="small" c="text2">{Math.round(motd.chance * 100)}% to win, {signed(motd.win)}</T>
          </View>
          {motd.done ? <Pill tone="win" icon={Check} label="Done" /> : null}
        </View>
        {motd.streak ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon as={Flame} size={16} color={t.text2} />
            <T v="label" c="text2">Day streak {motd.streak}</T>
          </View>
        ) : null}
        {!motd.done ? (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {challenges ? <Button label="Challenge" icon={Swords} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push(`/challenge/new?to=${o.id}`)} /> : null}
            <Button label="Log it" size="md" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/log', params: { a: me.id, b: o.id } })} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={{ gap: space[5] }}>
      {motdCard()}
      <View style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
          <T v="heading">Who&apos;s free</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Plan" onPress={() => router.push('/schedule/plan')} hitSlop={12}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon as={CalendarDays} size={16} color={t.text2} />
            <T v="label" c="text2">Plan</T>
          </Pressable>
        </View>
        <Card style={{ gap: space[3] }}>
          <T v="label">{free?.mine ? `You're free until ${hm(free.mine, tz)}` : "I'm free for"}</T>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {FREE_FOR.map((m) => (
              <Pressable key={m} accessibilityRole="button" onPress={() => pick(m)}
                style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <T v="label">{m} min</T>
              </Pressable>
            ))}
            {free?.mine ? (
              <Pressable accessibilityRole="button" onPress={() => pick(0)} style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                <T v="label" c="onPrimary">Busy</T>
              </Pressable>
            ) : null}
          </View>
          {others.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[3] }}>
              {others.map((f) => (
                <Pressable key={f.member.id} accessibilityRole="button" accessibilityLabel={`Challenge ${f.member.display_name}`} disabled={!challenges}
                  onPress={() => router.push(`/challenge/new?to=${f.member.id}`)} style={{ alignItems: 'center', gap: 4, width: 72 }}>
                  <Avatar name={f.member.display_name} colour={f.member.colour} jersey={f.member.jersey} size={44} />
                  <T v="caption" numberOfLines={1}>{f.member.display_name}</T>
                  <T v="caption" c="text3" numberOfLines={1}>until {hm(f.until, tz)}</T>
                </Pressable>
              ))}
            </ScrollView>
          ) : <T v="small" c="text3">Nobody&apos;s free right now.</T>}
        </Card>
      </View>
    </View>
  );
}
