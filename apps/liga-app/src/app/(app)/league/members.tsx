// B4.7 League members, B4.7.1 and B3.2.1 Member actions, B3.2.2 Remove member, B3.5 Transfer ownership, R10.2 Restore
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MoreHorizontal, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canActOn, isAdmin, isOwner, leagueAdminInfo, removeMember, restoreMember, ROLE_LABEL, setRole, transferOwnership } from '@/lib/admin';
import { daysSince } from '@/lib/time';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Icon, Pill, Screen, Seg, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Snack = { text: string; undo?: () => Promise<void> };

const lastPlayed = (iso: string | null) => {
  const n = daysSince(iso);
  return n === Infinity ? 'no matches yet' : n === 0 ? 'played today' : n === 1 ? 'played yesterday' : `last played ${n} d ago`;
};
const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export default function LeagueMembers() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { transfer } = useLocalSearchParams<{ transfer?: string }>();
  const { session } = useAuth();
  const { league, me, members, refresh } = useLeague();
  const [tab, setTab] = useState<'active' | 'former'>('active');
  const [former, setFormer] = useState<Member[]>([]);
  const [sheet, setSheet] = useState<Member | null>(null);
  const [snack, setSnack] = useState<Snack | null>(null);

  const load = useCallback(async () => { if (league) setFormer((await leagueAdminInfo(league.id)).former); }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (!snack) return; const id = setTimeout(() => setSnack(null), 4000); return () => clearTimeout(id); }, [snack]);

  if (!league || !session) return null;
  const user = session.user;
  const archived = !!league.archived_at;
  const canEdit = isAdmin(me) && !archived;
  const picking = transfer === '1' && isOwner(me);
  const admins = members.filter((m) => m.role === 'admin');

  const run = async (fn: () => Promise<void>, ok?: Snack) => {
    setSheet(null);
    try { await fn(); await Promise.all([refresh(), load()]); if (ok) setSnack(ok); } catch (e) {
      if (e instanceof Error && e.message === 'number taken') Alert.alert('Number taken', 'Someone in the league wears that number now. Ask one of them to pick another, then restore.');
      else Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.');
    }
  };

  const toggleAdmin = (m: Member) => {
    const next = m.role === 'admin' ? 'member' : 'admin';
    run(() => setRole(user, m.id, next), {
      text: next === 'admin' ? `${m.display_name} is now an admin.` : `${m.display_name} is a member again.`,
      // Only the owner can demote an admin, so an admin gets no Undo after promoting someone.
      undo: next === 'admin' && !isOwner(me) ? undefined : () => run(() => setRole(user, m.id, next === 'admin' ? 'member' : 'admin')),
    });
  };

  const handOver = (m: Member) => {
    setSheet(null);
    Alert.alert(`Make ${m.display_name} the owner?`, `${m.display_name} can archive the league and manage everyone. You become an admin.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Transfer to ${m.display_name}`, onPress: () => run(() => transferOwnership(user, m.id), { text: `${m.display_name} owns ${league.name} now.` }).then(() => { if (picking) router.back(); }) },
    ]);
  };

  const remove = (m: Member) => {
    setSheet(null);
    Alert.alert(`Remove ${m.display_name} from ${league.name}?`, `${m.display_name} leaves the ladder. Matches stay in the history. You can restore them from Former players.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => removeMember(user, m.id), { text: `${m.display_name} was removed.`, undo: () => run(() => restoreMember(user, m.id)) }) },
    ]);
  };

  const restore = (m: Member) => run(() => restoreMember(user, m.id), { text: `${m.display_name} is back on the ladder.` });

  const rolePill = (m: Member) => m.role === 'member'
    ? <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: t.lineStrong, justifyContent: 'center' }}><T v="caption" c="text2">Member</T></View>
    : <Pill label={ROLE_LABEL[m.role]} tone={m.role === 'owner' ? 'brand' : 'neutral'} />;

  const row = (m: Member) => {
    const actionable = canEdit && canActOn(me, m);
    const pick = picking && m.role === 'admin';
    return (
      <Pressable key={m.id} accessibilityRole="button" accessibilityHint={actionable && !pick ? 'Opens member actions' : undefined} onPress={() => (pick ? handOver(m) : actionable ? setSheet(m) : router.push(`/player/${m.id}`))}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface })}>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={44} />
        <View style={{ flex: 1 }}>
          <T v="heading" numberOfLines={1}>{m.id === me?.id ? `${m.display_name}, you` : m.display_name}</T>
          <T v="caption" c="text3" numberOfLines={2}>{fmt(m.rating)} rating, {lastPlayed(m.last_played_at)}</T>
        </View>
        {rolePill(m)}
        {actionable && !picking ? <View style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon as={MoreHorizontal} size={20} color={t.text2} /></View> : null}
      </Pressable>
    );
  };

  const formerRow = (m: Member) => (
    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: t.surface }}>
      <Avatar name={m.display_name} colour={m.colour} ring={false} size={44} />
      <View style={{ flex: 1 }}>
        <T v="heading" c="text2" numberOfLines={1}>{m.display_name}</T>
        <T v="caption" c="text3" numberOfLines={1}>{m.status === 'removed' ? 'Removed' : 'Left'} {shortDate(m.left_at)}, {m.wins + m.losses} matches</T>
      </View>
      {canEdit ? <Button label="Restore" size="sm" variant="secondary" onPress={() => restore(m)} /> : null}
    </View>
  );

  const action = (label: string, onPress: () => void, danger = false) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingHorizontal: space[4], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : 'transparent' })}>
      <T v="heading" style={{ color: danger ? t.error : t.text }}>{label}</T>
    </Pressable>
  );

  return (
    <Screen>
      <Header title="Members" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 120 }}>
        {picking ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading">Choose the new owner</T>
            <T v="small" c="text2">{admins.length ? 'Tap an admin to hand the league over. You become an admin.' : 'Make someone an admin first, then come back here.'}</T>
          </Card>
        ) : null}
        <Seg value={tab} onChange={setTab} options={[{ value: 'active', label: `Active ${members.length}` }, { value: 'former', label: `Former ${former.length}` }]} />
        {tab === 'active' ? members.map(row) : former.length ? (
          <View style={{ gap: space[3] }}>
            <T v="small" c="text2">Former players keep their matches in the history. They are off the ladder.</T>
            {former.map(formerRow)}
          </View>
        ) : <Empty icon={Users} title="Nobody has left" body="Players who leave or are removed show up here with their match history." />}
        {!canEdit && !archived ? <T v="caption" c="text3" center>Owners and admins manage roles.</T> : null}
      </ScrollView>

      {snack ? (
        <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], paddingLeft: space[4], borderRadius: radius.md, backgroundColor: t.primary }}>
          <T v="label" c="onPrimary" style={{ flex: 1 }}>{snack.text}</T>
          {snack.undo ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { const u = snack.undo!; setSnack(null); u(); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}><T v="heading" c="onPrimary">Undo</T></Pressable> : null}
        </View>
      ) : null}

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: t.scrim }} onPress={() => setSheet(null)} />
        {sheet ? (
          <View style={{ backgroundColor: t.overlay, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[4], paddingBottom: insets.bottom + space[4], gap: space[1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[2], paddingBottom: space[3] }}>
              <Avatar name={sheet.display_name} colour={sheet.colour} jersey={sheet.jersey} size={44} />
              <View style={{ flex: 1 }}>
                <T v="heading">{sheet.display_name}</T>
                <T v="caption" c="text3">{ROLE_LABEL[sheet.role]}, number {sheet.jersey}</T>
              </View>
            </View>
            {action(sheet.role === 'admin' ? 'Remove admin role' : 'Make admin', () => toggleAdmin(sheet))}
            {isOwner(me) && sheet.role === 'admin' ? action('Transfer ownership', () => handOver(sheet)) : null}
            {action('View profile', () => { setSheet(null); router.push(`/player/${sheet.id}`); })}
            {action('Remove from league', () => remove(sheet), true)}
            {action('Cancel', () => setSheet(null))}
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}
