// K4 Inbox: every notice across your leagues. K4.1 filters, K4.3 swipe and long press, K4.5 top card.
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, BellOff, BellRing, Check, Inbox as InboxIcon, Settings, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, SectionList, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import {
  CATALOGUE, categoryOf, deleteNotice, getPrefs, hideInboxCard, inboxCardVisible, listNotices, markAllRead, markRead,
  onInboxChange, pushStatus, requestPush, restoreNotice, setPrefs, type InboxItem, type PushStatus,
} from '@/lib/inbox';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Card, Empty, Icon, IconButton, Screen, Skeleton, T } from '@/ui';
import { noticeLook, showBanner, useOpenNotice } from '@/ui/inbox-runtime';

type Filter = 'all' | 'unread' | 'challenges' | 'matches' | 'league';
const EMPTY: Record<Filter, [string, string]> = {
  all: ['No notifications yet', 'Challenges, matches and crown news will show up here.'],
  unread: ["You're all caught up", 'New notifications will show up here.'],
  challenges: ['No challenges', 'When someone challenges you, it shows up here.'],
  matches: ['No match news', 'When someone logs a match with you or reacts, it shows up here.'],
  league: ['No league news', 'Crown changes and ladder moves show up here.'],
};

const inHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ago = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'now' : min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d`;
};
const inFilter = (n: InboxItem, f: Filter) =>
  f === 'all' || (f === 'unread' ? !n.read : f === 'challenges' ? categoryOf(n.kind) === 'challenges' : f === 'matches' ? categoryOf(n.kind) === 'matches' : !['challenges', 'matches'].includes(categoryOf(n.kind)));

export default function Inbox() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { leagues } = useLeague();
  const open = useOpenNotice();
  const uid = session?.user.id;
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [push, setPush] = useState<{ status: PushStatus; card: boolean } | null>(null);
  const [menu, setMenu] = useState<InboxItem | null>(null);
  const [undo, setUndo] = useState<InboxItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [list, status, card] = await Promise.all([listNotices(uid), pushStatus(), inboxCardVisible()]);
      setItems(list); setPush({ status, card }); setFailed(false);
    } catch { setFailed(true); }
  }, [uid]);
  useFocusEffect(useCallback(() => { load(); return onInboxChange(load); }, [load]));
  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), 4000); return () => clearTimeout(id); }, [undo]);

  const shown = useMemo(() => (items ?? []).filter((n) => inFilter(n, filter) && (!leagueId || n.league_id === leagueId)), [items, filter, leagueId]);
  const sections = useMemo(() => {
    const start = todayStart();
    const today = shown.filter((n) => new Date(n.created_at) >= start), earlier = shown.filter((n) => new Date(n.created_at) < start);
    return [{ title: 'Today', data: today }, { title: 'Earlier', data: earlier }].filter((s) => s.data.length);
  }, [shown]);
  const unread = (items ?? []).filter((n) => !n.read).length;

  const remove = async (n: InboxItem) => {
    setMenu(null);
    await deleteNotice(n.id);
    setUndo(n);
  };
  const turnOffLike = async (n: InboxItem) => {
    setMenu(null);
    const p = await getPrefs(), cat = categoryOf(n.kind);
    const types = { ...p.types };
    CATALOGUE.filter((c) => c.category === cat).forEach((c) => { types[c.kind] = 'inbox'; });
    await setPrefs({ ...p, types });
    showBanner({ title: 'Push turned off for this kind', body: 'They still land in your inbox. Change it in settings.' });
  };
  const muteLeague = async (n: InboxItem) => {
    setMenu(null);
    const p = await getPrefs();
    const cur = p.leagues[n.league_id] ?? { level: 'default' as const, muteUntil: null };
    await setPrefs({ ...p, leagues: { ...p.leagues, [n.league_id]: { ...cur, muteUntil: inHours(8) } } });
    showBanner({ title: `${n.league_name} muted for 8 hours` });
  };

  const chip = (value: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} hitSlop={4}
      style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <T v="label" c={on ? 'onPrimary' : 'text'}>{label}</T>
    </Pressable>
  );

  const action = (label: string, bg: string, fg: string, icon: typeof Check, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ width: 88, marginBottom: space[2], borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Icon as={icon} size={20} color={fg} />
      <T v="caption" c={fg}>{label}</T>
    </Pressable>
  );

  const row = (n: InboxItem) => {
    const look = noticeLook(n.kind, t);
    return (
      <ReanimatedSwipeable
        friction={2}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={(_p, _t, s: SwipeableMethods) => action(n.read ? 'Unread' : 'Read', t.surface3, t.text, Check, () => { s.close(); markRead(n.id, !n.read); })}
        renderRightActions={() => action('Delete', t.error, '#FFFFFF', Trash2, () => remove(n))}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${n.body}`} accessibilityHint="Long press for more"
          onPress={() => open(n)} onLongPress={() => setMenu(n)}
          style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], padding: space[3], marginBottom: space[2], borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface })}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={look.icon} size={18} color={look.fg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body" style={{ fontFamily: n.read ? font.medium : font.semibold }} numberOfLines={2}>{n.title}</T>
            <T v="small" c="text2" numberOfLines={2}>{n.body}</T>
            <T v="caption" c="text3" style={{ marginTop: 2 }}>{leagues.length > 1 ? `${n.league_name}, ${ago(n.created_at)}` : ago(n.created_at)}</T>
          </View>
          {!n.read ? <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.brand, marginTop: 6 }} /> : null}
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  const menuRow = (label: string, icon: typeof Check, onPress: () => void, danger?: boolean) => (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : 'transparent' })}>
      <Icon as={icon} size={20} color={danger ? t.error : t.text} />
      <T v="heading" c={danger ? t.error : 'text'}>{label}</T>
    </Pressable>
  );

  const pushCard = () => {
    if (!push) return null;
    if (push.status === 'denied') return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Icon as={BellOff} size={20} color={t.text2} />
        <T v="small" c="text2" style={{ flex: 1 }}>Notifications are off for Liga.</T>
        <Button label="Open Settings" size="sm" variant="secondary" onPress={() => Linking.openSettings()} />
      </Card>
    );
    if (push.status !== 'undetermined' || !push.card) return null;
    return (
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
          <Icon as={BellRing} size={22} />
          <T v="heading" style={{ flex: 1 }}>{"Turn on notifications so you don't miss challenges"}</T>
          <IconButton icon={X} label="Hide for now" tone="ghost" onPress={async () => { await hideInboxCard(); load(); }} />
        </View>
        <Button label="Turn on" size="md" onPress={async () => { await requestPush(); load(); }} />
      </Card>
    );
  };

  const header = (
    <View style={{ gap: space[3], marginBottom: space[2] }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: 2 }}>
        {chip('all', 'All', filter === 'all', () => setFilter('all'))}
        {chip('unread', unread ? `Unread ${unread}` : 'Unread', filter === 'unread', () => setFilter('unread'))}
        {chip('challenges', 'Challenges', filter === 'challenges', () => setFilter('challenges'))}
        {chip('matches', 'Matches', filter === 'matches', () => setFilter('matches'))}
        {chip('league', 'League', filter === 'league', () => setFilter('league'))}
      </ScrollView>
      {leagues.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: 2 }}>
          {chip('lg_all', 'All leagues', !leagueId, () => setLeagueId(null))}
          {leagues.map((l) => chip(l.id, l.name, leagueId === l.id, () => setLeagueId(l.id)))}
        </ScrollView>
      ) : null}
      {pushCard()}
    </View>
  );

  const body = () => {
    if (failed) return <Empty icon={InboxIcon} title="Couldn't load" body="Check your connection and try again." action={<Button label="Retry" size="md" onPress={load} />} />;
    if (!items) return <View style={{ gap: space[2] }}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={84} />)}</View>;
    const [title, text] = EMPTY[filter];
    return <Empty icon={InboxIcon} title={title} body={text} />;
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="section" style={{ flex: 1 }}>Inbox</T>
        {unread ? <Button label="Mark all read" size="sm" variant="secondary" onPress={() => uid && markAllRead(uid)} /> : null}
        <IconButton icon={Settings} label="Notification settings" onPress={() => router.push('/notification-settings')} />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 80 }}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => <T v="label" c="text2" style={{ marginTop: space[3], marginBottom: space[2], paddingHorizontal: space[1] }}>{section.title}</T>}
        renderItem={({ item }) => row(item)}
        ListEmptyComponent={body()}
        ListFooterComponent={shown.length ? (
          <View style={{ alignItems: 'center', gap: 4, marginTop: space[6] }}>
            <T v="label" c="text2">{"You're all caught up"}</T>
            <T v="caption" c="text3" center>Notifications older than 90 days are cleared.</T>
          </View>
        ) : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.text2} />}
      />

      {undo ? (
        <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: space[8], flexDirection: 'row', alignItems: 'center', gap: space[3], paddingLeft: space[4], padding: space[2], borderRadius: radius.pill, backgroundColor: t.primary }}>
          <T v="label" c="onPrimary" style={{ flex: 1 }}>Deleted</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo delete" hitSlop={8} onPress={async () => { const n = undo; setUndo(null); const { league_name: _, ...rest } = n; await restoreNotice(rest); }}
            style={{ height: 36, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}>
            <T v="label" c="onPrimary">Undo</T>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable accessibilityLabel="Close menu" style={{ flex: 1, backgroundColor: t.scrim, justifyContent: 'flex-end' }} onPress={() => setMenu(null)}>
          {menu ? (
            <Pressable style={{ backgroundColor: t.overlay, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[3], paddingBottom: space[10], gap: 2 }}>
              <T v="label" c="text3" numberOfLines={1} style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}>{menu.title}</T>
              {menuRow(menu.read ? 'Mark as unread' : 'Mark as read', Check, () => { markRead(menu.id, !menu.read); setMenu(null); })}
              {menuRow('Turn off notifications like this', BellOff, () => turnOffLike(menu))}
              {menuRow(`Mute ${menu.league_name} for 8 hours`, BellOff, () => muteLeague(menu))}
              {menuRow('Delete', Trash2, () => remove(menu), true)}
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}
