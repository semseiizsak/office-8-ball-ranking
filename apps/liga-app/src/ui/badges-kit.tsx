// Shared pieces for badges, levels and the wall of shame: faceted medal (DS .ac-m), tier pill (.ac-tier),
// level hexagon (gm-level), the profile progress cards (R2.1), the Ranks wall of shame card (R1.5) and the unlock trigger (G4.4).
import { router, useFocusEffect, type Href } from 'expo-router';
import {
  Award, CalendarCheck, ChevronRight, Coffee, Crown, Flag, Flame, Ghost, Handshake, Hash, Heart, Medal as MedalIcon, Moon, Mountain, Repeat,
  RotateCcw, Shield, Shuffle, Smile, Sparkles, Sun, Sunrise, Swords, Target, Timer, TrendingUp, Trophy, Users, Zap, type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Stop, Text as SvgText } from 'react-native-svg';

import { badgeBook, shameWall, showcase, takeCelebrations, type Book } from '@/lib/badges';
import { isOn } from '@/lib/modules';
import type { Tier } from '@/lib/progress-engine';
import type { Member } from '@/lib/types';
import { levelName, progressFor, streakLine, type ProgressView } from '@/lib/xp';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Icon, T } from '@/ui';

export const ICONS: Record<string, LucideIcon> = {
  swords: Swords, trophy: Trophy, hash: Hash, zap: Zap, crown: Crown, sparkles: Sparkles, shield: Shield, target: Target, medal: MedalIcon,
  sun: Sun, timer: Timer, flame: Flame, rotate: RotateCcw, calendar: CalendarCheck, mountain: Mountain, trending: TrendingUp, users: Users,
  repeat: Repeat, handshake: Handshake, heart: Heart, shuffle: Shuffle, moon: Moon, sunrise: Sunrise, coffee: Coffee, flag: Flag, award: Award,
  smile: Smile, ghost: Ghost,
};

// DS metal primitives (liga-ds tokens.css p-bronze, p-silver, p-gold, p-white, p-black, p-grey-200, p-grey-300).
const P = { bronze: '#A8622C', silver: '#C9CCD1', gold: '#F2B705', white: '#FFFFFF', black: '#0A0A0A', ink: '#111111', g200: '#EAEAEA', g300: '#B5B5B5' };
export const METAL: Record<Tier, { base: string; ink: string }> = {
  bronze: { base: P.bronze, ink: P.white }, silver: { base: P.silver, ink: P.black }, gold: { base: P.gold, ink: P.black },
  diamond: { base: P.white, ink: P.ink }, legend: { base: P.black, ink: P.white },
};

const wedge = (c: number, r: number, a0: number, a1: number) => {
  const pt = (a: number) => `${c + r * Math.sin((a * Math.PI) / 180)} ${c - r * Math.cos((a * Math.PI) / 180)}`;
  return `M ${c} ${c} L ${pt(a0)} A ${r} ${r} 0 0 1 ${pt(a1)} Z`;
};

// Faceted metal disc, eight facets from 22.5°, inner face with a top light. Locked is grey with a dashed face.
export function Medal({ tier, icon, size = 48, locked }: { tier: Tier | null; icon: string; size?: number; locked?: boolean }) {
  const { t } = useTheme();
  const gid = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const c = size / 2, inner = c - size * 0.13;
  const off = locked || !tier;
  const m = off ? { base: t.surface3, ink: t.text3 } : METAL[tier];
  const facets = off ? [] : tier === 'diamond'
    ? [P.white, P.g200, P.white, P.g300, P.g200, P.g300, P.white, P.g200].map((fill) => ({ fill, o: 1 }))
    : (tier === 'legend' ? [0.2, 0, 0.08, 0, 0, 0, 0.08, 0.2] : [0.42, 0, 0.16, 0, 0, 0, 0.16, 0.42]).map((o) => ({ fill: P.white, o }));
  const I = ICONS[icon] ?? Award;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gid} x1="0.4" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.4} />
            <Stop offset="0.58" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Circle cx={c} cy={c} r={c} fill={m.base} />
        {facets.map((f, i) => (f.o ? <Path key={i} d={wedge(c, c, 22.5 + i * 45, 67.5 + i * 45)} fill={f.fill} fillOpacity={f.o} /> : null))}
        {tier === 'legend' && !off ? <Circle cx={c} cy={c} r={c - 1} stroke={P.white} strokeWidth={2} fill="none" /> : null}
        <Circle cx={c} cy={c} r={inner} fill={m.base} />
        {off ? <Circle cx={c} cy={c} r={inner} fill="none" stroke={t.lineStrong} strokeWidth={1.5} strokeDasharray="3 3" />
          : <Circle cx={c} cy={c} r={inner} fill={tier === 'legend' || tier === 'diamond' ? m.base : `url(#${gid})`}
            stroke={tier === 'diamond' ? P.g200 : '#FFFFFF'} strokeOpacity={tier === 'diamond' ? 1 : tier === 'legend' ? 0.3 : 0.45} strokeWidth={1} />}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <I size={Math.round(size * 0.4)} color={m.ink} strokeWidth={2.4} />
      </View>
    </View>
  );
}

export function TierPill({ tier, label }: { tier: Tier; label?: string }) {
  const m = METAL[tier];
  const ring = tier === 'diamond' ? P.g300 : tier === 'legend' ? '#FFFFFF' : m.base;
  return (
    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: m.base, borderWidth: 1, borderColor: ring, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: font.bold, fontSize: 12, color: m.ink }}>{label ?? tier.charAt(0).toUpperCase() + tier.slice(1)}</Text>
    </View>
  );
}

export function Bar({ value, color, track, h = 6 }: { value: number; color?: string; track?: string; h?: number }) {
  const { t } = useTheme();
  return (
    <View style={{ height: h, borderRadius: h, backgroundColor: track ?? t.surface3, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', borderRadius: h, backgroundColor: color ?? t.text }} />
    </View>
  );
}

// gm-level hexagon. Milestone levels (every 10th) are crown gold with black numbers.
export function LevelHex({ level, size = 52, tone }: { level: number; size?: number; tone?: 'brand' | 'crown' | 'off' | 'light' }) {
  const { t } = useTheme();
  const k = tone ?? (level % 10 === 0 ? 'crown' : 'brand');
  const bg = k === 'crown' ? t.crown : k === 'off' ? t.surface3 : k === 'light' ? '#FFFFFF' : t.brand;
  const fg = k === 'crown' ? t.onCrown : k === 'off' ? t.text3 : k === 'light' ? t.brand : t.onBrand;
  const w = size, h = size * 1.1;
  const pts = [[w / 2, 0], [w, h * 0.25], [w, h * 0.75], [w / 2, h], [0, h * 0.75], [0, h * 0.25]].map((p) => p.join(',')).join(' ');
  return (
    <Svg width={w} height={h} accessibilityLabel={`Level ${level}`}>
      <Polygon points={pts} fill={bg} />
      <SvgText x={w / 2} y={h / 2 + size * 0.14} fontSize={size * 0.4} fontFamily={font.heavy} fill={fg} textAnchor="middle">{String(level)}</SvgText>
    </Svg>
  );
}

/* ---------- profile Overview cards (R2.1 items 6, G5 level and streak) ---------- */
export function ProfileProgress({ member, isMe }: { member: Member; isMe: boolean }) {
  const { t } = useTheme();
  const { league } = useLeague();
  const [p, setP] = useState<ProgressView | null>(null);
  const [book, setBook] = useState<Book>(null);
  const xpOn = isOn(league, 'xp'), badgesOn = isOn(league, 'badges');

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => {
      const [a, b] = await Promise.all([xpOn ? progressFor(league.id, member.id) : null, badgesOn ? badgeBook(league.id, member.id) : null]);
      setP(a); setBook(b);
    })();
  }, [league, member.id, member.rating, xpOn, badgesOn])); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = showcase(book);
  const go = (path: string) => router.push(`${path}?member=${member.id}` as Href);
  return (
    <>
      {p ? (
        <Card onPress={() => go('/badges/progress')} style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <LevelHex level={p.level.level} size={48} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="label">Level {p.level.level}, {levelName(p.level.level)}</T>
                {isMe ? <T v="caption" c="text3">{p.level.need ? `${fmt(p.level.into)} of ${fmt(p.level.need)} XP` : 'Max level'}</T> : null}
              </View>
              {isMe ? <Bar value={p.level.need ? p.level.into / p.level.need : 1} color={t.brand} /> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 48, alignItems: 'center' }}>
              <Icon as={Flame} size={24} color={p.streak.current ? t.warning : t.text3} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="label">{p.streak.current} {p.streak.current === 1 ? 'week' : 'weeks'} in a row</T>
              <T v="caption" c="text2">{isMe ? streakLine(p) : `Best ${p.streak.best} ${p.streak.best === 1 ? 'week' : 'weeks'}`}</T>
            </View>
            <Icon as={ChevronRight} size={18} color={t.text3} />
          </View>
        </Card>
      ) : null}
      {book ? (
        <Card onPress={() => go('/badges')} style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T v="label" style={{ flex: 1 }}>Badges, {book.earnedCount} earned</T>
            <T v="caption" c="text3">See all</T>
            <Icon as={ChevronRight} size={18} color={t.text3} />
          </View>
          {shown.length ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {shown.map((v) => (
                <View key={v.def.id} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <Medal tier={v.top} icon={v.def.icon} size={52} />
                  <T v="caption" c="text2" center numberOfLines={1}>{v.def.name}</T>
                </View>
              ))}
            </View>
          ) : <T v="small" c="text2">{isMe ? 'Your first win unlocks First Blood.' : 'No badges yet.'}</T>}
        </Card>
      ) : null}
    </>
  );
}

/* ---------- Ranks: wall of shame card (R1.5) ---------- */
export const sinceLabel = (iso: string) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return 'since today';
  if (days < 7) return `since ${new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' })}`;
  return `since ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
};

export function ClownAvatar({ m, size = 44 }: { m: Member; size?: number }) {
  const { t } = useTheme();
  return (
    <View>
      <Avatar name={m.display_name} colour={m.colour} size={size} />
      <View style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13 }}>🤡</Text>
      </View>
    </View>
  );
}

export function ShameCard() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const { session } = useAuth();
  const [w, setW] = useState<Awaited<ReturnType<typeof shameWall>>>(null);
  const on = isOn(league, 'shame');

  useFocusEffect(useCallback(() => {
    if (!league || !on) return;
    (async () => setW(await shameWall(league.id, session?.user.id)))();
  }, [league, on, members, session?.user.id])); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on || !w || !w.rows.length) return null;
  const byId = new Map(members.map((m) => [m.id, m]));
  const mine = w.rows.find((r) => r.id === me?.id);
  const rows = [...(mine ? [mine] : []), ...w.rows.filter((r) => r !== mine)].slice(0, 3);
  return (
    <Card style={{ gap: space[2] }}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/badges/shame')} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <T v="heading" style={{ flex: 1 }}>Wall of shame, {w.rows.length}</T>
        <Icon as={ChevronRight} size={18} color={t.text3} />
      </Pressable>
      {rows.map((r) => {
        const m = byId.get(r.id);
        if (!m) return null;
        const own = r.id === me?.id;
        return (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(`/player/${r.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[2], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : own ? t.surface2 : 'transparent' })}>
            {own ? <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: t.brand }} /> : null}
            <ClownAvatar m={m} size={40} />
            <View style={{ flex: 1 }}>
              <T v="label" numberOfLines={1}>{own ? 'You' : m.display_name}</T>
              <T v="caption" c="text3">{own ? 'You are on the wall. Next win clears it.' : `${r.losses} losses in a row, ${sinceLabel(r.since)}`}</T>
            </View>
            {own ? <Button label="Log match" size="sm" variant="secondary" onPress={() => router.push('/log')} /> : null}
          </Pressable>
        );
      })}
      <T v="caption" c="text2">One win and the clown is gone.</T>
    </Card>
  );
}

/* ---------- unlock trigger on the match summary (M2.2, G4.4) ---------- */
export function UnlockPeek() {
  const { league } = useLeague();
  const { session } = useAuth();
  useEffect(() => {
    if (!league || !session || (!isOn(league, 'badges') && !isOn(league, 'xp'))) return;
    let live = true;
    const id = setTimeout(async () => {
      const list = await takeCelebrations(session.user, league.id, true);
      if (live && list.length) router.push('/badges/unlock');
    }, 700);
    return () => { live = false; clearTimeout(id); };
  }, [league, session]);
  return null;
}
