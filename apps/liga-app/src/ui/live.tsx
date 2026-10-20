// Live match pieces: always black surface, live pill, M7.1 Live now block (Arena), M13.4 feed banner (History),
// floating reactions and chat lines without bubbles.
import { router, useFocusEffect } from 'expo-router';
import { Clock, Eye, X } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';

import { clockLabel, elapsed, formatLabel, liveNow, scoreOf, viewers, type LiveView } from '@/lib/live';
import { isOn } from '@/lib/modules';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, motion, radius, space, themes, ThemeContext, useTheme } from '@/theme';
import { Avatar, Button, Icon, IconButton, T } from '@/ui';

// Live surfaces are black in both themes, like a broadcast.
export function LiveTheme({ children }: { children: ReactNode }) {
  const ctx = useTheme();
  return <ThemeContext.Provider value={{ ...ctx, t: themes.dark }}>{children}</ThemeContext.Provider>;
}

// Solid red pill; only the white dot pulses (and not with reduced motion).
export function LivePill({ label = 'Live' }: { label?: string }) {
  const { t } = useTheme();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      const ease = Easing.bezier(...motion.easing);
      loop = Animated.loop(Animated.sequence([
        Animated.timing(o, { toValue: 0.25, duration: 700, easing: ease, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
      ]));
      loop.start();
    });
    return () => loop?.stop();
  }, [o]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: t.live, alignSelf: 'flex-start' }}>
      <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF', opacity: o }} />
      <T v="label" c="#FFFFFF" style={{ fontSize: 12 }}>{label}</T>
    </View>
  );
}

// Polls the league's live matches while the screen is focused (bot points arrive every few seconds).
export function useLiveList(every = 4000) {
  const { session } = useAuth();
  const { league } = useLeague();
  const [rows, setRows] = useState<LiveView[]>([]);
  const [now, setNow] = useState(0);
  const on = isOn(league, 'live');
  const load = useCallback(async () => {
    if (!league || !session || !on) return;
    setRows(await liveNow(session.user, league.id));
    setNow(Date.now());
  }, [league, session, on]);
  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, every);
    return () => clearInterval(id);
  }, [load, every]));
  return { rows: on ? rows : [], now };
}

const names = (ids: string[], byId: Map<string, Member>, meId?: string) => ids.map((id) => (id === meId ? 'You' : byId.get(id)?.display_name ?? 'Someone')).join(' and ');
const pair = (x: LiveView, byId: Map<string, Member>) => {
  const a = byId.get(x.a[0]), b = byId.get(x.b[0]);
  return (
    <View style={{ flexDirection: 'row' }}>
      {a ? <Avatar name={a.display_name} colour={a.colour} size={32} /> : null}
      {b ? <View style={{ marginLeft: -8 }}><Avatar name={b.display_name} colour={b.colour} size={32} /></View> : null}
    </View>
  );
};
export const openLive = (x: LiveView, meId?: string) => router.push(x.state === 'done' ? `/live/watch/${x.id}` : meId && [...x.a, ...x.b].includes(meId) ? `/live/${x.id}` : `/live/watch/${x.id}`);
export const startsIn = (x: LiveView, now: number) => Math.max(0, Math.round(((x.starts_at ? new Date(x.starts_at).getTime() : now) - now) / 60000));

/* ---------- M7.1 Live now (Arena) ---------- */
export function LiveNow() {
  const { rows, now } = useLiveList();
  const { members, me } = useLeague();
  const byId = new Map(members.map((m) => [m.id, m]));
  const live = rows.filter((x) => x.state === 'live' || x.state === 'paused');
  const soon = rows.filter((x) => x.state === 'ready');
  if (!live.length && !soon.length) return null;
  return (
    <LiveTheme>
      <View style={{ backgroundColor: themes.dark.bg, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
        <T v="heading">Live now</T>
        {live.map((x) => {
          const [sa, sb] = scoreOf(x);
          return (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Watch ${names(x.a, byId)} vs ${names(x.b, byId)}`} onPress={() => openLive(x, me?.id)}
              style={({ pressed }) => ({ gap: space[3], padding: space[3], borderRadius: radius.sm, backgroundColor: pressed ? themes.dark.surface3 : themes.dark.surface })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                {x.state === 'paused' ? <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: themes.dark.warning, justifyContent: 'center' }}><T v="label" c="#0A0A0A" style={{ fontSize: 12 }}>Paused</T></View> : <LivePill />}
                <T v="caption" c="text2" style={{ flex: 1 }} numberOfLines={1}>{clockLabel(elapsed(x, now))}, {viewers(x, now)} watching</T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                {pair(x, byId)}
                <View style={{ flex: 1 }}>
                  <T v="heading" numberOfLines={1}>{names(x.a, byId, me?.id)} vs {names(x.b, byId, me?.id)}</T>
                  <T v="caption" c="text3">{x.cup ? 'Weekly cup' : formatLabel(x.format)}</T>
                </View>
                <T v="number" style={{ fontFamily: font.heavy, fontSize: 24 }}>{sa} : {sb}</T>
              </View>
              <Button label="Watch" size="sm" variant="danger" style={{ alignSelf: 'flex-start' }} onPress={() => openLive(x, me?.id)} />
            </Pressable>
          );
        })}
        {soon.map((x) => (
          <Pressable key={x.id} accessibilityRole="button" onPress={() => openLive(x, me?.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 }}>
            {pair(x, byId)}
            <View style={{ flex: 1 }}>
              <T v="label" numberOfLines={1}>{names(x.a, byId, me?.id)} vs {names(x.b, byId, me?.id)}</T>
              <T v="caption" c="text3">{x.starts_at ? `Starts in ${startsIn(x, now) || 1} min` : 'Getting ready'}</T>
            </View>
            <Icon as={Clock} size={18} color={themes.dark.text2} />
          </Pressable>
        ))}
      </View>
    </LiveTheme>
  );
}

/* ---------- M13.4 Live banner (History) ---------- */
export function LiveBanner() {
  const { rows, now } = useLiveList();
  const { members, me } = useLeague();
  const [hidden, setHidden] = useState<string[]>([]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const live = rows.filter((x) => (x.state === 'live' || x.state === 'paused') && !hidden.includes(x.id));
  if (!live.length) return null;
  const x = live[0];
  const [sa, sb] = scoreOf(x);
  const label = live.length > 1 ? `${live.length} matches live` : `${names(x.a, byId, me?.id)} vs ${names(x.b, byId, me?.id)}, ${sa} : ${sb}`;
  return (
    <LiveTheme>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, watch`} onPress={() => (live.length > 1 ? router.push('/arena') : openLive(x, me?.id))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: themes.dark.bg, borderRadius: radius.md, paddingLeft: space[3], minHeight: 56 }}>
        {pair(x, byId)}
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label" numberOfLines={1}>{label}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon as={Eye} size={13} color={themes.dark.text3} />
            <T v="caption" c="text3">{viewers(x, now)} watching</T>
          </View>
        </View>
        <LivePill />
        <IconButton icon={X} tone="ghost" label="Hide this match" onPress={() => setHidden((h) => [...h, ...live.map((y) => y.id)])} />
      </Pressable>
    </LiveTheme>
  );
}

/* ---------- floating reactions ---------- */
type Fly = { key: string; emoji: string; x: number; v: Animated.Value };
// Emojis float up from the bottom edge of the area they sit in; they never sit over the score.
export function Floaters({ items }: { items: Fly[] }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: 0, width: 120, height: 220 }}>
      {items.map((f) => (
        <Animated.Text key={f.key} style={{ position: 'absolute', bottom: 0, right: f.x, fontSize: 28,
          opacity: f.v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateY: f.v.interpolate({ inputRange: [0, 1], outputRange: [0, -200] }) }] }}>{f.emoji}</Animated.Text>
      ))}
    </View>
  );
}
export function useFloaters() {
  const [items, setItems] = useState<Fly[]>([]);
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce); }, []);
  const fly = useCallback((emoji: string, key: string) => {
    if (reduce) return;
    const v = new Animated.Value(0);
    setItems((xs) => [...xs.slice(-11), { key, emoji, x: 8 + Math.random() * 70, v }]);
    Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.bezier(...motion.easing), useNativeDriver: true }).start(() => setItems((xs) => xs.filter((f) => f.key !== key)));
  }, [reduce]);
  return { items, fly };
}

/* ---------- chat lines: player coloured name, white text ---------- */
export function ChatLines({ lines, byId, meId }: { lines: { id: string; member_id: string; body: string }[]; byId: Map<string, Member>; meId?: string }) {
  const { t } = useTheme();
  if (!lines.length) return <T v="small" c="text3">No messages yet. Say something.</T>;
  return (
    <View style={{ gap: 6 }}>
      {lines.slice(-10).map((l) => {
        const m = byId.get(l.member_id);
        return (
          <T key={l.id} v="body">
            <T v="body" c={m ? t.pct[m.colour] : t.text2} style={{ fontFamily: font.bold }}>{l.member_id === meId ? 'You' : m?.display_name ?? 'Someone'}  </T>
            {l.body}
          </T>
        );
      })}
    </View>
  );
}
