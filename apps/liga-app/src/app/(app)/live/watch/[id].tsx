// M13 Live (spectator), M13.1 Live chat, M14.1 Full time for spectators, G1.6 Live cup match header
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Eye, Flag, Lock, Pause, SendHorizontal, Timer, Trophy, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMatch, type MatchDetail } from '@/lib/api';
import { roundName } from '@/lib/cup';
import { avg, eloPreview } from '@/lib/elo';
import {
  clockLabel, elapsed, formatLabel, getLive, REACT_GAP, REACTS, reactLive, sayLive, scoreOf, SPORT_EMOJI, topChatters, upNext, viewers, watchLive, type LiveView, type Side,
} from '@/lib/live';
import { isOn } from '@/lib/modules';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Icon, IconButton, Pill, Skeleton, T } from '@/ui';
import { tapTime } from '@/ui/chat-kit';
import { ChatLines, Floaters, LivePill, LiveTheme, startsIn, useFloaters } from '@/ui/live';
import { CallCard } from '@/ui/predict';

export default function WatchScreen() {
  return <LiveTheme><Watch /></LiveTheme>;
}

function Watch() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [x, setX] = useState<LiveView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(0);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [next, setNext] = useState<LiveView | null>(null);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const seen = useRef('');
  const lastReact = useRef(0);
  const lastBeat = useRef(0);
  const { items, fly } = useFloaters();

  const load = useCallback(async () => {
    if (!session) return;
    const v = await getLive(session.user, id);
    if (!v) { setMissing(true); return; }
    const t0 = Date.now();
    // New reactions from others float up; the first load only marks where we are.
    if (seen.current) v.reacts.filter((r) => r.at > seen.current && r.member_id !== me?.id).forEach((r, i) => setTimeout(() => fly(r.emoji, r.at + r.member_id), i * 180));
    seen.current = v.reacts[v.reacts.length - 1]?.at ?? seen.current ?? '';
    if (!seen.current) seen.current = new Date(t0).toISOString();
    setX(v); setNow(t0);
    if (t0 - lastBeat.current > 10000) { lastBeat.current = t0; watchLive(session.user, id); }
    if (v.state === 'done' && v.match_id) {
      setMatch(await getMatch(v.match_id, session.user.id));
      setNext(await upNext(session.user, v.league_id, v.id));
    }
  }, [session, id, me, fly]);

  useEffect(() => {
    // load only sets state after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const tick = setInterval(load, 2000);
    return () => clearInterval(tick);
  }, [load]);

  const byId = new Map(members.map((m) => [m.id, m]));
  const rankOf = (mid: string) => members.findIndex((m) => m.id === mid) + 1;
  const nameOf = (ids: string[]) => ids.map((i) => (i === me?.id ? 'You' : byId.get(i)?.display_name ?? 'Someone')).join(' and ');

  const shell = (body: ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <StatusBar style="light" />
      {body}
    </View>
  );
  const closeRow = (left: ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2] }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>{left}</View>
      <IconButton icon={X} label="Close" onPress={() => router.back()} />
    </View>
  );

  if (missing) {
    return shell(<>
      {closeRow(null)}
      <View style={{ padding: space[6], gap: space[3] }}>
        <Icon as={Lock} size={28} color={t.text2} />
        <T v="title">This match is private</T>
        <T c="text2">Only the players can see the score. It shows up in History once it is saved.</T>
      </View>
    </>);
  }
  if (!x || !session) {
    return shell(<View style={{ padding: space[4], gap: space[3] }}><Skeleton h={28} w={160} /><Skeleton h={220} /><Skeleton h={120} /></View>);
  }

  const [sa, sb] = scoreOf(x);
  const A = x.a.map((i) => byId.get(i)).filter(Boolean) as Member[], B = x.b.map((i) => byId.get(i)).filter(Boolean) as Member[];
  const p = A.length && B.length ? eloPreview(avg(A.map((m) => m.rating)), avg(B.map((m) => m.rating)), league?.k_factor ?? 32) : null;
  const chatOn = isOn(league, 'chat') && x.visibility === 'league';
  const sport = SPORT_EMOJI[league?.sport ?? ''];
  const cupLine = x.cup ? `Weekly cup, ${roundName(x.cup.round, x.cup.rounds)}` : null;

  const react = async (emoji: string) => {
    const t1 = tapTime();
    if (t1 - lastReact.current < REACT_GAP) { setNote('One reaction every 5 seconds'); return; }
    lastReact.current = t1;
    setNote(null);
    Haptics.selectionAsync();
    fly(emoji, `me${t1}`);
    await reactLive(session.user, x.id, emoji);
  };
  const send = async () => {
    const b = msg.trim();
    if (!b) return;
    setMsg('');
    try { await sayLive(session.user, x.id, b); setNote(null); load(); } catch (e) {
      setMsg(b);
      setNote(e instanceof Error && e.message === 'slow down' ? 'Slow mode, one message every 3 seconds' : 'That message can’t be posted here.');
    }
  };

  const player = (ms: Member[], side: Side) => (
    <View style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
      <View style={{ flexDirection: 'row', gap: space[1] }}>{ms.map((m) => <Avatar key={m.id} name={m.display_name} colour={m.colour} jersey={m.jersey} size={ms.length > 1 ? 44 : 64} />)}</View>
      <Text numberOfLines={2} adjustsFontSizeToFit style={{ fontFamily: font.display, fontSize: 30, lineHeight: 32, letterSpacing: -0.6, textTransform: 'uppercase', color: t.text, textAlign: 'center' }}>
        {nameOf(side === 'a' ? x.a : x.b)}{ms.some((m) => rankOf(m.id) === 1) ? ' 👑' : ''}
      </Text>
      <T v="caption" c="text2" center>{ms.length === 1 ? `${fmt(ms[0].rating)}, rank ${rankOf(ms[0].id)}` : fmt(Math.round(avg(ms.map((m) => m.rating))))}</T>
    </View>
  );

  const tile = (n: string, label: string) => {
    return (
      <View key={label} style={{ flex: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 2 }}>
        <T v="number">{n}</T>
        <T v="caption" c="text3">{label}</T>
      </View>
    );
  };

  /* ---------- M14.1 Full time, spectator ---------- */
  if (x.state === 'done' || x.state === 'abandoned') {
    const stopped = x.state === 'abandoned';
    const w: Side | null = match?.winner ?? null;
    const delta = (s: Side) => match?.match_players.find((r) => r.side === s)?.delta ?? 0;
    const loud = topChatters(x, 1)[0];
    return shell(<>
      {closeRow(<Pill label={stopped ? 'Match stopped' : `Full time, ${clockLabel(elapsed(x))}`} tone={stopped ? 'neutral' : 'win'} icon={Flag} />)}
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: insets.bottom + space[6] }}>
        {cupLine ? <T v="label" c="text2" center>{cupLine}</T> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: radius.lg, padding: space[4] }}>
          {player(A, 'a')}
          <Text style={{ fontFamily: font.heavy, fontSize: 48, color: t.text, fontVariant: ['tabular-nums'] }}>{sa}<Text style={{ color: t.text3 }}> : </Text>{sb}</Text>
          {player(B, 'b')}
        </View>
        {stopped ? <T c="text2" center>Stopped with no result. Nobody’s rating changed.</T> : w ? (
          <View style={{ gap: space[2], alignItems: 'center' }}>
            <T v="heading" center>{nameOf(w === 'a' ? x.a : x.b)} {(w === 'a' ? x.a : x.b).includes(me?.id ?? '') ? 'win' : 'wins'}{x.retired ? ', the other side retired' : ''}</T>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Pill label={`Won ${signed(Math.abs(delta(w)))}`} tone="win" />
              <Pill label={signed(-Math.abs(delta(w)))} tone="loss" />
            </View>
            {x.pending ? <T v="small" c="text3">Counts once the result is confirmed.</T> : null}
          </View>
        ) : <Skeleton h={40} />}
        <CallCard target="live" id={x.id} />
        {x.cup?.final && w && !stopped ? <Button label="See the champion" icon={Trophy} variant="secondary" onPress={() => router.push(`/cup/champion?id=${x.cup!.cupId}`)} /> : null}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {tile(String(x.peak), 'Peak viewers')}
          {tile(String(x.react_total), 'Reactions')}
          {tile(String(x.chat.length), 'Messages')}
        </View>
        {loud ? <T c="text2">Loudest in chat: <T v="label" c={t.pct[byId.get(loud.member_id)?.colour ?? 'ink']}>{nameOf([loud.member_id])} {loud.count}</T></T> : null}
        {next ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace(`/live/watch/${next.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: t.surface }}>
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={1}>Up next, {nameOf(next.a)} vs {nameOf(next.b)}</T>
              <T v="caption" c="text3">{next.state === 'ready' ? `Starts in ${startsIn(next, now) || 1} min` : 'Live now'}</T>
            </View>
            <T v="label">Watch</T>
          </Pressable>
        ) : null}
        {x.match_id ? <Button label="Go to match" onPress={() => router.replace(`/match/${x.match_id}`)} /> : null}
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>);
  }

  /* ---------- M13 Live ---------- */
  const status = x.state === 'ready'
    ? <Pill label={x.starts_at ? `Starts in ${clockLabel(Math.max(0, new Date(x.starts_at).getTime() - now))}` : 'Getting ready'} icon={Timer} />
    : x.state === 'paused' ? <Pill label="Paused" tone="warning" icon={Pause} /> : <LivePill />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      {shell(<>
        {closeRow(<>
          {status}
          {x.state !== 'ready' ? <T v="label" c="text2">{clockLabel(elapsed(x, now))}</T> : null}
          <Icon as={Eye} size={14} color={t.text2} />
          <T v="label" c="text2">{viewers(x, now)}</T>
          <T v="caption" c="text3" numberOfLines={1} style={{ flex: 1 }}>{league?.name}</T>
        </>)}
        <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[4], gap: space[4] }} keyboardShouldPersistTaps="handled">
          {x.cup ? (
            <View style={{ gap: 2 }}>
              <T v="heading">{cupLine}{x.cup.final ? ' 🏆' : ''}</T>
              <T v="small" c="text2">{x.cup.final ? `Winner takes ${x.cup.prize} coins and the cup` : 'Winner goes through'}</T>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[4] }}>
            {player(A, 'a')}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: font.heavy, fontSize: 72, lineHeight: 80, color: t.text, fontVariant: ['tabular-nums'] }}>{sa}<Text style={{ color: t.text3 }}>:</Text>{sb}</Text>
              <T v="caption" c="text2">{formatLabel(x.format)}</T>
            </View>
            {player(B, 'b')}
          </View>
          {p ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[4], backgroundColor: t.surface, borderRadius: radius.md, paddingVertical: space[3] }}>
              <T v="label">{nameOf(x.a)} wins <T v="label" c="win">{signed(p.aWins)}</T></T>
              <T v="label">{nameOf(x.b)} wins <T v="label" c="win">{signed(-p.bWins)}</T></T>
            </View>
          ) : null}
          <CallCard target="live" id={x.id} />
          {x.visibility === 'league' ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[...REACTS, ...(sport ? [sport] : [])].map((e) => (
                <Pressable key={e} accessibilityRole="button" accessibilityLabel={`React ${e}`} onPress={() => react(e)}
                  style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface3 : t.surface2 })}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {note ? <T v="small" c="text3">{note}</T> : null}
          {chatOn ? (
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="heading">Chat</T>
                <T v="caption" c="text3">{x.chat.length} {x.chat.length === 1 ? 'message' : 'messages'}</T>
              </View>
              <ChatLines lines={x.chat} byId={byId} meId={me?.id} />
            </View>
          ) : null}
        </ScrollView>
        {chatOn ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: insets.bottom + space[2] }}>
            <TextInput value={msg} onChangeText={setMsg} onSubmitEditing={send} placeholder="Say something" placeholderTextColor={t.text3} maxLength={200} returnKeyType="send"
              style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: t.surface2, paddingHorizontal: space[4], color: t.text, fontFamily: font.medium, fontSize: 16 }} />
            <IconButton icon={SendHorizontal} label="Send" tone="primary" onPress={send} />
          </View>
        ) : <View style={{ height: insets.bottom }} />}
        <Floaters items={items} />
      </>)}
    </KeyboardAvoidingView>
  );
}
