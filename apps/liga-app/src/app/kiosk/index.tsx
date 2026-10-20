// X1.4 Kiosk home (portrait, landscape #sk-land, phone for testing), X1.18 kiosk states. Long press the top left corner 3 s for X1.15.
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Play, QrCode, Tablet, Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { hms, joinLink, kioskHome, namesOf as names, setActive, thisDevice, type Kiosk, type KioskHome, type KioskMatch, type KioskRow } from '@/lib/kiosk';
import { hm } from '@/lib/cup';
import { sportOf } from '@/lib/sports';
import { clock } from '@/lib/time';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Icon, Pill, Screen, Skeleton, T } from '@/ui';
import { bigText, KioskQR, useKioskSize } from '@/ui/kiosk-kit';

const dateLine = (at: number) => {
  const d = new Date(at);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
};

export default function KioskHomeScreen() {
  const { t } = useTheme();
  const { tablet, wide, pad, gap } = useKioskSize();
  const [dev, setDev] = useState<{ kiosk: Kiosk; active: boolean } | null | undefined>(undefined);
  const [home, setHome] = useState<KioskHome | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const x = await thisDevice();
    setDev(x);
    if (x?.active) setHome(await kioskHome(x.kiosk));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const a = setInterval(() => setNow(Date.now()), 1000);
    const b = setInterval(load, 60_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  if (dev === undefined) return <Screen edges={['top', 'bottom']}>{null}</Screen>;
  if (!dev || !dev.active) return (
    <Screen edges={['top', 'bottom']} style={{ justifyContent: 'center' }}>
      <Empty icon={Tablet} title={dev ? `${dev.kiosk.name} is paused` : 'This device is not a kiosk'}
        body={dev ? 'Start the kiosk again, or go back to Liga.' : 'An admin can turn it into one in League settings.'}
        action={<View style={{ gap: space[3] }}>
          {dev ? <Button label="Start the kiosk" onPress={async () => { await setActive(true); load(); }} /> : null}
          <Button label="Back to Liga" variant="secondary" onPress={() => router.dismissTo('/')} />
        </View>} />
    </Screen>
  );

  const canPlay = !!home && !home.problem;
  const avatar = tablet ? 52 : 40;

  const header = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: pad, paddingVertical: space[3] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="League" accessibilityHint="Hold for three seconds to open the kiosk menu" delayLongPress={3000}
        onLongPress={() => router.push('/kiosk/admin')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ width: tablet ? 64 : 44, height: tablet ? 64 : 44, borderRadius: radius.md, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={sportOf(home?.league.sport).icon} size={tablet ? 30 : 22} color={t.onBrand} />
        </View>
        <View style={{ flex: 1 }}>
          <T v={tablet ? 'title' : 'section'} numberOfLines={1}>{home?.league.name ?? ' '}</T>
          <T v={tablet ? 'body' : 'small'} c="text2" numberOfLines={1}>{home ? `${home.league.team}, week ${home.week}` : ' '}</T>
        </View>
      </Pressable>
      <View style={{ alignItems: 'flex-end' }}>
        <T v={tablet ? 'bigNumber' : 'number'}>{clock(new Date(now).toISOString())}</T>
        <T v={tablet ? 'body' : 'caption'} c="text2">{dateLine(now)}</T>
      </View>
    </View>
  );

  const problem = () => {
    if (!home?.problem) return null;
    const text = home.problem === 'module' ? `Kiosk mode is off for ${home.league.name}. Ask an admin to turn it on.`
      : home.problem === 'archived' ? `${home.league.name} is archived. The ladder stays readable.`
      : 'The admin who set up this kiosk is no longer an admin here. Ask an admin to set it up again.';
    return (
      <View style={{ backgroundColor: t.warning, borderRadius: radius.md, padding: space[4] }}>
        <T v="heading" c="#0A0A0A">{text}</T>
      </View>
    );
  };

  const start = () => (
    <View style={{ gap: space[3] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Start a game" disabled={!canPlay} onPress={() => router.push({ pathname: '/kiosk/play', params: { mode: 'live' } })}
        style={({ pressed }) => ({ minHeight: tablet ? 160 : 112, borderRadius: radius.lg, backgroundColor: !canPlay ? t.surface2 : pressed ? t.brandPress : t.brand,
          flexDirection: 'row', alignItems: 'center', gap: tablet ? 28 : space[4], paddingHorizontal: tablet ? 36 : space[5], paddingVertical: space[4], transform: [{ scale: pressed ? 0.99 : 1 }] })}>
        <View style={{ width: tablet ? 100 : 64, height: tablet ? 100 : 64, borderRadius: 50, backgroundColor: canPlay ? t.onBrand : t.surface3, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={Play} size={tablet ? 44 : 28} color={canPlay ? t.brand : t.text3} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <T v={tablet ? 'display' : 'title'} c={canPlay ? 'onBrand' : 'text3'}>Start a game</T>
          <T v={tablet ? 'heading' : 'body'} c={canPlay ? 'onBrand' : 'text3'}>Pick players, play, tap who won</T>
        </View>
      </Pressable>
      <Button label="Already played? Log it" variant="secondary" size={tablet ? 'lg' : 'md'} disabled={!canPlay}
        onPress={() => router.push({ pathname: '/kiosk/play', params: { mode: 'log' } })} />
    </View>
  );

  const live = () => home?.live.map((x) => (
    <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: t.surface, borderRadius: radius.md, padding: space[4] }}>
      <Pill label="Live" tone="live" />
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={1}>{names(x.a)} vs {names(x.b)}</T>
        <T v="caption" c="text2">{x.watching ? `${x.watching} watching` : 'Playing now'}</T>
      </View>
      <T v="number">{hms(x.ms + (now - x.at))}</T>
    </View>
  ));

  const cupBand = () => {
    const c = home?.cup;
    if (!c || c.status === 'upcoming') return null;
    const line = c.status === 'signup' ? [`Weekly cup, sign up here`, `Closes at ${hm(c.draw_at, home!.league.tz)}, ${c.entrants.length} of ${c.max} in`]
      : c.status === 'running' ? ['The cup is on', `${c.open.length} ${c.open.length === 1 ? 'game' : 'games'} to play`]
      : ['Cup champion', home!.members.find((m) => m.id === c.champion)?.display_name ?? 'Decided'];
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={line[0]} onPress={() => router.push('/kiosk/cup')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 72, borderRadius: radius.md, padding: space[4], backgroundColor: pressed ? t.surface3 : t.surface })}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.crown, alignItems: 'center', justifyContent: 'center' }}><Icon as={Trophy} size={22} color={t.onCrown} /></View>
        <View style={{ flex: 1 }}>
          <T v="heading">{line[0]}</T>
          <T v="small" c="text2">{line[1]}</T>
        </View>
        <Icon as={ChevronRight} size={22} color={t.text3} />
      </Pressable>
    );
  };

  const ladderRow = (r: KioskRow) => (
    <View key={r.m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: tablet ? 72 : 56, paddingHorizontal: space[4], borderTopWidth: r.rank === 1 ? 0 : 1, borderTopColor: t.line }}>
      <T v="number" style={{ width: tablet ? 32 : 24 }} c="text2">{r.rank}</T>
      <Avatar name={r.m.display_name} colour={r.m.colour} jersey={r.m.jersey} size={avatar} />
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={1} style={tablet ? bigText(22) : undefined}>{r.m.display_name}{r.rank === 1 ? ' 👑' : ''}</T>
        <T v="caption" c="text3" numberOfLines={1}>{r.form}</T>
      </View>
      {r.week ? <T v="label" c={r.week > 0 ? 'win' : 'text2'}>{signed(r.week)}</T> : null}
      <T v="number" style={{ minWidth: 64, textAlign: 'right' }}>{fmt(r.m.rating)}</T>
    </View>
  );
  const ladder = () => (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
        <T v="section">Leaderboard</T>
        <T v="small" c="text3">This week</T>
      </View>
      <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        {home ? home.top.length ? home.top.map(ladderRow) : <View style={{ padding: space[5] }}><T v="body" c="text2">No players yet.</T></View>
          : [0, 1, 2, 3].map((i) => <View key={i} style={{ padding: space[2] }}><Skeleton h={48} /></View>)}
      </View>
    </View>
  );

  const matchRow = (m: KioskMatch, i: number) => (
    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingHorizontal: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
      <Avatar name={m.winners[0]?.display_name ?? '?'} colour={m.winners[0]?.colour ?? 'blue'} size={40} />
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={1}>{names(m.winners)} beat {names(m.losers)}</T>
        <T v="caption" c="text3">{clock(m.at)}</T>
      </View>
      {m.pending ? <Pill label="Waiting" /> : m.upset ? <Pill label="Upset" tone="brand" /> : null}
      {!m.pending && m.delta ? <T v="label" c="win">{signed(m.delta)}</T> : null}
    </View>
  );
  const today = () => {
    if (!home) return null;
    const list = home.today.slice(0, wide ? 6 : 2);
    return (
      <View style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
          <T v="section">Matches of the day</T>
          <T v="small" c="text3">{home.today.length} played</T>
        </View>
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
          {list.length ? list.map(matchRow) : <View style={{ padding: space[5] }}><T v="body" c="text2">No matches yet. Be the first, tap Start a game.</T></View>}
        </View>
      </View>
    );
  };

  const join = () => home?.code ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Join on your phone" onPress={() => router.push('/kiosk/join')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[4], borderRadius: radius.md, padding: space[4], backgroundColor: pressed ? t.surface3 : t.surface })}>
      {tablet ? <KioskQR value={joinLink(home.code)} size={88} /> : <Icon as={QrCode} size={28} />}
      <View style={{ flex: 1 }}>
        <T v="heading">Join on your phone</T>
        <T v="small" c="text2">Tap for the code to scan</T>
      </View>
      <Icon as={ChevronRight} size={22} color={t.text3} />
    </Pressable>
  ) : null;

  return (
    <Screen edges={['top', 'bottom']}>
      {header()}
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row', gap, paddingHorizontal: pad, paddingBottom: pad }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap }}>{problem()}{start()}{live()}{cupBand()}{today()}{join()}</ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap }}>{ladder()}</ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap, paddingHorizontal: pad, paddingBottom: pad }}>{problem()}{start()}{live()}{cupBand()}{ladder()}{today()}{join()}</ScrollView>
      )}
    </Screen>
  );
}
