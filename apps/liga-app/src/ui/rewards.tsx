// Shared pieces of the Coins, Quests and Awards modules: the app bar coin pill (G6 entry) and the Arena card
// (G10 hero card for 48 hours, weekly quests progress, awards archive link).
import { router, useFocusEffect, type Href } from 'expo-router';
import {
  CalendarCheck, Coins, Crown, Flame, Gift, Layers, Medal, ShoppingBag, Ticket, MessageCircle, Swords, Target, Trophy, UserPlus, Users, Zap, type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { awardsHome, heroOf, type Award, type AwardKey } from '@/lib/awards';
import { coinBalance, reportEntry, type Line, type Reason } from '@/lib/coins';
import { dayHm } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { questBoard, type Board, type QuestId } from '@/lib/quests';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { clock, dayLabel } from '@/lib/time';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Card, Icon, T } from '@/ui';

export const QUEST_ICON: Record<QuestId, LucideIcon> = {
  play15: Swords, win5: Trophy, people5: Users, duo: Users, upset: Zap, cup: Trophy, comment5: MessageCircle,
};
export const REASON_ICON: Record<Reason, LucideIcon> = { match: Swords, win: Trophy, upset: Zap, cup: Trophy, quest: Target, award: Medal, shop: ShoppingBag, cards: Layers, pass: Ticket, chest: Gift, tip: Target };
export const AWARD_ICON: Record<AwardKey, LucideIcon> = {
  mvp: Crown, upset: Target, newcomer: UserPlus, busiest: Flame, iron: CalendarCheck, motw: Medal,
};

// Coin balance in the app bar; hidden when the league has Coins off.
export function CoinPill() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [n, setN] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    if (session && league && isOn(league, 'coins')) (async () => setN(await coinBalance(session.user, league.id)))();
  }, [session, league]));
  if (!isOn(league, 'coins') || n === null) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Coins, ${fmt(n)}`} onPress={() => router.push('/coins')}
      style={({ pressed }) => ({ height: 44, justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.surface2 }}>
        <Icon as={Coins} size={16} color={t.crown} />
        <T v="label" style={{ fontVariant: ['tabular-nums'] }}>{fmt(n)}</T>
      </View>
    </Pressable>
  );
}

// Arena entry card: the awards story for 48 hours after the ceremony, then quests and the archive.
export function ArenaRewards() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const [board, setBoard] = useState<Board | null>(null);
  const [award, setAward] = useState<{ hero: Award | null; next: string; any: boolean } | null>(null);
  const questsOn = isOn(league, 'coins') && isOn(league, 'quests');
  const awardsOn = isOn(league, 'awards');

  useFocusEffect(useCallback(() => {
    if (!session || !league) return;
    (async () => {
      const [b, h] = await Promise.all([
        isOn(league, 'coins') && isOn(league, 'quests') ? questBoard(session.user, league.id) : null,
        isOn(league, 'awards') ? awardsHome(league.id) : null,
      ]);
      setBoard(b); setAward(h ? { hero: heroOf(h.latest), next: dayHm(h.next, h.tz), any: h.list.length > 0 } : null);
    })();
  }, [session, league]));

  if (!me || (!questsOn && !awardsOn)) return null;
  const name = (id: string) => (id === me.id ? 'You' : members.find((m) => m.id === id)?.display_name ?? 'Someone');
  const hero = awardsOn ? award?.hero : null;
  const mvp = hero?.items.find((x) => x.key === 'mvp');
  const mine = hero?.items.filter((x) => x.members.includes(me.id)) ?? [];

  return (
    <View style={{ gap: space[2] }}>
      {hero ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/awards/${hero.id}`)}
          style={({ pressed }) => ({ backgroundColor: t.brand, borderRadius: radius.md, padding: space[4], gap: space[2], transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon as={Medal} size={22} color={t.onBrand} />
            <T v="section" c="onBrand" style={{ flex: 1 }}>Week {hero.week_no} awards</T>
          </View>
          <T v="body" c="onBrand">{mine.length ? `You won ${mine.map((x) => x.label).join(' and ')}.` : mvp ? `${name(mvp.members[0])} is player of the week.` : 'See who won what.'}</T>
          <T v="label" c="onBrand">Watch the ceremony</T>
        </Pressable>
      ) : null}
      {questsOn && board?.on && !board.guest ? (
        <Card onPress={() => router.push('/quests')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: board.ready ? t.win : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={Target} size={22} color={board.ready ? t.onWin : t.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading">Weekly quests</T>
            <T v="small" c="text2">{board.ready ? `${board.ready} ready to claim` : board.done === board.quests.length ? 'All done this week' : `${board.done} of ${board.quests.length} done`}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {board.quests.map((q) => <View key={q.id} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: q.state === 'progress' ? t.lineStrong : t.win }} />)}
          </View>
        </Card>
      ) : null}
      {awardsOn && !hero ? (
        <Card onPress={() => router.push('/awards')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={Medal} size={22} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading">Weekly awards</T>
            <T v="small" c="text2">{award ? `Next ceremony ${award.next}${award.any ? ', past weeks inside' : ''}` : 'Every Friday at 16:00'}</T>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

// G6.1 ledger row: icon, reason, time, amount (earned in green, corrections neutral, never red), running balance.
export function LedgerRow({ e, first, onPress }: { e: Line; first?: boolean; onPress?: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2],
        backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: first ? 0 : 1, borderTopColor: t.line })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={REASON_ICON[e.reason]} size={18} color={t.text2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" numberOfLines={2}>{e.label}</T>
        <T v="caption" c="text3">{clock(e.at)}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T v="heading" c={e.amount > 0 ? 'win' : 'text2'} style={{ fontVariant: ['tabular-nums'] }}>{signed(e.amount)}</T>
        <T v="caption" c="text3" style={{ fontVariant: ['tabular-nums'] }}>{fmt(e.running)}</T>
      </View>
    </Pressable>
  );
}

// Groups ledger rows by day (newest first) for rendering.
export function byDay(rows: Line[]) {
  const out: { day: string; rows: Line[] }[] = [];
  for (const e of rows) {
    const day = dayLabel(e.at);
    if (out[out.length - 1]?.day !== day) out.push({ day, rows: [] });
    out[out.length - 1].rows.push(e);
  }
  return out;
}

// G6.2 Transaction detail sheet.
export function EntrySheet({ e, onClose }: { e: Line | null; onClose: () => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const target = e?.href ?? null;
  const open = e?.ref.startsWith('match:') ? 'Open match' : e?.reason === 'cup' ? 'Open the cup' : e?.reason === 'quest' ? 'Open quests' : e?.reason === 'award' ? 'Open the awards' : null;
  const report = async () => {
    if (!e || !session) return;
    setBusy(true);
    try { await reportEntry(session.user, e.id, ''); Alert.alert('Sent to the admins', 'They can see this entry and will get back to you.'); onClose(); }
    catch { Alert.alert('Could not send', 'Check your connection and try again.'); }
    setBusy(false);
  };
  return (
    <Modal visible={!!e} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: t.scrim }} />
      {e ? (
        <View style={{ backgroundColor: t.overlay, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[4], paddingBottom: insets.bottom + space[4], gap: space[3] }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.lineStrong }} />
          <View style={{ alignItems: 'center', gap: space[1], paddingVertical: space[2] }}>
            <T v="bigNumber" c={e.amount > 0 ? 'win' : 'text'}>{signed(e.amount)}</T>
            <T v="heading" center>{e.label}</T>
            <T v="small" c="text2">{dayLabel(e.at)}, {clock(e.at)}</T>
            <T v="caption" c="text3">Balance after: {fmt(e.running)} coins</T>
          </View>
          {e.label.includes('deleted') ? <T v="small" c="text2" center>Match deleted, coins reversed.</T> : null}
          {open && target ? <Button label={open} variant="secondary" size="md" onPress={() => { onClose(); router.push(target as Href); }} /> : null}
          <Button label="Report a problem" variant="ghost" size="md" loading={busy} onPress={report} />
        </View>
      ) : null}
    </Modal>
  );
}
