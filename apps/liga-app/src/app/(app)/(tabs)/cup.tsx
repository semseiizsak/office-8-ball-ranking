// G1 Cup tab, G1.1 Sign up wall, G1.2 Countdown and draw pending, G1.5 Your next match (hero), G1.7 champion card (short)
import { router, useFocusEffect } from 'expo-router';
import { CalendarDays, Crown, Info, Settings2, Trophy } from 'lucide-react-native';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { cabinet, countdown, cupHome, dayHm, dayKey, DAYS, hm, myPath, roundName, signUp, withdraw, type CupView } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Icon, IconButton, Pill, Screen, Skeleton, T } from '@/ui';
import { AppBar } from '@/ui/appbar';
import { GameCell, useNow, who } from '@/ui/cup';

type Shelf = Awaited<ReturnType<typeof cabinet>>;

export default function CupTab() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me, refresh } = useLeague();
  const [v, setV] = useState<CupView | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef('');
  const now = useNow(1000);
  const on = isOn(league, 'cup');

  const load = useCallback(async () => {
    if (!league || !session || !isOn(league, 'cup')) return;
    try {
      const x = await cupHome(session.user, league.id);
      setV(x); setError(false);
      if (me) setShelf(await cabinet(league.id, me.id));
      // The draw scene shows once after the draw, the champion scene once for the winner (G1.3, G1.7).
      const c = x.cup;
      if (c && me && c.seeds.includes(me.id)) {
        const seen = c.seen[me.id] ?? [];
        const key = c.id + c.status;
        if (shown.current !== key && c.status === 'running' && !seen.includes('draw')) { shown.current = key; router.push('/cup/draw'); }
        else if (shown.current !== key && c.status === 'done' && c.champion_id === me.id && !seen.includes('champion')) { shown.current = key; router.push(`/cup/champion?id=${c.id}`); }
      }
    } catch { setError(true); }
  }, [league, session, me]);
  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]));

  const admin = isAdmin(me);
  const menu = () => {
    const go = (i: number) => router.push(i === 0 ? '/cup/manage' : '/cup/settings');
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: ['Manage cup', 'Cup settings', 'Cancel'], cancelButtonIndex: 2 }, (i) => { if (i < 2) go(i); });
    else Alert.alert('Cup', undefined, [{ text: 'Manage cup', onPress: () => go(0) }, { text: 'Cup settings', onPress: () => go(1) }, { text: 'Cancel', style: 'cancel' }]);
  };

  const act = async (f: () => Promise<void>) => {
    setBusy(true);
    try { await f(); } catch { Alert.alert('That did not work', 'Nothing changed. Try again in a moment.'); }
    setBusy(false);
    load();
  };

  if (!on) {
    return (
      <Screen>
        <AppBar />
        <Empty icon={Trophy} title="The weekly cup is off" body="The weekly cup is off in this league."
          action={admin ? <Button label="Turn on in settings" variant="secondary" onPress={() => router.push('/cup/settings')} /> : undefined} />
      </Screen>
    );
  }

  const c = v?.cup ?? null;
  const tz = v?.tz ?? 'Europe/Budapest';
  const cfg = v?.cfg;
  const name = (id: string | null) => who(members, id, me?.id) ?? '';
  const path = c ? myPath(c, me?.id) : null;
  const last = v?.past[0];
  const coins = isOn(league, 'coins');

  const block = (title: string, children: ReactNode, link?: { label: string; href: string }) => (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
        <T v="heading">{title}</T>
        {link ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(link.href as never)} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T v="label" c="text2">{link.label}</T>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );

  const champCard = (champion: string | null, runner: string | null, score: [number, number] | null, week: number, cupId: string, label: string) => {
    const m = members.find((x) => x.id === champion);
    return (
      <Card onPress={() => router.push(`/cup/bracket?id=${cupId}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ padding: 3, borderRadius: 30, backgroundColor: t.crown }}>
          {m ? <Avatar name={m.display_name} colour={m.colour} size={48} /> : <Icon as={Trophy} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption" c="text3">{label}, week {week}</T>
          <T v="heading" numberOfLines={1}>{champion === me?.id ? 'You won the cup' : `${name(champion)} won the cup`}</T>
          <T v="small" c="text2" numberOfLines={1}>{score ? `Beat ${name(runner)} ${score[0]} : ${score[1]} in the final` : `Beat ${name(runner)} in the final`}</T>
        </View>
      </Card>
    );
  };

  const signupWall = () => {
    if (!c || !cfg) return null;
    const mineIn = c.entrants.findIndex((e) => e.member_id === me?.id);
    const waitIdx = c.waitlist.findIndex((e) => e.member_id === me?.id);
    const full = c.entrants.length >= c.max;
    const drawAt = new Date(c.draw_at).getTime();
    const ranked = [...c.entrants].map((e) => members.find((m) => m.id === e.member_id)).filter(Boolean).sort((a, b) => b!.rating - a!.rating);
    const seedGuess = me ? ranked.findIndex((m) => m!.id === me.id) + 1 : 0;
    const pct = Math.min(1, c.entrants.length / c.max);
    return (
      <Card style={{ gap: space[4] }}>
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="section">Weekly cup</T>
            <Pill tone="win" label="Sign up open" />
          </View>
          <T v="number">Draw at {hm(drawAt, tz)} in {countdown(drawAt, now, true)}</T>
          <T v="small" c="text2">Final {dayHm(c.final_at, tz)}. Single elimination, one match per round.</T>
        </View>
        <View style={{ gap: space[2] }}>
          <T v="label">{c.entrants.length} of {c.max} spots taken</T>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: t.brand }} />
          </View>
          {c.entrants.length < cfg.min ? <T v="caption" c="text3">{cfg.min - c.entrants.length} to go for a cup</T> : null}
        </View>
        <View style={{ gap: 4 }}>
          <T v="label" c="text2">Prizes</T>
          <T v="small">Champion: cup badge, week {c.week_no}</T>
          {coins ? <T v="small">Winner {fmt(c.prizes.winner)} coins, final {fmt(c.prizes.runner)} coins</T> : null}
          <T v="caption" c="text3">No entry fee. Prizes come from the league.</T>
        </View>
        {c.entrants.length ? (
          <View style={{ gap: space[1] }}>
            {c.entrants.map((e) => {
              const m = members.find((x) => x.id === e.member_id);
              if (!m) return null;
              return (
                <View key={e.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 }}>
                  <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={36} />
                  <T v="label" style={{ flex: 1 }} numberOfLines={1}>{name(m.id)}</T>
                  <T v="caption" c="text3">{last?.champion_id === m.id ? 'last winner, ' : ''}signed up {hm(e.at, tz)}</T>
                </View>
              );
            })}
          </View>
        ) : <T v="small" c="text3">Nobody yet. Be the first.</T>}
        {mineIn >= 0 ? (
          <View style={{ gap: space[2] }}>
            <T v="heading">You&apos;re in, seed estimate #{seedGuess}</T>
            <Button label="Withdraw" variant="ghost" size="md" loading={busy}
              onPress={() => Alert.alert('Withdraw from the cup?', `You can sign up again until ${hm(drawAt, tz)}.`, [
                { text: 'Stay in', style: 'cancel' }, { text: 'Withdraw', style: 'destructive', onPress: () => act(() => withdraw(session!.user, league!.id)) }])} />
          </View>
        ) : waitIdx >= 0 ? (
          <View style={{ gap: space[2] }}>
            <T v="heading">You&apos;re on the waitlist, #{waitIdx + 1}</T>
            <Button label="Leave the waitlist" variant="ghost" size="md" loading={busy} onPress={() => act(() => withdraw(session!.user, league!.id))} />
          </View>
        ) : !v?.eligible ? (
          <T v="small" c="text2">Play one match this season, then you can sign up.</T>
        ) : (
          <Button label={full ? 'Cup is full. Join the waitlist' : 'Sign me up'} variant={full ? 'secondary' : 'brand'} icon={Trophy} loading={busy}
            onPress={() => act(() => signUp(session!.user, league!.id))} />
        )}
      </Card>
    );
  };

  const nextCard = () => {
    if (!c || !path) return null;
    const g = path.next;
    if (path.entered && path.alive && g) {
      const opp = g.a === me?.id ? g.b : g.a;
      const next = c.games.find((x) => x.round === g.round + 1 && x.slot === Math.floor(g.slot / 2));
      const other = next ? (g.slot % 2 === 0 ? next.b : next.a) : null;
      const rd = (id: string | null) => (id && g.ready[id] ? `ready since ${hm(g.ready[id], tz)}` : 'not ready yet');
      return (
        <Card style={{ gap: space[3], borderWidth: 2, borderColor: t.brand }}>
          <T v="caption" c="text3">Your next match</T>
          <T v="section">{roundName(g.round, c.rounds)}, you vs {name(opp)}</T>
          {next && other ? <T v="small" c="text2">Winner meets {name(other)}</T> : null}
          <T v="label">Play by {dayHm(g.deadline, tz)}, {countdown(new Date(g.deadline).getTime(), now)} left</T>
          <T v="small" c="text2">You {rd(me?.id ?? null)}. {name(opp)} {rd(opp)}.</T>
          <Button label="See my match" onPress={() => router.push(`/cup/game/${g.id}`)} />
        </Card>
      );
    }
    if (path.entered && path.alive) {
      const w = path.games.find((x) => x.status === 'waiting');
      const bye = path.games.find((x) => x.status === 'bye');
      return (
        <Card style={{ gap: space[2] }}>
          <T v="heading">{bye && !path.games.some((x) => x.status === 'played' || x.status === 'wo') ? 'Bye this round' : 'Through to the next round'}</T>
          {w ? <T v="small" c="text2">Waiting for {feeder(w)}, due {dayHm(w.deadline, tz)}.</T> : null}
          <Button label="Full bracket" variant="secondary" onPress={() => router.push('/cup/bracket')} />
        </Card>
      );
    }
    const alive = c.seeds.filter((id) => !c.games.some((g) => g.winner && g.winner !== id && (g.a === id || g.b === id)));
    const names = alive.slice(0, 2).map(name).join(' and ');
    const by = path.lost ? path.lost.winner : null;
    return (
      <Card style={{ gap: space[2] }}>
        <T v="heading">{path.entered ? "You're out" : `${alive.length} still in`}</T>
        <T v="small" c="text2">
          {path.entered ? `Beaten by ${name(by)} in the ${roundName(path.lost!.round, c.rounds).toLowerCase()}. ` : ''}{names} {alive.length > 2 ? `and ${alive.length - 2} more are` : alive.length === 1 ? 'is' : 'are'} still in.
        </T>
        <Button label="Full bracket" variant="secondary" onPress={() => router.push('/cup/bracket')} />
      </Card>
    );
  };
  const feeder = (g: NonNullable<typeof c>['games'][number]) => {
    const prev = c!.games.filter((x) => x.round === g.round - 1 && Math.floor(x.slot / 2) === g.slot && !x.winner);
    const ids = prev.flatMap((x) => [x.a, x.b]).filter(Boolean) as string[];
    return ids.length ? ids.map(name).join(' or ') : 'your opponent';
  };

  const hero = () => {
    if (!c || !cfg) return <Empty icon={Trophy} title="No cup right now" body="This league is archived, so no new cups start." />;
    if (c.status === 'upcoming') {
      const opens = new Date(c.opens_at).getTime();
      return (
        <Card style={{ gap: space[2] }}>
          <T v="caption" c="text3">Weekly cup</T>
          <T v="number">Opens in {countdown(opens, now)}</T>
          <T v="small" c="text2">Sign up {DAYS[cfg.openDay - 1]} {cfg.openHour}:00 to {cfg.closeHour}:00. Everyone with at least 1 match can join.</T>
        </Card>
      );
    }
    if (c.status === 'signup') return signupWall();
    if (c.status === 'cancelled') {
      return (
        <Card style={{ gap: space[2] }}>
          <T v="heading">{c.reason ?? 'No cup this week.'}</T>
          <T v="small" c="text2">Nothing lost, nobody pays. See you {DAYS[cfg.openDay - 1]}.</T>
        </Card>
      );
    }
    if (c.status === 'done') return champCard(c.champion_id, c.runner_up_id, c.final_score, c.week_no, c.id, 'Champion');
    return nextCard();
  };

  const today = c && c.status === 'running' ? c.games.filter((g) => (g.status === 'open' || g.status === 'waiting') &&
    [g.planned_at, g.deadline].some((x) => x && dayKey(new Date(x).getTime(), tz) === dayKey(now, tz))) : [];
  const preview = c && path?.entered && (c.status === 'running' || c.status === 'done') ? path.games.filter((g) => g.status !== 'bye') : [];

  return (
    <Screen>
      <AppBar />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: space[5] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), refresh()]); setRefreshing(false); }} tintColor={t.text2} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] }}>
          <View style={{ flex: 1, paddingHorizontal: space[1] }}>
            <T v="title">Cup</T>
            {c ? <T v="caption" c="text3">Week {c.week_no}</T> : null}
          </View>
          {isOn(league, 'schedule') ? <IconButton icon={CalendarDays} label="Plan" onPress={() => router.push('/schedule/plan')} /> : null}
          <IconButton icon={Info} label="Cup rules" onPress={() => router.push('/cup/rules')} />
          {admin ? <IconButton icon={Settings2} label="Manage cup" onPress={menu} /> : null}
        </View>

        {error && !v ? <Empty icon={Trophy} title="Couldn't load the cup" body="Pull to try again." /> : !v ? (
          <View style={{ gap: space[2] }}><Skeleton h={180} />{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={52} />)}</View>
        ) : (
          <>
            {hero()}

            {c && (c.status === 'upcoming' || c.status === 'signup' || c.status === 'cancelled') && last
              ? block('Last week', champCard(last.champion_id, last.runner_up_id, last.final_score, last.week_no, last.id, 'Champion')) : null}

            {preview.length ? block('Your path', <View style={{ gap: space[2] }}>{preview.map((g) => <GameCell key={g.id} c={c!} g={g} members={members} meId={me?.id} tz={tz} now={now} />)}</View>,
              { label: 'Full bracket', href: '/cup/bracket' }) : c && c.status === 'running' && path?.entered && path.alive && path.next ? ( // other hero cards carry their own bracket button
              <Button label="Full bracket" variant="secondary" onPress={() => router.push('/cup/bracket')} />
            ) : null}

            {today.length ? block('Today', (
              <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
                {today.map((g, i) => (
                  <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push(`/cup/game/${g.id}`)}
                    style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
                    <T v="label" style={{ width: 52 }}>{hm(g.planned_at ?? g.deadline, tz)}</T>
                    <T v="small" style={{ flex: 1 }} numberOfLines={1}>{g.a && g.b ? `${name(g.a)} vs ${name(g.b)}` : roundName(g.round, c!.rounds)}</T>
                    <T v="caption" c="text3">{g.planned_at ? 'Planned' : 'Deadline'}</T>
                  </Pressable>
                ))}
              </View>
            )) : null}

            {v.past.length ? block('Past champions', (
              <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
                {v.past.slice(0, 3).map((p, i) => {
                  const m = members.find((x) => x.id === p.champion_id);
                  return (
                    <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push(`/cup/bracket?id=${p.id}`)}
                      style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
                      {m ? <Avatar name={m.display_name} colour={m.colour} size={32} /> : null}
                      <T v="label" style={{ flex: 1 }} numberOfLines={1}>{name(p.champion_id)}</T>
                      <T v="caption" c="text3">Week {p.week_no}, {p.seeds.length} players</T>
                    </Pressable>
                  );
                })}
              </View>
            ), { label: 'All cups', href: '/cup/history' }) : c ? (
              <T v="small" c="text3" style={{ paddingHorizontal: space[1] }}>Your first cup starts {DAYS[(cfg?.openDay ?? 1) - 1]}. Everyone with at least 1 match can sign up.</T>
            ) : null}

            {me ? (
              <Card onPress={() => router.push(`/cup/cabinet?member=${me.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: shelf?.wins ? t.crown : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon as={shelf?.wins ? Crown : Trophy} size={20} color={shelf?.wins ? t.onCrown : t.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="heading">{shelf?.wins ? `You've won ${shelf.wins} ${shelf.wins === 1 ? 'cup' : 'cups'}` : 'Trophy cabinet'}</T>
                  <T v="caption" c="text3">{shelf ? `${shelf.finals} ${shelf.finals === 1 ? 'final' : 'finals'}, ${shelf.entries} entered` : ' '}</T>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
