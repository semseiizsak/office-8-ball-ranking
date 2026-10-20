// A15.1 Is this you? (after joining), A15.4 You already have a player here
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { claimCandidates, claimGuest, type Candidate } from '@/lib/guests';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Screen, Skeleton, T } from '@/ui';

const plural = (n: number) => `${n} ${n === 1 ? 'match' : 'matches'}`;

export default function Claim() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me, reloadLeagues, refresh } = useLeague();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { if (league && session) setList(await claimCandidates(session.user, league.id)); }, [league, session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const done = () => { if (router.canDismiss()) router.dismissAll(); router.replace('/'); };

  const take = async (c: Candidate) => {
    if (!league || !session) return;
    setBusy(c.member.id);
    try {
      const res = await claimGuest(session.user, league.id, c.member.id);
      await reloadLeagues(league.id); await refresh();
      Alert.alert(`You're ${res.name} now`, `${plural(res.matches)} and a ${fmt(res.rating)} rating are yours.`, [{ text: 'Open league', onPress: done }]);
    } catch (e) {
      const playing = String(e).includes('already playing');
      Alert.alert(
        playing ? 'You already have a player here' : 'That did not work',
        playing && me ? `You already play here as ${me.display_name} #${me.jersey} (${plural(me.wins + me.losses)}). An admin can merge the two players later.` : 'Nothing was changed. Try again in a moment.',
      );
      load();
    }
    setBusy(null);
  };

  const confirm = (c: Candidate) => Alert.alert(
    `Claim ${c.member.display_name}?`,
    `You'll keep ${plural(c.matches)} and a ${fmt(c.member.rating)} rating.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Claim', onPress: () => take(c) }],
  );

  const row = (c: Candidate) => (
    <Pressable key={c.member.id} accessibilityRole="button" accessibilityLabel={`Claim ${c.member.display_name}`} disabled={!!busy} onPress={() => confirm(c)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], minHeight: 64, borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface })}>
      <Avatar name={c.member.display_name} colour={c.member.colour} jersey={c.member.jersey} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading" numberOfLines={1}>{c.member.display_name}</T>
        <T v="caption" c="text3" numberOfLines={1}>#{c.member.jersey}, {fmt(c.member.rating)}, {plural(c.matches)}{c.addedBy ? `, added by ${c.addedBy}` : ''}</T>
      </View>
    </Pressable>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space[6], gap: space[4] }}>
        <T v="title">Are you already on the ladder?</T>
        <T v="body" c="text2">Someone may have added you before you joined. Pick yourself to keep your matches.</T>
        {list === null ? [0, 1].map((i) => <Skeleton key={i} h={64} />) : list.length ? list.map(row) : (
          <T v="small" c="text3">No players are waiting to be claimed in this league.</T>
        )}
      </ScrollView>
      <View style={{ padding: space[6], paddingTop: 0 }}>
        <Button label="No, I'm new" variant="secondary" onPress={done} />
      </View>
    </Screen>
  );
}
