import { router, useFocusEffect } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { keepReported, listBlocks, listReports, loadChat, saveChatSettings, setPinned, type ChatSettings, type ChatView } from '@/lib/chat';
import { sportOf } from '@/lib/sports';
import { dayLabel } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Icon, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { RemoveSheet, Sheet } from '@/ui/chat-kit';
import { Group, Header, Row } from '@/ui/list-row';

type Rep = Awaited<ReturnType<typeof listReports>>[number];
const GUIDELINES = [
  ['Banter is fine. Bullying isn’t.', 'Tease the result, never the person. No insults about looks, background or beliefs.'],
  ['No hate, threats or sexual content.', 'Hate speech, threats, violence and sexual content are removed, and the author can be removed from the league.'],
  ['Only share what you’re allowed to share.', 'No private information about anyone, no photos of people who did not agree to it.'],
  ['Report anything that crosses the line.', 'Long press a message or comment and choose Report. Reports are anonymous. Serious ones also reach the Liga team within 24 hours.'],
];

// K1.10 Chat info with pinned messages (K1.9), community guidelines (K12), blocked members (K10.2),
// and for admins the moderation queue (B4.8) and chat settings (K11.5).
export default function ChatInfo() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members } = useLeague();
  const [v, setV] = useState<ChatView | null>(null);
  const [reports, setReports] = useState<Rep[]>([]);
  const [blocked, setBlocked] = useState(0);
  const [rules, setRules] = useState(false);
  const [removeFor, setRemoveFor] = useState<{ kind: 'message' | 'comment'; id: string; author: string } | null>(null);

  const load = useCallback(async () => {
    if (!session || !league) return;
    const [x, r, b] = await Promise.all([loadChat(session.user, league.id), listReports(session.user, league.id), listBlocks(session.user)]);
    setV(x); setReports(r); setBlocked(b.length);
  }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? 'Former player';
  const set = async (patch: Partial<ChatSettings>) => {
    try { await saveChatSettings(session!.user, league!.id, patch); } catch (e) { Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Try again.'); }
    load();
  };
  const sport = sportOf(league?.sport);

  if (!v) return <Screen><Header title="Chat info" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={80} /><Skeleton h={160} /><Skeleton h={220} /></View></Screen>;
  const s = v.settings;

  const toggleRow = (label: string, value: boolean, on: (x: boolean) => void, first = false) => (
    <Row first={first} label={label} right={<Switch accessibilityLabel={label} value={value} onValueChange={on} trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />} />
  );
  const segRow = <V extends string>(label: string, value: V, options: { value: V; label: string }[], on: (x: V) => void) => (
    <View style={{ gap: space[2], padding: space[4], borderTopWidth: 1, borderTopColor: t.line }}>
      <T v="heading">{label}</T>
      <Seg value={value} onChange={on} options={options} />
    </View>
  );
  const reportCard = (r: Rep) => (
    <Card key={r.target_id} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="label" style={{ flex: 1 }}>{r.author ? nameOf(r.author) : 'Unknown'}, {r.target}</T>
        <Pill label={`Reported by ${r.count}`} tone="warning" />
      </View>
      <T c="text2" numberOfLines={3}>{r.snapshot || 'No text'}</T>
      <T v="caption" c="text3">{r.reasons.join(', ')}</T>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {r.target === 'message' || r.target === 'comment' ? <Button label="Remove" size="md" variant="danger" onPress={() => setRemoveFor({ kind: r.target as 'message' | 'comment', id: r.target_id, author: r.author ? nameOf(r.author) : 'The author' })} /> : null}
        <Button label={r.target === 'message' || r.target === 'comment' ? 'Keep' : 'Mark handled'} size="md" variant="secondary" onPress={async () => { await keepReported(session!.user, league!.id, r.target_id); load(); }} />
      </View>
    </Card>
  );

  return (
    <Screen>
      <Header title="Chat info" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={sport.icon} size={30} color={t.onBrand} />
          </View>
          <T v="heading">{league?.name}</T>
          <T v="caption" c="text3">{members.length} members</T>
        </View>

        <Group title={`Pinned, ${v.pins.length}`} footer={v.pins.length ? undefined : 'No pinned messages. Admins can pin from the message menu.'}>
          {v.pins.map((p, i) => (
            <View key={p.message.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingRight: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
              <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: '/chat', params: { msg: p.message.id } })}
                style={({ pressed }) => ({ flex: 1, gap: 4, padding: space[4], paddingRight: 0, backgroundColor: pressed ? t.surface3 : 'transparent' })}>
                <T numberOfLines={3}>{p.message.body}</T>
                <T v="caption" c="text3">{nameOf(p.message.author)}. Pinned by {nameOf(p.by)}, {dayLabel(p.at).replace(/^(Today|Yesterday)$/, (x) => x.toLowerCase())}</T>
              </Pressable>
              {v.admin ? <Button label="Unpin" size="sm" variant="secondary" onPress={async () => { await setPinned(session!.user, p.message.id, false); load(); }} /> : null}
            </View>
          ))}
        </Group>

        {v.admin ? (
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2" style={{ paddingHorizontal: space[1] }}>Moderation, {reports.length} open</T>
            {reports.length ? reports.map(reportCard) : <Card><T c="text2">Nothing reported. Good vibes.</T></Card>}
          </View>
        ) : null}

        {v.admin ? (
          <Group title="Chat settings" footer="The language filter can't be turned off. Standard blocks abuse and hate, Strict also hides swear words.">
            {segRow('Who can post', s.post, [{ value: 'everyone', label: 'Everyone' }, { value: 'admins', label: 'Admins only' }], (x) => set({ post: x }))}
            {segRow('Slow mode', String(s.slow) as '0' | '10' | '30' | '60', [{ value: '0', label: 'Off' }, { value: '10', label: '10 s' }, { value: '30', label: '30 s' }, { value: '60', label: '1 min' }], (x) => set({ slow: Number(x) }))}
            {segRow('Language filter', s.filter, [{ value: 'standard', label: 'Standard' }, { value: 'strict', label: 'Strict' }], (x) => set({ filter: x }))}
            {segRow('Auto hide after reports', String(s.autoHide) as '2' | '3' | '5', [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '5', label: '5' }], (x) => set({ autoHide: Number(x) }))}
            <View style={{ borderTopWidth: 1, borderTopColor: t.line }}>
              {toggleRow('Post matches to chat', s.matches, (x) => set({ matches: x }), true)}
              {toggleRow('Post crown changes', s.crown, (x) => set({ crown: x }))}
            </View>
          </Group>
        ) : null}

        <Group title="Members">
          {members.map((m, i) => (
            <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push(`/player/${m.id}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[4], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
              <Avatar name={m.display_name} colour={m.colour} size={36} />
              <T v="heading" style={{ flex: 1 }}>{m.display_name}</T>
              {m.role !== 'member' ? <T v="caption" c="text2">{m.role === 'owner' ? 'Owner' : 'Admin'}</T> : null}
            </Pressable>
          ))}
        </Group>

        <Group>
          <Row first label="Community guidelines" icon={ShieldCheck} onPress={() => setRules(true)} />
          <Row label="Blocked members" value={String(blocked)} onPress={() => router.push('/blocked')} />
        </Group>
      </ScrollView>

      <Sheet visible={rules} onClose={() => setRules(false)} title="Community guidelines">
        {GUIDELINES.map(([h, b]) => (
          <View key={h} style={{ gap: 4 }}>
            <T v="heading">{h}</T>
            <T c="text2">{b}</T>
          </View>
        ))}
        <Button label="Got it" full onPress={() => setRules(false)} />
      </Sheet>
      <RemoveSheet item={removeFor} onClose={() => setRemoveFor(null)} onDone={load} />
    </Screen>
  );
}
