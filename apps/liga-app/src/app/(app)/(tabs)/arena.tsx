import { router, useFocusEffect } from 'expo-router';
import { Clock, Swords } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { ago, myChallenges, respondChallenge, stakesFor, timeLeft, whenLabel, type Challenge } from '@/lib/challenges';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, IconButton, Pill, Screen, Skeleton, T } from '@/ui';
import { AppBar } from '@/ui/appbar';
import { ArenaSchedule } from '@/ui/arena-schedule';
import { ChallengeRow } from '@/ui/challenge-row';
import { ArenaRewards } from '@/ui/rewards';
import { CollectArena } from '@/ui/cards-kit';
import { ArenaPredictions } from '@/ui/predict';
import { LiveNow } from '@/ui/live';

const MAX = 3;

// M7 Arena with M7.4 blocks: received (Accept, Decline), upcoming, waiting, recent. M7.2 open board is P2.
export default function Arena() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me, refresh } = useLeague();
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!league || !session) return;
    setRows(await myChallenges(session.user, league.id));
  }, [league, session]);
  // Bot replies resolve on read, so poll gently while the tab is open.
  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]));

  const byId = new Map(members.map((m) => [m.id, m]));
  const ch = isOn(league, 'challenges');
  const all = ch ? rows ?? [] : [];
  const received = all.filter((c) => c.status === 'pending' && c.to === me?.id);
  const upcoming = all.filter((c) => c.status === 'accepted');
  const waiting = all.filter((c) => c.status === 'pending' && c.from === me?.id);
  const past = all.filter((c) => !['pending', 'accepted'].includes(c.status));

  const answer = async (c: Challenge, accept: boolean) => {
    if (!session) return;
    setBusy(c.id + accept);
    try { await respondChallenge(session.user, c.id, accept); } catch { /* state changed meanwhile, reload shows it */ }
    setBusy(null);
    load();
  };

  const receivedCard = (c: Challenge) => {
    const from = byId.get(c.from);
    const s = stakesFor(c, me?.id);
    return (
      <Card key={c.id} style={{ gap: space[3] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open challenge" onPress={() => router.push(`/challenge/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {from ? <Avatar name={from.display_name} colour={from.colour} jersey={from.jersey} size={48} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading" numberOfLines={1}>{from?.display_name ?? 'Someone'} challenged you</T>
            <T v="caption" c="text3">{ago(c.created_at)}{c.scheduled_at ? `, ${whenLabel(c.scheduled_at)}` : ''}</T>
          </View>
          <Pill label={timeLeft(c.expires_at)} tone="warning" icon={Clock} />
        </Pressable>
        {c.message ? <T c="text2">“{c.message}”</T> : null}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {stake('Win', signed(s.win), true)}
          {stake('Lose', signed(s.lose))}
          {stake('Chance', `${Math.round(s.chance * 100)}%`)}
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Decline" variant="secondary" size="md" style={{ flex: 1 }} loading={busy === c.id + false} onPress={() => answer(c, false)} />
          <Button label="Accept" size="md" style={{ flex: 1 }} loading={busy === c.id + true} onPress={() => answer(c, true)} />
        </View>
      </Card>
    );
  };

  const stake = (label: string, value: string, win?: boolean) => (
    <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.sm, paddingVertical: space[2], alignItems: 'center' }}>
      <T v="number" c={win ? 'win' : 'text'}>{value}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );

  const upcomingCard = (c: Challenge) => {
    const other = byId.get(c.from === me?.id ? c.to : c.from);
    const s = stakesFor(c, me?.id);
    return (
      <Card key={c.id} onPress={() => router.push(`/challenge/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {other ? <Avatar name={other.display_name} colour={other.colour} jersey={other.jersey} size={44} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label" numberOfLines={1}>You vs {other?.display_name}</T>
          <T v="caption" c="text3">{c.scheduled_at ? whenLabel(c.scheduled_at) : 'Any time'}, win {signed(s.win)}</T>
        </View>
        <Button label="Log result" size="sm" onPress={() => router.push({ pathname: '/log', params: { a: c.from, b: c.to, challenge: c.id } })} />
      </Card>
    );
  };

  const block = (title: string, items: Challenge[], render: (c: Challenge) => ReactNode) => items.length ? (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
        <T v="heading">{title}</T>
        {items.length > MAX ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/challenge')} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T v="label" c="text2">See all</T>
          </Pressable>
        ) : null}
      </View>
      {items.slice(0, MAX).map(render)}
    </View>
  ) : null;

  const quiet = rows && !received.length && !upcoming.length && !waiting.length;
  const free = members.filter((m) => m.id !== me?.id).slice(0, 2).map((m) => m.display_name);

  return (
    <Screen>
      <AppBar />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: space[5] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), refresh()]); setRefreshing(false); }} tintColor={t.text2} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[2] }}>
          <T v="title" style={{ paddingHorizontal: space[1] }}>Arena</T>
          {ch ? <IconButton icon={Swords} label="New challenge" onPress={() => router.push('/challenge/new')} /> : null}
        </View>
        {!rows ? (
          <View style={{ gap: space[2] }}>{[0, 1].map((i) => <Skeleton key={i} h={140} />)}</View>
        ) : (
          <>
            <LiveNow />{/* M7.1 */}
            {block('For you', received, receivedCard)}
            <ArenaSchedule />
            <ArenaRewards />
            <CollectArena />{/* G8, G3.2, G5.5 */}
            <ArenaPredictions />
            {block('Upcoming', upcoming, upcomingCard)}
            {block('Waiting for a reply', waiting, (c) => <ChallengeRow key={c.id} c={c} members={members} meId={me?.id} />)}
            {!ch ? null : quiet ? (
              <Empty icon={Swords} title="Nothing on yet" body={free.length ? `${free.join(' and ')} are around. Challenge someone.` : 'Invite a teammate, then challenge them.'}
                action={<Button label="Challenge someone" icon={Swords} variant="brand" onPress={() => router.push('/challenge/new')} />} />
            ) : (
              <Button label="Challenge someone" icon={Swords} variant="secondary" onPress={() => router.push('/challenge/new')} />
            )}
            {block('Recent', past, (c) => <ChallengeRow key={c.id} c={c} members={members} meId={me?.id} />)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
