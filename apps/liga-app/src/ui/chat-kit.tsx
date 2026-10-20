// Shared chat pieces: bottom sheet, reaction pills (K1.4), message actions (K1.1), who reacted (K1.5), mention picker (K1.6),
// composer, guidelines card (K12.1), report (K9.1, K9.2), block (K10.1), admin remove (K11.2) and the Ranks entry row.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronRight, MessageCircle, SendHorizontal, ShieldCheck, X } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { block, chatPreview, CHAT_REACTIONS, hideForMe, MAX_LEN, mentionParts, REMOVE_REASONS, removeContent, report, REPORT_REASONS, type ReportTarget } from '@/lib/chat';
import { isOn } from '@/lib/modules';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Icon, IconButton, T } from '@/ui';

// Double tap detection reads the clock in event handlers only.
export const tapTime = () => Date.now();
const fail = (e: unknown) => Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Try again.');

export function Sheet({ visible, onClose, children, title }: { visible: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: t.scrim }} />
        <View style={{ maxHeight: '88%', backgroundColor: t.overlay, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: insets.bottom + space[3] }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.lineStrong, marginTop: space[2] }} />
          {title ? <T v="section" style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>{title}</T> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space[4], gap: space[3] }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- text with @mentions ---------- */
export function Rich({ body, names, colour, onMention }: { body: string; names: string[]; colour: string; onMention?: (name: string) => void }) {
  return (
    <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colour }}>
      {mentionParts(body, names).map((p, i) => p.mention
        ? <Text key={i} onPress={() => onMention?.(p.text.slice(1))} style={{ fontFamily: font.bold }}>{p.text}</Text>
        : <Text key={i}>{p.text}</Text>)}
    </Text>
  );
}

/* ---------- K1.4 reaction pills ---------- */
export function ReactionPills({ reactions, counts, meId, onToggle, onLongPress }: {
  reactions?: { member_id: string; emoji: string }[]; counts?: { emoji: string; count: number; mine: boolean }[];
  meId?: string; onToggle: (emoji: string) => void; onLongPress?: () => void;
}) {
  const { t } = useTheme();
  const list = counts ?? [...new Set((reactions ?? []).map((r) => r.emoji))].map((emoji) => ({
    emoji, count: (reactions ?? []).filter((r) => r.emoji === emoji).length, mine: (reactions ?? []).some((r) => r.emoji === emoji && r.member_id === meId),
  }));
  if (!list.some((r) => r.count)) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {list.filter((r) => r.count).map(({ emoji: e, count: n, mine }) => (
        <Pressable key={e} accessibilityRole="button" accessibilityLabel={`${e} ${n}`} accessibilityState={{ selected: mine }} hitSlop={6}
          onPress={() => { Haptics.selectionAsync(); onToggle(e); }} onLongPress={onLongPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: mine ? t.primary : t.surface2 }}>
          <Text style={{ fontSize: 14 }}>{e}</Text>
          <Text style={{ fontFamily: font.semibold, fontSize: 13, color: mine ? t.onPrimary : t.text2 }}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- K1.1 message actions ---------- */
export type Action = { label: string; run: () => void; danger?: boolean };
export function ActionSheet({ visible, onClose, preview, react, mine, actions, emojis = CHAT_REACTIONS }: {
  visible: boolean; onClose: () => void; preview?: string; react?: (emoji: string) => void; mine?: string[]; actions: Action[]; emojis?: readonly string[];
}) {
  const { t } = useTheme();
  const safe = actions.filter((a) => !a.danger), danger = actions.filter((a) => a.danger);
  const go = (fn: () => void) => () => { onClose(); setTimeout(fn, 250); };
  const list = (items: Action[]) => (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
      {items.map((a, i) => (
        <Pressable key={a.label} accessibilityRole="button" onPress={go(a.run)}
          style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
          <T v="heading" c={a.danger ? 'error' : 'text'}>{a.label}</T>
        </Pressable>
      ))}
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose}>
      {react ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: t.surface, borderRadius: radius.pill, padding: 4 }}>
          {emojis.map((e) => {
            const on = mine?.includes(e);
            return (
              <Pressable key={e} accessibilityRole="button" accessibilityLabel={`React ${e}`} accessibilityState={{ selected: on }} onPress={go(() => react(e))}
                style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : pressed ? t.surface3 : 'transparent' })}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {preview ? <View style={{ backgroundColor: t.surface2, borderRadius: radius.md, padding: space[3] }}><T v="small" c="text2" numberOfLines={4}>{preview}</T></View> : null}
      {safe.length ? list(safe) : null}
      {danger.length ? list(danger) : null}
    </Sheet>
  );
}

/* ---------- K1.5 who reacted ---------- */
export function WhoReacted({ reactions, members, meId, onClose, onToggle }: {
  reactions: { member_id: string; emoji: string }[] | null; members: Member[]; meId?: string; onClose: () => void; onToggle?: (emoji: string) => void;
}) {
  const { t } = useTheme();
  const [tab, setTab] = useState('All');
  const list = reactions ?? [];
  const emojis = [...new Set(list.map((r) => r.emoji))];
  const shown = tab === 'All' ? list : list.filter((r) => r.emoji === tab);
  const people = [...new Set(shown.map((r) => r.member_id))].sort((a, b) => (a === meId ? -1 : b === meId ? 1 : 0));
  const tabBtn = (label: string, n: number) => (
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: tab === label }} onPress={() => setTab(label)}
      style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: tab === label ? t.primary : t.surface2 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: tab === label ? t.onPrimary : t.text }}>{label} {n}</Text>
    </Pressable>
  );
  return (
    <Sheet visible={!!reactions} onClose={onClose} title="Reactions">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {tabBtn('All', list.length)}
        {emojis.map((e) => tabBtn(e, list.filter((r) => r.emoji === e).length))}
      </View>
      {!people.length ? <T c="text2">Be the first to react</T> : null}
      {people.map((id) => {
        const m = members.find((x) => x.id === id);
        const mine = id === meId;
        return (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 }}>
            {m ? <Avatar name={m.display_name} colour={m.colour} size={36} /> : null}
            <T v="heading" style={{ flex: 1 }}>{mine ? 'You' : m?.display_name ?? 'Former player'}</T>
            {shown.filter((r) => r.member_id === id).map((r) => (
              <Pressable key={r.emoji} disabled={!mine || !onToggle} accessibilityLabel={mine ? `Remove ${r.emoji}` : r.emoji} onPress={() => { onToggle?.(r.emoji); onClose(); }} hitSlop={8}>
                <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </Sheet>
  );
}

/* ---------- K12.1 guidelines ---------- */
export function GuidelinesCard({ onAgree }: { onAgree: () => void }) {
  const { t } = useTheme();
  const lines = ["Banter is fine. Bullying isn't.", 'No hate, threats or sexual content.', "Only share photos you're allowed to share.", 'Report anything that crosses the line.'];
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
      <T v="heading">Keep it friendly</T>
      {lines.map((l) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Icon as={ShieldCheck} size={18} color={t.text2} />
          <T v="small" c="text2" style={{ flex: 1 }}>{l}</T>
        </View>
      ))}
      <Button label="I agree" onPress={onAgree} full />
    </View>
  );
}

/* ---------- composer with K1.6 mention picker ---------- */
export function Composer({ value, onChange, onSend, placeholder, members, everyone, replying, onCancelReply, editing, waitS = 0, busy, autoFocus }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; members: Member[]; everyone?: number;
  replying?: string | null; onCancelReply?: () => void; editing?: boolean; waitS?: number; busy?: boolean; autoFocus?: boolean;
}) {
  const { t } = useTheme();
  const q = /(^|\s)@([^\s@]*)$/.exec(value)?.[2];
  const ql = q?.toLowerCase() ?? '';
  const hits = q === undefined ? [] : members.filter((m) => m.display_name.toLowerCase().split(' ').some((w) => w.startsWith(ql)) || m.display_name.toLowerCase().startsWith(ql)).slice(0, 5);
  const showEveryone = q !== undefined && everyone !== undefined && 'everyone'.startsWith(ql);
  const insert = (name: string) => { Haptics.selectionAsync(); onChange(value.replace(/@([^\s@]*)$/, `@${name} `)); };
  const left = MAX_LEN - value.length;
  const can = !!value.trim() && left >= 0 && !busy && waitS <= 0;
  return (
    <View style={{ gap: space[2] }}>
      {q !== undefined ? (
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
          {showEveryone ? (
            <Pressable accessibilityRole="button" onPress={() => insert('everyone')} style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : 'transparent' })}>
              <T v="heading">@everyone</T>
              <T v="caption" c="text3">Notify all {everyone} members</T>
            </Pressable>
          ) : null}
          {hits.map((m, i) => (
            <Pressable key={m.id} accessibilityRole="button" onPress={() => insert(m.display_name)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i || showEveryone ? 1 : 0, borderTopColor: t.line })}>
              <Avatar name={m.display_name} colour={m.colour} size={30} />
              <T v="heading" style={{ flex: 1 }}>{m.display_name}</T>
              <T v="caption" c="text3">#{m.jersey}</T>
            </Pressable>
          ))}
          {!hits.length && !showEveryone ? <T v="small" c="text2" style={{ padding: space[4] }}>No one called {q} in this league</T> : null}
        </View>
      ) : null}
      {replying || editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: space[3] }}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: t.brand }} />
          <T v="label" c="text2" style={{ flex: 1 }} numberOfLines={1}>{editing ? 'Editing message' : `Replying to ${replying}`}</T>
          <IconButton icon={X} tone="ghost" label={editing ? 'Cancel edit' : 'Cancel reply'} onPress={onCancelReply} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.text3} multiline autoFocus={autoFocus} maxLength={MAX_LEN + 50}
          accessibilityLabel={placeholder}
          style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: t.surface2, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, color: t.text, fontFamily: font.regular, fontSize: 16 }} />
        {waitS > 0 ? (
          <View style={{ height: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: t.surface2, justifyContent: 'center' }}><T v="label" c="text3">Wait {waitS} s</T></View>
        ) : (
          <IconButton icon={editing ? Check : SendHorizontal} tone={can ? 'primary' : 'surface'} label={editing ? 'Save edit' : 'Send'} onPress={can ? onSend : undefined} />
        )}
      </View>
      {value.length > 900 ? <T v="caption" c={left < 0 ? 'error' : 'text3'} style={{ textAlign: 'right' }}>{left} left</T> : null}
    </View>
  );
}

/* ---------- K9 report, K10 block, K11.2 remove ---------- */
export type ReportReq = { leagueId: string; target: ReportTarget; targetId: string; author: Member | null; snapshot: string; label: string };

export function ReportSheet({ req, onClose, leagueName }: { req: ReportReq | null; onClose: () => void; leagueName?: string }) {
  const { session } = useAuth();
  const { t } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sent, setSent] = useState<{ onlyAdmin: boolean; blocked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const who = req?.author?.display_name;
  const close = () => { setReason(null); setNote(''); setAlsoBlock(false); setSent(null); onClose(); };
  const send = async () => {
    if (!req || !reason) return;
    setBusy(true);
    try {
      const r = await report(session!.user, { leagueId: req.leagueId, target: req.target, targetId: req.targetId, author: req.author?.id ?? null, reason, note, snapshot: req.snapshot, alsoBlock });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent({ onlyAdmin: r.onlyAdminIsAuthor, blocked: alsoBlock });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const after = async (fn: () => Promise<unknown>) => { try { await fn(); close(); } catch (e) { fail(e); } };

  return (
    <Sheet visible={!!req} onClose={close} title={sent ? undefined : `Report ${req?.label ?? ''}`}>
      {sent ? (
        <View style={{ gap: space[3], alignItems: 'center', paddingTop: space[2] }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.win, alignItems: 'center', justifyContent: 'center' }}><Icon as={Check} size={28} color={t.onWin} /></View>
          <T v="heading" center>Thanks for letting us know</T>
          <T v="small" c="text2" center>
            {sent.onlyAdmin && who ? `Because ${who} is the only admin, this report goes straight to the Liga team.` : `The admins of ${leagueName ?? 'your league'} will review it. Serious reports also go to the Liga team. We usually respond within 24 hours.`}
          </T>
          {req?.author && who && !sent.blocked ? <Button label={`Block ${who}`} variant="secondary" full onPress={() => after(() => block(session!.user, req.author!.id))} /> : null}
          {req && (req.target === 'message' || req.target === 'comment') ? <Button label="Hide this for me" variant="secondary" full onPress={() => after(() => hideForMe(session!.user, req.targetId))} /> : null}
          <Button label="Done" full onPress={close} />
        </View>
      ) : (
        <>
          <T v="small" c="text2">Your report is anonymous.{who ? ` ${who} won't know it was you.` : ''}</T>
          <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
            {REPORT_REASONS.map((r, i) => (
              <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} onPress={() => setReason(r)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space[4], gap: space[3], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
                <T v="heading" style={{ flex: 1 }}>{r}</T>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: reason === r ? t.primary : t.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                  {reason === r ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} /> : null}
                </View>
              </Pressable>
            ))}
          </View>
          {reason === 'Self-harm' ? (
            <View style={{ backgroundColor: t.warning, borderRadius: radius.md, padding: space[3] }}>
              <T v="label" c="onCrown">If someone is in danger, contact local emergency services.</T>
            </View>
          ) : null}
          <TextInput value={note} onChangeText={setNote} placeholder="Add details (optional)" placeholderTextColor={t.text3} multiline maxLength={500} accessibilityLabel="Add details"
            style={{ minHeight: 80, borderRadius: radius.sm, backgroundColor: t.surface2, padding: 14, color: t.text, fontFamily: font.regular, fontSize: 16, textAlignVertical: 'top' }} />
          {req?.author && who ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 }}>
              <View style={{ flex: 1 }}>
                <T v="heading">Also block {who}</T>
                <T v="caption" c="text3">Separate from the report. You can undo it later.</T>
              </View>
              <Switch accessibilityLabel={`Also block ${who}`} value={alsoBlock} onValueChange={setAlsoBlock} trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />
            </View>
          ) : null}
          <Button label="Send report" disabled={!reason} loading={busy} onPress={send} full />
        </>
      )}
    </Sheet>
  );
}

export function BlockSheet({ member, onClose, onReport, challenges }: { member: Member | null; onClose: () => void; onReport?: () => void; challenges?: boolean }) {
  const { session } = useAuth();
  const { t } = useTheme();
  const n = member?.display_name ?? '';
  const lines = [
    `You won't see ${n}'s messages or comments.`,
    challenges ? `${n} can't mention you or challenge you.` : `${n} can't mention you.`,
    `You won't get notifications about ${n}.`,
    `${n} stays in the league. Matches you play together still count.`,
    `${n} won't be told.`,
  ];
  const run = async (thenReport: boolean) => {
    if (!member) return;
    try {
      await block(session!.user, member.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      if (thenReport) setTimeout(() => onReport?.(), 300);
      else Alert.alert(`${n} is blocked`, 'You can unblock in Blocked members.', [{ text: 'OK' }, { text: 'Manage', onPress: () => router.push('/blocked') }]);
    } catch (e) { fail(e); }
  };
  return (
    <Sheet visible={!!member} onClose={onClose} title={`Block ${n}?`}>
      {lines.map((l) => (
        <View key={l} style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.text2, marginTop: 8 }} />
          <T c="text2" style={{ flex: 1 }}>{l}</T>
        </View>
      ))}
      <Button label="Block" variant="danger" full onPress={() => run(false)} />
      {onReport ? <Button label="Block and report" variant="secondary" full onPress={() => run(true)} /> : null}
      <Button label="Cancel" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

export function RemoveSheet({ item, onClose, onDone }: { item: { kind: 'message' | 'comment'; id: string; author: string } | null; onClose: () => void; onDone: () => void }) {
  const { session } = useAuth();
  const { t } = useTheme();
  const [reason, setReason] = useState(REMOVE_REASONS[0]);
  const go = async () => {
    if (!item) return;
    try { await removeContent(session!.user, item.kind, item.id, reason); onClose(); onDone(); } catch (e) { fail(e); }
  };
  return (
    <Sheet visible={!!item} onClose={onClose} title={item?.kind === 'comment' ? 'Remove this comment?' : 'Remove this message?'}>
      <T c="text2">Everyone will see Removed by an admin. {item?.author} will be told which guideline it broke.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {REMOVE_REASONS.map((r) => (
          <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} onPress={() => setReason(r)}
            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: reason === r ? t.primary : t.surface2 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 14, color: reason === r ? t.onPrimary : t.text }}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Remove" variant="danger" full onPress={go} />
      <Button label="Cancel" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/* ---------- entry on Ranks (note 00: a League chat row at the top, last message and unread count) ---------- */
export function ChatRow() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [p, setP] = useState<{ text: string | null; unread: number } | null>(null);
  const on = isOn(league, 'chat');
  useFocusEffect(useCallback(() => {
    if (!league || !session || !on) return;
    let live = true;
    const tick = () => chatPreview(session.user, league.id).then((x) => { if (live) setP(x); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 8000);
    return () => { live = false; clearInterval(iv); };
  }, [league, session, on]));
  if (!on) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={p?.unread ? `League chat, ${p.unread} new` : 'League chat'} onPress={() => router.push('/chat')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface })}>
      <Icon as={MessageCircle} size={20} />
      <View style={{ flex: 1 }}>
        <T v="label">League chat</T>
        <T v="caption" c="text2" numberOfLines={1}>{p?.text ?? 'Say hi to your league'}</T>
      </View>
      {p?.unread ? (
        <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.bold, fontSize: 12, color: t.onBrand }}>{Math.min(p.unread, 99)}</Text>
        </View>
      ) : <Icon as={ChevronRight} size={18} color={t.text3} />}
    </Pressable>
  );
}
