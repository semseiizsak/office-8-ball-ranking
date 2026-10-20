// M14 Full time (players): the live match is now a saved match.
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Flag, PenLine, RotateCcw, Share2, Trophy, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMatch, type MatchDetail } from '@/lib/api';
import { bestRun, clockLabel, elapsed, getLive, scoreOf, topChatters, topReaction, type LiveView, type Side } from '@/lib/live';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, fmt, playerColours, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, IconButton, Pill, Skeleton, T } from '@/ui';
import { LiveTheme } from '@/ui/live';

export default function FullTimeScreen() {
  return <LiveTheme><FullTime /></LiveTheme>;
}

function FullTime() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { members, me, refresh } = useLeague();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [x, setX] = useState<LiveView | null>(null);
  const [m, setM] = useState<MatchDetail | null>(null);

  useEffect(() => {
    if (!session) return;
    getLive(session.user, id).then(async (v) => {
      setX(v);
      if (v?.match_id) setM(await getMatch(v.match_id, session.user.id));
      refresh();
    });
  }, [session, id, refresh]);

  const byId = new Map(members.map((p) => [p.id, p]));
  const nameOf = (ids: string[]) => ids.map((i) => (i === me?.id ? 'You' : byId.get(i)?.display_name ?? 'Someone')).join(' and ');

  if (!x || !m) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + space[6], paddingHorizontal: space[4], gap: space[3] }}>
        <StatusBar style="light" />
        <Skeleton h={28} w={180} /><Skeleton h={200} /><Skeleton h={120} />
      </View>
    );
  }

  const [sa, sb] = scoreOf(x);
  const w = m.winner;
  const delta = (s: Side) => m.match_players.find((r) => r.side === s)?.delta ?? 0;
  const after = (s: Side) => m.match_players.find((r) => r.side === s)?.rating_after;
  const pending = !!m.status;
  const run = bestRun(x);
  const loud = topChatters(x);
  const pub = x.visibility === 'league';
  const colourOf = (s: Side) => playerColours[byId.get((s === 'a' ? x.a : x.b)[0])?.colour ?? 'blue'];
  const rematch = () => router.replace({ pathname: '/live/setup', params: { a: x.a.join(','), b: x.b.join(',') } });

  const side = (s: Side) => {
    const ids = s === 'a' ? x.a : x.b;
    const ps = ids.map((i) => byId.get(i)).filter(Boolean) as Member[];
    const won = s === w;
    const d = delta(s);
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
        <View style={{ flexDirection: 'row', gap: space[1] }}>{ps.map((p) => <Avatar key={p.id} name={p.display_name} colour={p.colour} jersey={p.jersey} size={ps.length > 1 ? 44 : 64} />)}</View>
        <Text numberOfLines={2} adjustsFontSizeToFit style={{ fontFamily: font.display, fontSize: 26, lineHeight: 28, letterSpacing: -0.6, textTransform: 'uppercase', color: won ? t.text : t.text2, textAlign: 'center' }}>{nameOf(ids)}</Text>
        {won ? <Pill label={`Won ${signed(d)}`} tone="win" /> : <Pill label={signed(d)} tone="loss" />}
        {ps.length === 1 && after(s) != null && !pending ? <T v="caption" c="text3">{fmt(after(s)!)} now</T> : null}
      </View>
    );
  };

  const tile = (n: string, label: string) => (
    <View key={label} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 2 }}>
      <T v="number">{n}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <Pill label={`Full time, ${clockLabel(elapsed(x))}`} tone="win" icon={Flag} />
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: insets.bottom + space[6] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {side('a')}
          <Text style={{ fontFamily: font.heavy, fontSize: 56, color: t.text, fontVariant: ['tabular-nums'] }}>{sa}<Text style={{ color: t.text3 }}>:</Text>{sb}</Text>
          {side('b')}
        </View>
        <T c="text2" center>
          {x.retired ? `${nameOf(x.retired === 'a' ? x.a : x.b)} retired. ` : ''}
          {pending ? 'Waiting for the other side to confirm, then it counts.' : x.scorers === 'both' && [...x.a, ...x.b].every((i) => byId.get(i)?.user_id) ? 'Both phones agreed, counted.' : 'Saved and counted.'}
        </T>

        {x.points.length ? (
          <View style={{ gap: space[2], backgroundColor: t.surface, borderRadius: radius.md, padding: space[4] }}>
            <T v="heading">Momentum</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 72, gap: 2 }}>
              {x.points.map((pt, i) => (
                <View key={i} style={{ flex: 1, height: 72, justifyContent: pt.side === 'a' ? 'flex-start' : 'flex-end' }}>
                  <View style={{ height: 34, borderRadius: 2, backgroundColor: colourOf(pt.side) }} />
                </View>
              ))}
            </View>
            <T v="caption" c="text3">{run.side && run.n > 2 ? `${nameOf(run.side === 'a' ? x.a : x.b)} ran ${run.n} in a row at ${clockLabel(Math.max(0, new Date(run.at).getTime() - new Date(x.started_at ?? x.created_at).getTime() ))}` : 'Every point, in order'}</T>
          </View>
        ) : null}

        {pub ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {tile(String(x.peak), 'Peak viewers')}
            {tile(String(x.react_total), 'Reactions')}
            {tile(String(x.chat.length), 'Messages')}
            {tile(topReaction(x) ?? 'None', 'Top reaction')}
          </View>
        ) : null}
        {pub && loud.length ? (
          <T c="text2">Loudest in chat: {loud.map((l, i) => <T key={l.member_id} v="label" c={t.pct[byId.get(l.member_id)?.colour ?? 'ink']}>{i ? ', ' : ''}{nameOf([l.member_id])} {l.count}</T>)}</T>
        ) : null}

        <View style={{ gap: space[3] }}>
          {x.cup?.final && !pending ? <Button label="See the champion" icon={Trophy} variant="brand" onPress={() => router.replace(`/cup/champion?id=${x.cup!.cupId}`)} /> : null}
          <Button label="Rematch" icon={RotateCcw} onPress={rematch} />
          <Button label="Share" icon={Share2} variant="secondary" onPress={() => router.push(`/share/${m.id}`)} />
          <Button label="Fix the result" icon={PenLine} variant="ghost" size="md" onPress={() => router.push({ pathname: '/log', params: { edit: m.id } })} />
        </View>
      </ScrollView>
    </View>
  );
}
