import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { ChevronDown, ChevronUp, Crown, Flame, Info, Share2, UserPlus, Users } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { eloPreview } from '@/lib/elo';
import { crownHistory, daysBetween, pairRatings, PROVISIONAL, splitLadder } from '@/lib/stats';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Icon, IconButton, Pill, Screen, T } from '@/ui';
import { AppBar } from '@/ui/appbar';
import { ShameCard } from '@/ui/badges-kit';
import { ChatRow } from '@/ui/chat-kit';
import { FirstMatchNudge } from '@/ui/first-match-nudge';
import { goChallenge, PlayerMenu } from '@/ui/player-menu';
import { SeasonBand } from '@/ui/season';

type Section = 'ranked' | 'new' | 'dormant';
type Item = { kind: 'row'; m: Member; rank: number | null; section: Section } | { kind: 'head'; key: string; section: 'new' | 'dormant'; count: number };

// R1 Ranks: crown (R1.4), the ladder, New players (R1.7), Dormant (R1.6, collapsed),
// pinned own row with next target (R1.3), long press menu (R1.8), Pairs link (R1.10), How ratings work (R9.1).
export default function Ranks() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, me, league, refresh } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const [showDormant, setShowDormant] = useState(false);
  const [menuFor, setMenuFor] = useState<Member | null>(null);
  const [meVisible, setMeVisible] = useState(true);
  const [crown, setCrown] = useState<{ id: string; days: number; defences: number } | null>(null);
  const [doubles, setDoubles] = useState(false);
  const list = useRef<FlatList<Item>>(null);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refresh(); setRefreshing(false); }, [refresh]);
  // The own row always has the key 'me', so this callback never needs to change.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<Item>[] }) => setMeVisible(viewableItems.some((v) => v.key === 'me')));

  const { ranked, fresh, dormant } = splitLadder(members);
  const king = ranked[0] ?? null;

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => {
      const [c, p] = await Promise.all([crownHistory(league.id, king?.id ?? null), pairRatings(league.id)]);
      setCrown(c.current ? { id: c.current.holder, days: daysBetween(c.current.from, null), defences: c.current.defences } : null);
      setDoubles(p.hasDoubles);
    })();
  }, [league, king?.id, members])); // eslint-disable-line react-hooks/exhaustive-deps

  const items: Item[] = [
    ...ranked.map((m, i): Item => ({ kind: 'row', m, rank: i + 1, section: 'ranked' })),
    ...(fresh.length ? [{ kind: 'head', key: 'h_new', section: 'new', count: fresh.length } as Item] : []),
    ...fresh.map((m): Item => ({ kind: 'row', m, rank: null, section: 'new' })),
    ...(dormant.length ? [{ kind: 'head', key: 'h_dormant', section: 'dormant', count: dormant.length } as Item] : []),
    ...(showDormant ? dormant.map((m): Item => ({ kind: 'row', m, rank: null, section: 'dormant' })) : []),
  ];
  const myIndex = items.findIndex((x) => x.kind === 'row' && x.m.id === me?.id);
  const mySection: Section | null = me ? (ranked.some((x) => x.id === me.id) ? 'ranked' : fresh.some((x) => x.id === me.id) ? 'new' : 'dormant') : null;

  const invite = () => Share.share({ message: `Join ${league?.name} on Liga. Code: ${league?.invite_code}` });

  // R1.3 next target copy (the card hides before the first match, the first match nudge covers it), never "you are last".
  const target = (): { text: string; who: Member | null } | null => {
    if (!me) return null;
    const played = me.wins + me.losses;
    if (!played) return { text: 'Play your first match to get on the ladder.', who: null };
    if (mySection === 'new') { const left = PROVISIONAL - played; return { text: `${left} more ${left === 1 ? 'match' : 'matches'} to get ranked.`, who: null }; }
    if (mySection === 'dormant') return { text: 'Play one match to rejoin the ladder.', who: null };
    const i = ranked.findIndex((x) => x.id === me.id);
    if (i === 0) return { text: 'You wear the crown. Every win defends it.', who: null };
    const above = ranked[i - 1];
    const win = eloPreview(me.rating, above.rating, league?.k_factor ?? 32).aWins;
    if (i === ranked.length - 1 && ranked.length > 2) return { text: `Beat anyone above you for ${signed(win)} or more.`, who: above };
    const gap = above.rating - me.rating + 1;
    const wins = Math.max(1, Math.ceil(gap / Math.max(win, 1)));
    return { text: `${gap} points to pass ${above.display_name}. About ${wins} ${wins === 1 ? 'win' : 'wins'}.`, who: above };
  };
  const goal = target();

  const status = (m: Member, section: Section) => {
    const n = m.wins + m.losses;
    if (m.guest) return `No account yet, ${m.wins}W ${m.losses}L`; // R10.5
    if (section === 'new') return `${n} of ${PROVISIONAL} matches`;
    if (section === 'dormant') return m.last_played_at ? `Last match ${new Date(m.last_played_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'No matches';
    return m.streak >= 2 ? `Streak W${m.streak}` : m.streak <= -2 ? `Streak L${-m.streak}` : `${m.wins}W ${m.losses}L`;
  };

  const jumpToMe = () => {
    if (mySection === 'dormant' && !showDormant) { setShowDormant(true); setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50); return; }
    if (myIndex >= 0) list.current?.scrollToIndex({ index: myIndex, viewPosition: 0.5, animated: true });
  };

  const row = (m: Member, rank: number | null, section: Section, pinned = false) => {
    const mine = m.id === me?.id;
    const dim = section === 'dormant';
    return (
      <Pressable accessibilityRole="button" accessibilityHint="Long press for quick actions"
        onPress={() => (pinned ? jumpToMe() : router.push(`/player/${m.id}`))}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenuFor(m); }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.sm,
          backgroundColor: pressed ? t.surface3 : mine ? t.surface2 : 'transparent' })}>
        {mine ? <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: t.brand }} /> : null}
        <T v="label" c={rank === 1 ? 'text' : 'text3'} style={{ width: 22, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{rank ?? ''}</T>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T v="heading" c={dim ? 'text3' : 'text'} numberOfLines={1}>{mine ? 'You' : m.display_name}</T>
            {m.streak >= 3 && section === 'ranked' ? <Icon as={Flame} size={15} color={t.warning} /> : null}
            {section === 'new' ? <Pill label="New" tone="brand" /> : null}
          </View>
          <T v="caption" c="text3">{status(m, section)}</T>
        </View>
        <T v="number" c={dim ? 'text3' : 'text'}>{fmt(m.rating)}{section === 'new' ? '?' : ''}</T>
      </Pressable>
    );
  };

  const sectionHead = (it: Extract<Item, { kind: 'head' }>) => it.section === 'new' ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space[5], paddingHorizontal: space[1] }}>
      <T v="label" c="text2" style={{ flex: 1 }}>New players, {it.count}</T>
      <IconButton icon={Info} tone="ghost" label="About new players" onPress={() => router.push({ pathname: '/elo', params: { topic: 'new' } })} />
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space[5], paddingHorizontal: space[1] }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDormant }} onPress={() => setShowDormant(!showDormant)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 }}>
        <T v="label" c="text2">Dormant, {it.count}</T>
        <Icon as={showDormant ? ChevronUp : ChevronDown} size={18} color={t.text2} />
      </Pressable>
      <IconButton icon={Info} tone="ghost" label="About dormant players" onPress={() => router.push('/dormant')} />
    </View>
  );

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space[2], paddingHorizontal: space[1] }}>
        <T v="title" style={{ flex: 1 }}>Ranks</T>
        {doubles ? <Button label="Pairs" icon={Users} size="sm" variant="secondary" onPress={() => router.push('/pairs')} /> : null}
      </View>
      <FirstMatchNudge />
      <ChatRow />
      <SeasonBand />
      <ShameCard />
      {king ? (
        <Card onPress={() => router.push('/crown')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], backgroundColor: t.surface }}>
          <Avatar name={king.display_name} colour={king.colour} jersey={king.jersey} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Pill label="Crown" tone="crown" icon={Crown} />
            <T v="section">{king.id === me?.id ? 'You' : king.display_name}</T>
            <T v="caption" c="text2">
              {fmt(king.rating)} rating{crown && crown.id === king.id ? `, ${crown.days ? `held ${crown.days} ${crown.days === 1 ? 'day' : 'days'}` : 'new today'}, defended ${crown.defences}×` : `, ${king.wins}W ${king.losses}L`}
            </T>
          </View>
        </Card>
      ) : members.length >= 2 ? (
        <Card style={{ gap: 4 }}>
          <T v="heading">No one wears the crown yet</T>
          <T v="small" c="text2">After {PROVISIONAL} matches players join the ladder. The top one takes the crown.</T>
        </Card>
      ) : null}
      {goal && mySection !== null && members.length >= 2 && me && me.wins + me.losses > 0 ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
          <View style={{ flex: 1 }}>
            <T v="label">Next target</T>
            <T v="caption" c="text2">{goal.text}</T>
          </View>
          {goal.who ? <Button label="Challenge" size="sm" variant="secondary" onPress={() => goChallenge(goal.who!.id)} /> : <Button label="Log" size="sm" variant="secondary" onPress={() => router.push('/log')} />}
        </Card>
      ) : null}
      {members.length < 2 ? (
        <Card style={{ alignItems: 'center', gap: space[3], paddingVertical: space[6] }}>
          <Icon as={UserPlus} size={28} />
          <T v="heading" center>Invite your first opponent</T>
          <T v="small" c="text2" center>Share the code. They join in under a minute.</T>
          <T v="display" style={{ letterSpacing: 2 }}>{league?.invite_code}</T>
          <Button label="Share invite" icon={Share2} onPress={invite} />
        </Card>
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ alignItems: 'center', paddingTop: space[4] }}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/elo')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <Icon as={Info} size={16} color={t.text2} />
        <T v="label" c="text2">How ratings work</T>
      </Pressable>
      {members.length >= 2 ? (
        <Pressable accessibilityRole="button" onPress={invite} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <Icon as={UserPlus} size={16} color={t.text2} />
          <T v="label" c="text2">Invite with code {league?.invite_code}</T>
        </Pressable>
      ) : null}
    </View>
  );

  const showPinned = !!me && mySection !== null && !meVisible;

  return (
    <Screen>
      <AppBar />
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(it) => (it.kind === 'head' ? it.key : it.m.id === me?.id ? 'me' : it.m.id)}
        renderItem={({ item }) => (item.kind === 'head' ? sectionHead(item) : row(item.m, item.rank, item.section))}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: showPinned ? 240 : 120, gap: 2 }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScrollToIndexFailed={(e) => { list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true }); }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.text2} />}
      />
      {showPinned && me ? (
        <View style={{ position: 'absolute', left: space[3], right: space[3], bottom: Math.max(insets.bottom, 8) + 84, borderRadius: radius.md, backgroundColor: t.overlay,
          borderWidth: 1, borderColor: t.line, padding: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
          {row(me, mySection === 'ranked' ? ranked.findIndex((x) => x.id === me.id) + 1 : null, mySection!, true)}
          {goal ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingBottom: 6 }}>
              <T v="caption" c="text2" style={{ flex: 1 }}>{goal.text}</T>
              {goal.who ? <Button label="Challenge" size="sm" variant="secondary" onPress={() => goChallenge(goal.who!.id)} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <PlayerMenu member={menuFor} me={me} leagueId={league?.id} onClose={() => setMenuFor(null)} />
    </Screen>
  );
}
