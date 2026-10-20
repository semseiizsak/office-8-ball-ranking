import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowLeft, Info, MessageCircle, Pin } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REACTIONS, toggleReaction } from '@/lib/api';
import {
  acceptGuidelines, canEditMessage, deleteMessage, editMessage, loadChat, markChatRead, sendMessage, setPinned, toggleMessageReaction,
  type ChatMessage, type ChatView, type MatchCard,
} from '@/lib/chat';
import type { Member } from '@/lib/types';
import { clock } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Icon, IconButton, Screen, Skeleton, T } from '@/ui';
import { tapTime, ActionSheet, BlockSheet, Composer, GuidelinesCard, ReactionPills, RemoveSheet, ReportSheet, Rich, WhoReacted, type Action, type ReportReq } from '@/ui/chat-kit';

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string; n: number }
  | { kind: 'msg'; key: string; m: ChatMessage; start: boolean; end: boolean };

const GROUP_MS = 5 * 60000;
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayText(iso: string) {
  const d = new Date(iso), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

// K1 League chat with message actions (K1.1), match cards (K1.2), event cards and system lines (K1.3), reactions (K1.4, K1.5),
// mentions (K1.6), pinned bar (K1.9), guidelines (K12.1), report (K9), block (K10) and admin remove (K11.2).
export default function ChatScreen() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { msg: focusId } = useLocalSearchParams<{ msg?: string }>();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const [v, setV] = useState<ChatView | null | undefined>(undefined);
  const [since, setSince] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  const [who, setWho] = useState<ChatMessage['reactions'] | null>(null);
  const [reportReq, setReportReq] = useState<ReportReq | null>(null);
  const [blockFor, setBlockFor] = useState<Member | null>(null);
  const [removeFor, setRemoveFor] = useState<{ kind: 'message'; id: string; author: string } | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [pinIx, setPinIx] = useState(0);
  const [away, setAway] = useState(false);
  const list = useRef<FlatList<Row>>(null);
  const taps = useRef<Record<string, number>>({});
  const jumped = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !league) return;
    try {
      const x = await loadChat(session.user, league.id);
      setV(x);
      setSince((s) => (s === undefined ? x.lastRead : s));
      if (x.enabled) markChatRead(session.user, league.id);
    } catch { setV(null); }
  }, [session, league]);

  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [load]));

  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id: string | null) => (id === me?.id ? 'You' : (id && byId.get(id)?.display_name) || 'Former player');
  const names = members.map((m) => m.display_name);
  const others = members.filter((m) => m.id !== me?.id && !v?.blocked.has(m.id));

  // Rows oldest first, then reversed for the inverted list (newest at the bottom).
  const rows: Row[] = [];
  if (v) {
    let prev: ChatMessage | null = null;
    const firstNew = since === undefined ? -1 : v.messages.findIndex((m) => (since === null || m.created_at > since) && m.author !== v.me.id && m.kind !== 'system');
    const newCount = firstNew < 0 ? 0 : v.messages.slice(firstNew).filter((m) => m.author !== v.me.id && m.kind !== 'system').length;
    v.messages.forEach((m, i) => {
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) rows.push({ kind: 'day', key: 'd' + m.id, label: dayText(m.created_at) });
      if (i === firstNew && since !== null && newCount) rows.push({ kind: 'new', key: 'new', n: newCount });
      const start = !prev || prev.author !== m.author || m.kind !== 'text' || prev.kind !== 'text' || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_MS || dayKey(prev.created_at) !== dayKey(m.created_at);
      const last = rows[rows.length - 1];
      if (!start && last?.kind === 'msg') last.end = false;
      rows.push({ kind: 'msg', key: m.id, m, start, end: true });
      prev = m;
    });
  }
  const data = [...rows].reverse();

  const jumpTo = (id: string) => {
    const i = data.findIndex((r) => r.key === id);
    if (i < 0) return;
    list.current?.scrollToIndex({ index: i, viewPosition: 0.5, animated: true });
    setFlash(id);
    setTimeout(() => setFlash(null), 1200);
  };
  // Deep link /chat?msg=id (mentions, replies, pinned list) jumps once the message is loaded.
  const hasFocus = !!focusId && data.some((r) => r.key === focusId);
  useEffect(() => {
    if (!hasFocus || jumped.current === focusId) return;
    jumped.current = focusId!;
    const id = setTimeout(() => jumpTo(focusId!), 300);
    return () => clearTimeout(id);
  }, [hasFocus, focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.'); }
    load();
  };
  const reactMsg = (m: ChatMessage, emoji: string) => run(() => toggleMessageReaction(session!.user, m.id, emoji));
  const reactMatch = (id: string, emoji: string) => run(() => toggleReaction(session!.user, id, emoji));

  const send = async () => {
    if (!league || !session || busy) return;
    setBusy(true);
    try {
      if (editing) await editMessage(session.user, editing.id, text);
      else await sendMessage(session.user, league.id, text, reply?.id ?? null);
      Haptics.selectionAsync();
      setText(''); setReply(null); setEditing(null);
      list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      Alert.alert("Couldn't send", e instanceof Error ? e.message : 'Try again.');
    } finally { setBusy(false); load(); }
  };

  const onTap = (m: ChatMessage, single: () => void) => {
    const now = tapTime(), last = taps.current[m.id] ?? 0;
    taps.current[m.id] = now;
    if (now - last < 280) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (m.kind === 'match' && m.match_id) reactMatch(m.match_id, '👏'); else reactMsg(m, '🔥');
      taps.current[m.id] = 0;
    } else if (m.kind !== 'text') setTimeout(() => { if (taps.current[m.id] === now) single(); }, 290);
  };

  const actions = (m: ChatMessage): Action[] => {
    if (!v || !me) return [];
    const mine = m.author === me.id;
    const author = m.author ? byId.get(m.author) ?? null : null;
    const pinned = v.pins.some((p) => p.message.id === m.id);
    if (m.kind === 'system') return [{ label: 'Copy text', run: () => Clipboard.setStringAsync(m.body) }];
    if (m.kind === 'match') return m.match_id ? [{ label: 'Open match', run: () => router.push(`/match/${m.match_id}`) }] : [];
    if (m.kind === 'event') return m.event?.href ? [{ label: 'Open', run: () => router.push(m.event!.href as never) }] : [];
    if (m.deleted_at || m.removed_by) return [];
    const out: Action[] = [
      { label: 'Reply', run: () => { setEditing(null); setReply(m); } },
      { label: 'Copy text', run: () => Clipboard.setStringAsync(m.body) },
    ];
    if (v.admin) out.push({ label: pinned ? 'Unpin' : 'Pin', run: () => run(() => setPinned(session!.user, m.id, !pinned)) });
    if (canEditMessage(m, me.id)) out.push({ label: 'Edit', run: () => { setReply(null); setEditing(m); setText(m.body); } });
    if (m.reactions.length) out.push({ label: 'View reactions', run: () => setWho(m.reactions) });
    if (mine) out.push({ label: 'Delete', danger: true, run: () => Alert.alert('Delete this message?', 'It is removed for everyone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run(() => deleteMessage(session!.user, m.id)) }]) });
    else {
      out.push({ label: v.reported.has(m.id) ? 'Reported' : 'Report', danger: true, run: () => (v.reported.has(m.id) ? Alert.alert('Already reported', "You reported this. We're looking at it.") : setReportReq({ leagueId: m.league_id, target: 'message', targetId: m.id, author, snapshot: m.body, label: 'message' })) });
      if (v.admin) out.push({ label: 'Remove', danger: true, run: () => setRemoveFor({ kind: 'message', id: m.id, author: author?.display_name ?? 'The author' }) });
      if (author && !v.blocked.has(author.id)) out.push({ label: `Block ${author.display_name}`, danger: true, run: () => setBlockFor(author) });
    }
    return out;
  };

  /* ---------- renderers ---------- */
  const matchCard = (m: ChatMessage, c: MatchCard | null | undefined) => {
    if (!c) return <T v="caption" c="text3" center>This match was deleted</T>;
    const side = (ids: string[]) => ids.map(nameOf).join(' and ');
    const winnerMine = c.winners.includes(me?.id ?? '');
    // Reactions and comments sit outside the card's Pressable: nested buttons break on web and for screen readers.
    return (
      <View style={{ alignSelf: 'stretch', backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Match, ${side(c.winners)} beat ${side(c.losers)}`} onPress={() => onTap(m, () => router.push(`/match/${c.id}`))}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenu(m); }}
        style={({ pressed }) => ({ backgroundColor: pressed ? t.surface3 : t.surface, padding: space[3], paddingBottom: space[2], gap: space[2] })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <T v="label" c="text2" style={{ flex: 1 }}>Match, {c.format}</T>
          <T v="caption" c="text3">{clock(c.at)}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flexDirection: 'row' }}>
            {[...c.winners, ...c.losers].map((id, i) => { const p = byId.get(id); return p ? <View key={id} style={{ marginLeft: i ? -10 : 0 }}><Avatar name={p.display_name} colour={p.colour} size={32} /></View> : null; })}
          </View>
          <T v="heading" style={{ flex: 1 }} numberOfLines={2}>{side(c.winners)} beat {side(c.losers).replace(/^You$/, 'you')}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {c.score ? <T v="number">{c.score[0]} : {c.score[1]}</T> : null}
          <T v="label" c="win">{signed(c.delta)}</T>
          <T v="label" c="text2">{signed(-c.delta)}</T>
          <View style={{ flex: 1 }} />
          {winnerMine ? <T v="caption" c="text2">Nice win</T> : null}
        </View>
      </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingBottom: space[3] }}>
          <View style={{ flex: 1 }}>
            <ReactionPills counts={c.reactions} onToggle={(e) => reactMatch(c.id, e)} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`${c.comments} comments`} onPress={() => router.push(`/match/${c.id}`)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
            <Icon as={MessageCircle} size={16} color={t.text2} />
            <T v="caption" c="text2">{c.comments}</T>
          </Pressable>
        </View>
      </View>
    );
  };

  const bubble = (r: Extract<Row, { kind: 'msg' }>) => {
    const { m, start, end } = r;
    if (!v || !me) return null;
    if (m.kind === 'system') {
      return <Pressable onLongPress={() => setMenu(m)} style={{ paddingVertical: space[2] }}><T v="caption" c="text3" center>{m.body}</T></Pressable>;
    }
    if (m.kind === 'match') return <View style={{ paddingVertical: space[1] }}>{matchCard(m, m.match_id ? v.matches[m.match_id] : null)}</View>;
    if (m.kind === 'event') {
      return (
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: space[1] }}>
          <Pressable accessibilityRole="button" onPress={() => onTap(m, () => m.event?.href && router.push(m.event.href as never))} onLongPress={() => setMenu(m)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface })}>
            <Text style={{ fontSize: 22 }}>{m.event?.icon}</Text>
            <View>
              <T v="label">{m.event?.title}</T>
              {m.event?.sub ? <T v="caption" c="text2">{m.event.sub}</T> : null}
            </View>
          </Pressable>
          <ReactionPills reactions={m.reactions} meId={me.id} onToggle={(e) => reactMsg(m, e)} onLongPress={() => setWho(m.reactions)} />
        </View>
      );
    }
    const mine = m.author === me.id;
    const author = m.author ? byId.get(m.author) : undefined;
    const blocked = !!m.author && v.blocked.has(m.author) && !shown.includes(m.id);
    const gone = m.deleted_at ? 'Message deleted' : m.removed_by ? 'Removed by an admin' : m.hidden && !mine ? 'Hidden while the admins review it' : null;
    const parent = m.reply_to ? v.messages.find((x) => x.id === m.reply_to) : null;
    const big = 18, small = 6;
    const corners = mine
      ? { borderTopLeftRadius: big, borderBottomLeftRadius: big, borderTopRightRadius: start ? big : small, borderBottomRightRadius: end ? big : small }
      : { borderTopRightRadius: big, borderBottomRightRadius: big, borderTopLeftRadius: start ? big : small, borderBottomLeftRadius: end ? big : small };
    const fg = mine ? t.onPrimary : t.text;
    return (
      <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space[2], marginTop: start ? space[2] : 2,
        backgroundColor: flash === m.id ? t.surface2 : 'transparent', borderRadius: radius.sm }}>
        {!mine ? (
          <View style={{ width: 32, justifyContent: 'flex-end' }}>
            {end && author ? <Pressable accessibilityLabel={`${author.display_name}, view profile`} onPress={() => router.push(`/player/${author.id}`)}><Avatar name={author.display_name} colour={author.colour} size={32} /></Pressable> : null}
          </View>
        ) : null}
        <View style={{ maxWidth: '78%', gap: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {start && !mine ? <T v="caption" c="text2" style={{ paddingHorizontal: 4 }}>{nameOf(m.author)}</T> : null}
          {blocked ? (
            <Pressable accessibilityRole="button" onPress={() => setShown([...shown, m.id])} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: big, backgroundColor: t.surface }}>
              <T v="small" c="text3">Message from a blocked member. <T v="small" c="text">Show</T></T>
            </Pressable>
          ) : gone ? (
            <View style={{ paddingHorizontal: space[3], paddingVertical: 10, borderRadius: big, borderWidth: 1, borderColor: t.line }}><T v="small" c="text3">{gone}</T></View>
          ) : (
            <Pressable accessibilityHint="Double tap to react with fire, long press for more" onPress={() => onTap(m, () => {})}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenu(m); }}
              style={({ pressed }) => [{ paddingHorizontal: space[3], paddingVertical: 9, backgroundColor: mine ? t.primary : pressed ? t.surface3 : t.surface, gap: 4 }, corners]}>
              {parent ? (
                <Pressable onPress={() => jumpTo(parent.id)} style={{ borderLeftWidth: 3, borderLeftColor: mine ? t.onPrimary : t.brand, paddingLeft: 8 }}>
                  <T v="caption" c={mine ? 'onPrimary' : 'text2'}>{nameOf(parent.author)}</T>
                  <T v="caption" c={mine ? 'onPrimary' : 'text3'} numberOfLines={1}>{parent.deleted_at || parent.removed_by ? 'Message deleted' : parent.body}</T>
                </Pressable>
              ) : null}
              <Rich body={m.body} names={names} colour={fg} onMention={(n) => { const x = members.find((y) => y.display_name.toLowerCase() === n.toLowerCase()); if (x) router.push(`/player/${x.id}`); }} />
              <Text style={{ fontFamily: font.medium, fontSize: 11, color: mine ? t.onPrimary : t.text3, alignSelf: 'flex-end' }}>{m.edited_at ? 'Edited, ' : ''}{clock(m.created_at)}</Text>
            </Pressable>
          )}
          {!blocked && !gone ? <ReactionPills reactions={m.reactions} meId={me.id} onToggle={(e) => reactMsg(m, e)} onLongPress={() => setWho(m.reactions)} /> : null}
        </View>
      </View>
    );
  };

  const renderRow = (r: Row) => {
    if (r.kind === 'day') return <T v="caption" c="text3" center style={{ paddingVertical: space[3] }}>{r.label}</T>;
    if (r.kind === 'new') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2] }}>
          <View style={{ flex: 1, height: 1, backgroundColor: t.brand }} />
          <T v="caption" c="brand">{r.n} new</T>
          <View style={{ flex: 1, height: 1, backgroundColor: t.brand }} />
        </View>
      );
    }
    return bubble(r);
  };

  /* ---------- layout ---------- */
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: t.line }}>
      <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/chat-info')} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
        <T v="heading" numberOfLines={1}>{league?.name ?? 'League chat'}</T>
        <T v="caption" c="text3">{members.length} {members.length === 1 ? 'member' : 'members'}</T>
      </Pressable>
      <IconButton icon={Info} label="Chat info" onPress={() => router.push('/chat-info')} />
    </View>
  );

  if (v === undefined) {
    return (
      <Screen>
        {header}
        <View style={{ padding: space[4], gap: space[3] }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }}><Skeleton h={40} w={140 + (i % 3) * 40} r={18} /></View>)}
        </View>
      </Screen>
    );
  }
  if (v === null) {
    return <Screen>{header}<Empty icon={MessageCircle} title="Couldn't load messages" body="Check your connection and try again." action={<Button label="Retry" onPress={load} />} /></Screen>;
  }
  if (!v.enabled) {
    return (
      <Screen>
        {header}
        <Empty icon={MessageCircle} title="Chat is turned off in this league" body="League admins can turn it on in the league modules."
          action={v.admin ? <Button label="Turn on in settings" onPress={() => router.push('/league/modules' as never)} /> : undefined} />
      </Screen>
    );
  }

  const pin = v.pins.length ? v.pins[pinIx % v.pins.length] : null;
  const typing = v.typing.filter((n) => !members.some((m) => m.display_name === n && v.blocked.has(m.id)));
  const locked = v.settings.post === 'admins' && !v.admin;
  const onlyIntro = !v.messages.some((m) => m.kind !== 'system');

  return (
    <Screen>
      {header}
      {pin ? (
        <Pressable accessibilityRole="button" accessibilityHint="Long press to see all pinned messages"
          onPress={() => { jumpTo(pin.message.id); setPinIx(pinIx + 1); }} onLongPress={() => router.push('/chat-info')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : t.surface })}>
          <Icon as={Pin} size={16} color={t.text2} />
          <T v="small" style={{ flex: 1 }} numberOfLines={1}>{pin.message.body}</T>
          {v.pins.length > 1 ? <T v="caption" c="text3">{(pinIx % v.pins.length) + 1} of {v.pins.length}</T> : null}
        </Pressable>
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {onlyIntro ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Empty icon={MessageCircle} title="Say hi to your league" body={`Everyone in ${league?.name ?? 'the league'} can see messages here.`} />
            {data.map((r) => <View key={r.key} style={{ paddingHorizontal: space[4] }}>{renderRow(r)}</View>)}
          </View>
        ) : (
          <FlatList
            ref={list}
            inverted
            data={data}
            keyExtractor={(r) => r.key}
            renderItem={({ item }) => renderRow(item)}
            contentContainerStyle={{ paddingHorizontal: space[4], paddingVertical: space[3] }}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => setAway(e.nativeEvent.contentOffset.y > 400)}
            scrollEventThrottle={100}
            onScrollToIndexFailed={(e) => list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true })}
          />
        )}
        {away ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest" onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
            style={{ position: 'absolute', right: space[4], bottom: 96, width: 44, height: 44, borderRadius: 22, backgroundColor: t.overlay, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={ArrowDown} size={20} />
          </Pressable>
        ) : null}
        <View style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[3]), borderTopWidth: 1, borderTopColor: t.line, gap: space[2] }}>
          {typing.length ? <T v="caption" c="text3">{typing.length > 3 ? 'Several people are typing' : `${typing.join(', ')} ${typing.length === 1 ? 'is' : 'are'} typing`}</T> : null}
          {!v.accepted ? (
            <GuidelinesCard onAgree={() => run(() => acceptGuidelines(session!.user))} />
          ) : locked ? (
            <T v="small" c="text2" center style={{ paddingVertical: space[3] }}>Only admins can post right now.</T>
          ) : (
            <Composer value={text} onChange={setText} onSend={send} busy={busy} placeholder={`Message ${league?.name ?? 'the league'}`}
              members={others} everyone={v.admin ? members.length - 1 : undefined} waitS={editing ? 0 : v.slowLeft}
              replying={reply ? nameOf(reply.author) : null} editing={!!editing}
              onCancelReply={() => { setReply(null); if (editing) { setEditing(null); setText(''); } }} />
          )}
        </View>
      </KeyboardAvoidingView>

      <ActionSheet visible={!!menu} onClose={() => setMenu(null)}
        preview={menu?.kind === 'text' && !menu.deleted_at && !menu.removed_by ? menu.body : undefined}
        emojis={menu?.kind === 'match' ? REACTIONS : undefined}
        mine={menu ? (menu.kind === 'match' ? (v.matches[menu.match_id ?? '']?.reactions.filter((r) => r.mine).map((r) => r.emoji)) : menu.reactions.filter((r) => r.member_id === me?.id).map((r) => r.emoji)) : []}
        react={menu && menu.kind !== 'system' && !menu.deleted_at && !menu.removed_by ? (e) => (menu.kind === 'match' && menu.match_id ? reactMatch(menu.match_id, e) : reactMsg(menu, e)) : undefined}
        actions={menu ? actions(menu) : []} />
      <WhoReacted reactions={who} members={members} meId={me?.id} onClose={() => setWho(null)} />
      <ReportSheet req={reportReq} onClose={() => { setReportReq(null); load(); }} leagueName={league?.name} />
      <BlockSheet member={blockFor} onClose={() => { setBlockFor(null); load(); }} challenges
        onReport={blockFor ? () => { const b = blockFor; const m = menuTarget(v.messages, b.id); setReportReq({ leagueId: league!.id, target: m ? 'message' : 'profile', targetId: m?.id ?? b.id, author: b, snapshot: m?.body ?? b.display_name, label: m ? 'message' : 'profile' }); } : undefined} />
      <RemoveSheet item={removeFor} onClose={() => setRemoveFor(null)} onDone={load} />
    </Screen>
  );
}

// Latest message by a member, used when "Block and report" comes from the message menu.
const menuTarget = (msgs: ChatMessage[], memberId: string) => [...msgs].reverse().find((m) => m.author === memberId && m.kind === 'text' && !m.deleted_at && !m.removed_by);
