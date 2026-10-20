// M11.2 Get ready, M12 Scoreboard, M12.1 Paused, M12.2 Reconnecting, M12.3 Abandon match (players)
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Check, Flag, MessageCircle, MoreHorizontal, Pause, Play, SendHorizontal, Undo2, WifiOff, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  abandonLive, addPoint, cancelLive, canScore, clockLabel, decided, elapsed, finishLive, formatLabel, getLive, isReady, leader,
  players, sayLive, scoreOf, setPaused, setReady, startAnyway, undoPoint, viewers, type LiveView, type Side,
} from '@/lib/live';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, playerColours, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Icon, IconButton, Pill, T } from '@/ui';
import { Sheet } from '@/ui/chat-kit';
import { ChatLines, LivePill, LiveTheme } from '@/ui/live';

type Op = { kind: 'add' | 'undo'; side?: Side };
const REASONS = ['Injury', 'Out of time', 'Table issue', 'Other'];

export default function ScoreboardScreen() {
  useKeepAwake();
  return <LiveTheme><Scoreboard /></LiveTheme>;
}

function Scoreboard() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league, members, me, refresh } = useLeague();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [x, setX] = useState<LiveView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(0);
  const [offline, setOffline] = useState(0); // first failed write time, 0 = online
  const [dismissed, setDismissed] = useState(-1);
  const [sheet, setSheet] = useState<'abandon' | 'tie' | 'chat' | null>(null);
  const [retire, setRetire] = useState<Side | 'stop' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = useRef<Op[]>([]);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    if (!session || queue.current.length) return;
    const v = await getLive(session.user, id);
    if (!v) { setMissing(true); return; }
    setX(v); setNow(Date.now());
  }, [session, id]);

  const flush = useCallback(async () => {
    if (!session || flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.length) {
        const op = queue.current[0];
        if (op.kind === 'add') await addPoint(session.user, id, op.side!);
        else await undoPoint(session.user, id, op.side);
        queue.current.shift();
      }
      setOffline(0);
    } catch { setOffline((o) => o || Date.now()); } finally { flushing.current = false; }
  }, [session, id]);

  useEffect(() => {
    // load only sets state after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const tick = setInterval(() => { setNow(Date.now()); if (queue.current.length) flush(); else load(); }, 1500);
    return () => clearInterval(tick);
  }, [load, flush]);

  // Leave for the right screen: spectators watch, full time has its own screen.
  useEffect(() => {
    if (!x || !me) return;
    if (x.state === 'done') router.replace(`/live/end/${x.id}`);
    else if (!players(x).includes(me.id) || (x.state !== 'ready' && !canScore(x, me.id))) router.replace(`/live/watch/${x.id}`);
  }, [x, me]);

  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (ids: string[]) => ids.map((i) => (i === me?.id ? 'You' : byId.get(i)?.display_name ?? 'Someone')).join(' and ');

  if (missing || x?.state === 'abandoned') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: space[6], paddingTop: insets.top + space[12], gap: space[4] }}>
        <StatusBar style="light" />
        <T v="title">{missing ? 'Match not found' : 'Match stopped'}</T>
        <T c="text2">{missing ? 'It may have ended a while ago.' : 'No result was saved and nobody’s rating changed.'}</T>
        <Button label="Close" onPress={() => router.back()} />
      </View>
    );
  }
  if (!x || !me || !session) return <View style={{ flex: 1, backgroundColor: t.bg }}><StatusBar style="light" /></View>;

  const [sa, sb] = scoreOf(x);
  const pub = x.visibility === 'league';
  const local = (fn: (v: LiveView) => void) => setX((v) => { if (!v) return v; const c = { ...v, points: [...v.points] }; fn(c); return c; });
  const push = (op: Op) => { queue.current.push(op); flush(); };
  const point = (side: Side) => {
    if (x.state !== 'live' || (x.format.kind === 'first' && decided(x))) return; // target reached, the Full time sheet takes over
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    local((v) => v.points.push({ side, at: new Date().toISOString(), by: me.id }));
    push({ kind: 'add', side });
  };
  const undo = (side?: Side) => {
    const i = side ? x.points.map((p) => p.side).lastIndexOf(side) : x.points.length - 1;
    if (i < 0) return;
    Haptics.selectionAsync();
    local((v) => v.points.splice(i, 1));
    push({ kind: 'undo', side });
  };
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch { /* reload shows the real state */ }
    setBusy(false); setSheet(null);
    await load();
  };
  const finish = async (opts: { winner?: Side; retired?: Side | null } = {}) => {
    if (!opts.winner && !opts.retired && !decided(x, now) && !leader(x)) { setSheet('tie'); return; }
    setBusy(true);
    await flush();
    try {
      await finishLive(session.user, x.id, opts);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
      router.replace(`/live/end/${x.id}`);
    } catch { setBusy(false); setSheet(null); load(); }
  };

  /* ---------- M11.2 Get ready ---------- */
  if (x.state === 'ready') {
    const waited = now ? now - new Date(x.created_at).getTime() : 0;
    const late = players(x).filter((p) => !isReady(x, p, now || undefined));
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space[3] }}>
        <StatusBar style="light" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
          <Pill label={`Waiting ${clockLabel(waited)}`} />
          <IconButton icon={X} label="Cancel live match" onPress={() => act(() => cancelLive(session.user, x.id)).then(() => router.back())} />
        </View>
        <View style={{ flex: 1, padding: space[4], gap: space[5], justifyContent: 'center' }}>
          <T v="title" center>Get ready</T>
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            {players(x).map((p) => {
              const m = byId.get(p), ready = isReady(x, p, now || undefined);
              return (
                <View key={p} style={{ flex: 1, alignItems: 'center', gap: space[2], backgroundColor: t.surface, borderRadius: radius.md, paddingVertical: space[5] }}>
                  {m ? <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={56} /> : null}
                  <T v="heading" numberOfLines={1}>{p === me.id ? 'You' : m?.display_name}</T>
                  {ready ? <Pill label="Ready" tone="win" icon={Check} /> : <Pill label="On the way" />}
                </View>
              );
            })}
          </View>
          <T c="text2" center>{late.length ? `Starts when ${nameOf(late)} ${late.length > 1 || late[0] === me.id ? 'are' : 'is'} ready.` : 'Starting…'}</T>
          {waited > 10 * 60000 && late.length ? <T c="warning" center>{nameOf(late)} isn’t here. Cancel, or log a no-show from History.</T> : null}
        </View>
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          {!isReady(x, me.id, now || undefined) ? <Button label="I'm ready" icon={Check} loading={busy} onPress={() => act(() => setReady(session.user, x.id))} /> : null}
          {canScore(x, me.id) && waited > 60000 && late.length ? <Button label="Start anyway" variant="secondary" loading={busy} onPress={() => act(() => startAnyway(session.user, x.id))} /> : null}
        </View>
      </View>
    );
  }

  /* ---------- M12 Scoreboard ---------- */
  const time = elapsed(x, now || undefined);
  const left = x.format.kind === 'timed' ? Math.max(0, x.format.minutes * 60000 - time) : null;
  const win = decided(x, now || undefined);
  const paused = x.state === 'paused';
  const pausedFor = paused && x.paused_at && now ? now - new Date(x.paused_at).getTime() : 0;
  const lastChat = x.chat[x.chat.length - 1];

  const half = (side: Side) => {
    const ids = side === 'a' ? x.a : x.b;
    const m = byId.get(ids[0]);
    const bg = playerColours[m?.colour ?? 'blue'];
    const fg = m?.colour === 'yellow' ? '#0A0A0A' : '#FFFFFF';
    const score = side === 'a' ? sa : sb;
    return (
      <View style={{ flex: 1, gap: space[2] }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Point for ${nameOf(ids)}, now ${score}`} onPress={() => point(side)} disabled={paused}
          style={({ pressed }) => ({ flex: 1, borderRadius: radius.lg, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', padding: space[3], transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <Text numberOfLines={2} adjustsFontSizeToFit style={{ fontFamily: font.display, fontSize: 28, lineHeight: 30, textTransform: 'uppercase', letterSpacing: -0.6, color: fg, textAlign: 'center' }}>{nameOf(ids)}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 128, lineHeight: 136, color: fg, fontVariant: ['tabular-nums'] }}>{score}</Text>
          <Text style={{ fontFamily: font.semibold, fontSize: 13, color: fg }}>Tap for +1</Text>
        </Pressable>
        <Button label="−1" variant="secondary" size="md" disabled={!score || paused} onPress={() => undo(side)} />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space[2] }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        {paused ? <Pill label="Paused" tone="warning" icon={Pause} /> : <LivePill />}
        <T v="label" c="text2" style={{ flex: 1 }} numberOfLines={1}>{clockLabel(time)}{pub ? `, ${viewers(x, now || undefined)} watching` : ''}</T>
        <IconButton icon={Undo2} label="Undo last point" onPress={() => undo()} />
        <IconButton icon={paused ? Play : Pause} label={paused ? 'Resume' : 'Pause'} onPress={() => act(() => setPaused(session.user, x.id, !paused))} />
        <IconButton icon={MoreHorizontal} label="More" onPress={() => { setRetire(null); setReason(null); setSheet('abandon'); }} />
      </View>
      {offline ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginHorizontal: space[4], padding: space[3], borderRadius: radius.sm, backgroundColor: t.surface2 }}>
          <Icon as={WifiOff} size={16} color={t.text2} />
          <T v="small" style={{ flex: 1 }}>{now - offline > 5 * 60000 ? 'Still offline. Finish here and we’ll sync later.' : 'Reconnecting. Your points are saved on this phone.'}</T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <T v="label" c="text2">{x.cup ? `Weekly cup, ${formatLabel(x.format)}` : formatLabel(x.format)}</T>
        {left != null ? <T v="label" c={left < 60000 ? 'warning' : 'text2'}>{clockLabel(left)} left</T> : null}
      </View>

      {paused ? (
        <View style={{ flex: 1, margin: space[4], borderRadius: radius.lg, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[5] }}>
          <T v="display">Paused</T>
          <T v="bigNumber">{sa} : {sb}</T>
          {pausedFor > 60 * 60000 ? <T c="warning" center>Paused for over an hour. Stop the match?</T> : pausedFor > 15 * 60000 ? <T c="text2" center>Still there? The clock is stopped.</T> : <T c="text2" center>The clock is stopped. Chat stays open.</T>}
          <Button label="Resume" icon={Play} full loading={busy} onPress={() => act(() => setPaused(session.user, x.id, false))} />
          <Button label="Finish now" icon={Flag} variant="secondary" full loading={busy} onPress={() => finish()} />
          <Button label="Abandon" variant="ghost" onPress={() => { setRetire(null); setReason(null); setSheet('abandon'); }} />
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingBottom: space[3] }}>
          {half('a')}
          {half('b')}
        </View>
      )}

      <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
        {pub ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open live chat" onPress={() => setSheet('chat')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 }}>
            <T v="body">{x.reacts.slice(-5).map((r) => r.emoji).join(' ') || '👀'}</T>
            <T v="small" c="text2" style={{ flex: 1 }} numberOfLines={1}>{lastChat ? `${byId.get(lastChat.member_id)?.display_name ?? 'Someone'}: ${lastChat.body}` : 'Chat is hidden while you play'}</T>
            <Icon as={MessageCircle} size={20} color={t.text2} />
          </Pressable>
        ) : null}
        <Button label="Finish and log result" icon={Flag} loading={busy} onPress={() => finish()} />
      </View>

      {/* auto finish by the format */}
      <Sheet visible={!!win && !paused && dismissed !== x.points.length && !sheet} onClose={() => setDismissed(x.points.length)} title="Full time?">
        <T c="text2">{win ? `${sa} : ${sb}, ${nameOf(win === 'a' ? x.a : x.b)} ${win === 'a' && x.a.includes(me.id) || win === 'b' && x.b.includes(me.id) ? 'win' : 'wins'}.` : ''}</T>
        <Button label="Finish" icon={Flag} loading={busy} onPress={() => finish({ winner: win ?? undefined })} />
        <Button label="Undo last point" variant="secondary" onPress={() => undo()} />
        <Button label="Keep playing" variant="ghost" onPress={() => setDismissed(x.points.length)} />
      </Sheet>

      <Sheet visible={sheet === 'tie'} onClose={() => setSheet(null)} title="Who won?">
        <T c="text2">Level at {sa} : {sb}. Pick the winner to save it.</T>
        <Button label={`${nameOf(x.a)} won`} loading={busy} onPress={() => finish({ winner: 'a' })} />
        <Button label={`${nameOf(x.b)} won`} variant="secondary" loading={busy} onPress={() => finish({ winner: 'b' })} />
      </Sheet>

      {/* M12.3 abandon */}
      <Sheet visible={sheet === 'abandon'} onClose={() => setSheet(null)} title="Abandon match">
        {(['a', 'b'] as const).map((s) => (
          <Button key={s} variant={retire === s ? 'primary' : 'secondary'} label={`${nameOf(s === 'a' ? x.a : x.b)} retired, ${nameOf(s === 'a' ? x.b : x.a).replace(/^You\b/, 'you')} ${s === 'a' ? (x.b.includes(me.id) ? 'win' : 'wins') : (x.a.includes(me.id) ? 'win' : 'wins')}`} onPress={() => setRetire(s)} />
        ))}
        <Button variant={retire === 'stop' ? 'primary' : 'secondary'} label="Stop, no result" onPress={() => setRetire('stop')} />
        <T v="small" c="text3">{retire === 'stop' ? 'Nothing is rated.' : retire ? 'The win counts for the rating, like a normal match.' : 'Pick one.'}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {REASONS.map((r) => (
            <Pressable key={r} accessibilityRole="button" accessibilityState={{ selected: reason === r }} onPress={() => setReason(reason === r ? null : r)}
              style={{ height: 44, paddingHorizontal: space[4], borderRadius: radius.pill, justifyContent: 'center', backgroundColor: reason === r ? t.primary : t.surface2 }}>
              <T v="label" c={reason === r ? 'onPrimary' : 'text'}>{r}</T>
            </Pressable>
          ))}
        </View>
        <Button label="Confirm" variant="danger" disabled={!retire} loading={busy}
          onPress={() => (retire === 'stop' ? act(() => abandonLive(session.user, x.id, reason)) : retire ? finish({ retired: retire }) : undefined)} />
      </Sheet>

      {/* M13.1 chat, hidden by default for players */}
      <Sheet visible={sheet === 'chat'} onClose={() => setSheet(null)} title="Live chat">
        <ChatLines lines={x.chat} byId={byId} meId={me.id} />
        {isOn(league, 'chat') ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <TextInput value={msg} onChangeText={setMsg} placeholder="Say something" placeholderTextColor={t.text3} maxLength={200}
              style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: t.surface2, paddingHorizontal: space[4], color: t.text, fontFamily: font.medium, fontSize: 16 }} />
            <IconButton icon={SendHorizontal} label="Send" tone="primary" onPress={async () => { const b = msg; setMsg(''); await sayLive(session.user, x.id, b).catch(() => setMsg(b)); load(); }} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
