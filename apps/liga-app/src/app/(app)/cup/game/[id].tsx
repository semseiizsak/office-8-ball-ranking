// G1.4.1 Cup match, G1.5 Your next match (ready, log, nudge, suggest a time), G1.5.1 walkover result
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Bell, CalendarClock, Check, Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { countdown, dayHm, getGame, hm, nudge, roundName, setReady } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { dayLabel } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Pill, Skeleton, T } from '@/ui';
import { feederLabel, useNow, who } from '@/ui/cup';
import { Header } from '@/ui/list-row';
import { CallCard } from '@/ui/predict';

type Data = Awaited<ReturnType<typeof getGame>>;

export default function CupGameScreen() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<Data | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow(30000);

  const load = useCallback(async () => setD(await getGame(id)), [id]);
  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]));

  if (d === undefined) return <View style={{ flex: 1, backgroundColor: t.bg }}><Header title="Cup match" /><View style={{ padding: space[4], gap: space[2] }}><Skeleton h={160} /><Skeleton h={80} /></View></View>;
  if (!d) return <View style={{ flex: 1, backgroundColor: t.bg }}><Header title="Cup match" /><Empty icon={Trophy} title="Match not found" body="This cup match is gone." /></View>;

  const { cup: c, game: g, h2h, tz } = d;
  const mine = !!me && (g.a === me.id || g.b === me.id);
  const admin = isAdmin(me);
  const opp = mine ? (g.a === me!.id ? g.b : g.a) : null;
  const open = g.status === 'open';
  const left = new Date(g.deadline).getTime() - now;
  const iReady = !!(me && g.ready[me.id]);
  const bothReady = !!(g.a && g.b && g.ready[g.a] && g.ready[g.b]);
  const name = (x: string | null) => who(members, x, me?.id) ?? '';
  const rn = roundName(g.round, c.rounds);

  const run = async (key: string, f: () => Promise<void>, fail = 'Nothing changed. Try again in a moment.') => {
    if (!session) return;
    setBusy(key);
    try { await f(); } catch (e) { Alert.alert('That did not work', e instanceof Error && e.message === 'nudged today' ? 'You already nudged today. One a day keeps it friendly.' : fail); }
    setBusy(null);
    load();
  };

  const seat = (side: 'a' | 'b') => {
    const sid = g[side];
    const m = members.find((x) => x.id === sid);
    const seed = side === 'a' ? g.seed_a : g.seed_b;
    const won = !!g.winner && g.winner === sid;
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: won ? t.win : t.surface2 }}>
        {m ? <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={56} /> : <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', borderColor: t.lineStrong }} />}
        <T v="heading" c={won ? 'onWin' : sid ? 'text' : 'text3'} center numberOfLines={2}>{sid ? name(sid) : feederLabel(c, g, side)}</T>
        <T v="caption" c={won ? 'onWin' : 'text3'} center>{seed ? `Seed ${seed}` : ' '}{m ? `, ${fmt(m.rating)}` : ''}</T>
        {open && sid ? <T v="caption" c={won ? 'onWin' : g.ready[sid] ? 'win' : 'text3'} center>{g.ready[sid] ? `Ready since ${hm(g.ready[sid], tz)}` : 'Not ready yet'}</T> : null}
        {g.score ? <T v="number" c={won ? 'onWin' : 'text2'}>{g.score[side === 'a' ? 0 : 1]}</T> : null}
      </View>
    );
  };

  const balance = (() => {
    if (!g.a || !g.b) return null;
    const [x, y, X, Y] = g.b === me?.id ? [h2h.b, h2h.a, g.b, g.a] : [h2h.a, h2h.b, g.a, g.b];
    if (!x && !y) return 'Their first meeting';
    if (x === y) return `Level ${x} : ${y}`;
    const top = name(x > y ? X : Y);
    return `${top} ${top === 'You' ? 'lead' : 'leads'} ${Math.max(x, y)} : ${Math.min(x, y)}`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={rn} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <View style={{ gap: space[1] }}>
          <T v="caption" c="text3">Weekly cup, week {c.week_no}</T>
          {open || g.status === 'waiting' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
              <T v="heading">Play by {dayHm(g.deadline, tz)}</T>
              {left > 0 ? <Pill tone={left < 3 * 3600000 ? 'warning' : 'neutral'} label={`${countdown(new Date(g.deadline).getTime(), now)} left`} /> : null}
            </View>
          ) : <T v="heading">{g.status === 'bye' ? 'Bye, straight through' : g.status === 'wo' ? 'Walkover' : 'Played'}</T>}
          {g.planned_at && open ? <T v="small" c="text2">Planned for {dayHm(g.planned_at, tz)}</T> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {seat('a')}
          {seat('b')}
        </View>

        {g.note ? <Card><T>{g.note}</T></Card> : null}
        {open ? <T v="small" c="text2">Nobody ready by the deadline? The higher seed goes through. Only one ready? They go through.</T> : null}
        {g.status === 'waiting' ? <T v="small" c="text2">Waiting for the earlier round, due {dayHm(c.games.find((x) => x.round === g.round - 1)?.deadline ?? g.deadline, tz)}.</T> : null}

        {mine && open ? (
          <View style={{ gap: space[2] }}>
            {bothReady
              ? <Button label="Log result" icon={Trophy} onPress={() => router.push({ pathname: '/log', params: { a: me!.id, b: opp!, cup: g.id } })} />
              : <Button label={iReady ? "You're ready" : "I'm ready"} icon={iReady ? Check : undefined} variant={iReady ? 'secondary' : 'brand'} loading={busy === 'ready'}
                  onPress={() => run('ready', () => setReady(session!.user, g.id, !iReady))} />}
            {bothReady ? <Button label="Not ready after all" variant="ghost" size="md" onPress={() => run('ready', () => setReady(session!.user, g.id, false))} />
              : <Button label="Log result" variant="secondary" onPress={() => router.push({ pathname: '/log', params: { a: me!.id, b: opp!, cup: g.id } })} />}
            {opp && !g.ready[opp] ? <Button label="Nudge" icon={Bell} variant="ghost" size="md" loading={busy === 'nudge'} onPress={() => run('nudge', () => nudge(session!.user, g.id))} /> : null}
            {isOn(league, 'schedule') ? <Button label="Suggest a time" icon={CalendarClock} variant="ghost" size="md" onPress={() => router.push(`/schedule/pick?cup=${g.id}`)} /> : null}
          </View>
        ) : null}
        {!mine && admin && open ? (
          <View style={{ gap: space[2] }}>
            <Button label="Log result for them" variant="secondary" onPress={() => router.push({ pathname: '/log', params: { a: g.a!, b: g.b!, cup: g.id } })} />
            <Button label="Manage cup" variant="ghost" size="md" onPress={() => router.push('/cup/manage')} />
          </View>
        ) : null}

        {g.a && g.b ? <CallCard target="cup" id={g.id} /> : null}
        {balance || h2h.last.length ? (
          <View style={{ gap: space[2] }}>
            <T v="heading">Head to head</T>
            {balance ? <T c="text2">{balance}</T> : null}
            {h2h.last.map((m, i) => (
              <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push(`/match/${m.id}`)}
                style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface, marginTop: i ? space[1] : 0 })}>
                <T v="label">{name(m.winner)} won</T>
                <T v="caption" c="text3">{dayLabel(m.at)}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {g.match_id ? <Button label="Open match" variant="secondary" onPress={() => router.push(`/match/${g.match_id}`)} /> : null}
        <Button label="Full bracket" variant="ghost" size="md" onPress={() => router.push(`/cup/bracket?id=${c.id}`)} />
      </ScrollView>
    </View>
  );
}
