// X1.14 Screensaver: ladder, last results, the cup and the join QR, 20 s each with a cross fade. A tap goes home.
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';

import { hm } from '@/lib/cup';
import { joinLink, kioskHome, namesOf, thisDevice, type KioskHome, type KioskMatch, type KioskRow } from '@/lib/kiosk';
import { clock } from '@/lib/time';
import { fmt, motion, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Icon, Pill, Screen, T } from '@/ui';
import { bigText, KioskQR, useKioskSize } from '@/ui/kiosk-kit';

type Page = 'ladder' | 'recent' | 'cup' | 'join';
const PAGE_MS = 20_000, SHIFT_MS = 120_000, SHIFTS = [0, 8, -8];

export default function Saver() {
  const { t } = useTheme();
  const { tablet, wide, width, height, pad } = useKioskSize();
  const [home, setHome] = useState<KioskHome | null>(null);
  const [i, setI] = useState(0);
  const [shift, setShift] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));
  const reduce = useRef(false);
  const leave = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/kiosk')), []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduce.current = r; });
    thisDevice().then(async (d) => { if (d) setHome(await kioskHome(d.kiosk)); else leave(); });
  }, [leave]);

  const pages: Page[] = home ? ['ladder', ...(home.recent.length ? ['recent' as const] : []), ...(home.cup && home.cup.status !== 'upcoming' ? ['cup' as const] : []), ...(home.code ? ['join' as const] : [])] : [];
  const n = pages.length;

  useEffect(() => {
    if (n < 2) return;
    const ease = Easing.bezier(...motion.easing);
    const id = setInterval(() => {
      if (reduce.current) { setI((x) => (x + 1) % n); return; }
      Animated.timing(fade, { toValue: 0, duration: motion.slow, easing: ease, useNativeDriver: true }).start(() => {
        setI((x) => (x + 1) % n);
        Animated.timing(fade, { toValue: 1, duration: motion.slow, easing: ease, useNativeDriver: true }).start();
      });
    }, PAGE_MS);
    return () => clearInterval(id);
  }, [n, fade]);
  // Against burn in the content moves 8 px every two minutes.
  useEffect(() => { const id = setInterval(() => setShift((s) => (s + 1) % SHIFTS.length), SHIFT_MS); return () => clearInterval(id); }, []);

  if (!home) return <Screen edges={['top', 'bottom']}>{null}</Screen>;
  const page = pages[i % Math.max(1, n)];
  const av = tablet ? 56 : 40;

  const ladderRow = (r: KioskRow) => (
    <View key={r.m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: tablet ? space[3] : space[2] }}>
      <T v={tablet ? 'title' : 'number'} c="text2" style={{ width: tablet ? 48 : 28 }}>{r.rank}</T>
      <Avatar name={r.m.display_name} colour={r.m.colour} jersey={r.m.jersey} size={av} />
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={1} style={tablet ? bigText(28) : undefined}>{r.m.display_name}{r.rank === 1 ? ' 👑' : ''}</T>
        <T v={tablet ? 'body' : 'caption'} c="text3">{r.form}</T>
      </View>
      <T v={tablet ? 'bigNumber' : 'number'}>{fmt(r.m.rating)}</T>
    </View>
  );
  const matchRow = (m: KioskMatch) => (
    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[2] }}>
      <T v={tablet ? 'heading' : 'label'} c="text3" style={{ width: tablet ? 64 : 48 }}>{clock(m.at)}</T>
      <Avatar name={m.winners[0]?.display_name ?? '?'} colour={m.winners[0]?.colour ?? 'blue'} size={tablet ? 44 : 32} />
      <T v="heading" style={[{ flex: 1 }, tablet ? bigText(22) : null]} numberOfLines={1}>{namesOf(m.winners)} beat {namesOf(m.losers)}</T>
      {m.upset ? <Pill label="Upset" tone="brand" /> : null}
      {!m.pending && m.delta ? <T v={tablet ? 'number' : 'label'} c="win">{signed(m.delta)}</T> : null}
    </View>
  );
  const cupPage = () => {
    const c = home.cup!;
    const name = (id: string | null) => home.members.find((m) => m.id === id)?.display_name ?? 'Someone';
    return (
      <View style={{ gap: space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], backgroundColor: t.brand, borderRadius: radius.lg, padding: space[6] }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.onBrand, alignItems: 'center', justifyContent: 'center' }}><Icon as={Trophy} size={34} color={t.brand} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <T v={tablet ? 'display' : 'title'} c="onBrand">{c.status === 'signup' ? 'Weekly cup' : c.status === 'done' ? `${name(c.champion)} won the cup` : 'The cup is on'}</T>
            <T v="heading" c="onBrand">{c.status === 'signup' ? `Sign up on this tablet before ${hm(c.draw_at, home.league.tz)}` : c.status === 'running' ? `${c.open.length} ${c.open.length === 1 ? 'game' : 'games'} to play` : 'See you next week'}</T>
          </View>
        </View>
        {c.status === 'signup' ? <T v={tablet ? 'title' : 'section'}>{c.entrants.length} of {c.max} signed in</T> : null}
        {c.status === 'running' ? c.open.map((g, k) => <T key={k} v="heading" style={tablet ? bigText(22) : undefined}>{name(g.a)} vs {name(g.b)}</T>) : null}
      </View>
    );
  };
  const joinPage = () => (
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: space[8], justifyContent: 'center' }}>
      <KioskQR value={joinLink(home.code!)} size={Math.min(tablet ? 480 : 240, Math.min(width, height) - 260)} />
      <View style={{ gap: space[3], maxWidth: 480 }}>
        <T v={tablet ? 'display' : 'title'}>Join {home.league.name}</T>
        <T v="heading" c="text2" style={tablet ? bigText(22) : undefined}>Scan with your camera, pick your number and play.</T>
      </View>
    </View>
  );
  const title = page === 'ladder' ? 'Leaderboard' : page === 'recent' ? 'Last 10 matches' : null;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Tap anywhere to start a game" onPress={leave} style={{ flex: 1 }}>
      <Screen edges={['top', 'bottom']}>
        <Animated.View style={{ flex: 1, padding: pad, gap: space[4], opacity: fade, transform: [{ translateX: SHIFTS[shift] }, { translateY: SHIFTS[(shift + 1) % SHIFTS.length] }] }}>
          {title ? <T v={tablet ? 'display' : 'title'}>{title}</T> : null}
          <View style={{ flex: 1, justifyContent: page === 'join' || page === 'cup' ? 'center' : 'flex-start', overflow: 'hidden' }}>
            {page === 'ladder' ? home.top.map(ladderRow) : page === 'recent' ? home.recent.map(matchRow) : page === 'cup' ? cupPage() : page === 'join' ? joinPage() : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="heading" c="text2" style={tablet ? bigText(22) : undefined}>Tap anywhere to start a game</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {pages.map((p, k) => <View key={p} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k === i % n ? t.text : t.lineStrong }} />)}
            </View>
          </View>
        </Animated.View>
      </Screen>
    </Pressable>
  );
}
