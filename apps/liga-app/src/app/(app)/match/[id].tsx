import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { isOn } from '@/lib/modules';
import { canEditMatch, deleteMatch, getMatch, toggleReaction, type MatchDetail } from '@/lib/api';
import { dayLabel, clock } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, font, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, IconButton, Pill, Screen, Skeleton, T } from '@/ui';
import { MatchComments, MatchHeaderActions } from '@/ui/match-comments';

// M5 Match detail: result, rating breakdown, reactions, edit and delete inside the window.
export default function MatchScreen() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { members, me, refresh, league } = useLeague();
  const [m, setM] = useState<MatchDetail | null | undefined>(undefined);
  const [perm, setPerm] = useState<{ allowed: boolean; minutesLeft: number; admin: boolean } | null>(null);

  const load = useCallback(async () => {
    setM(await getMatch(id, session!.user.id));
    setPerm(await canEditMatch(session!.user, id));
  }, [id, session]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (m === undefined) {
    return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={220} /><Skeleton h={160} /></View></Screen>;
  }
  if (m === null) {
    return (
      <Screen>
        <View style={{ padding: space[4], gap: space[4] }}>
          <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
          <T v="heading">This match was removed</T>
          <T c="text2">Someone deleted it, so the ratings were recalculated without it.</T>
        </View>
      </Screen>
    );
  }

  const byId = new Map(members.map((x) => [x.id, x]));
  const side = (s: 'a' | 'b') => m.match_players.filter((p) => p.side === s);
  const delta = (s: 'a' | 'b') => side(s)[0]?.delta ?? 0;
  const score = m.score_a != null && m.score_b != null;
  const st = m.status, live = st === 'pending' || st === 'disputed';
  const confirmMod = isOn(league, 'confirm');
  const banner = { pending: 'Waiting for confirmation. Ratings move once it counts.', disputed: 'Disputed. Ratings stay frozen until it is settled.', no_show: 'No show reported. Waiting for a reply.', walkover: 'Walkover. No rating change for a walkover.', void: 'This match does not count.' };
  const name = (mid: string) => (mid === me?.id ? 'You' : byId.get(mid)?.display_name ?? 'Former player');

  const sideView = (s: 'a' | 'b') => {
    const won = m.winner === s;
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
        <View style={{ flexDirection: 'row' }}>
          {side(s).map((p, i) => {
            const pl = byId.get(p.member_id);
            return pl ? (
              <Pressable key={p.member_id} onPress={() => router.push(`/player/${p.member_id}`)} style={{ marginLeft: i ? -14 : 0 }}>
                <Avatar name={pl.display_name} colour={pl.colour} jersey={side(s).length === 1 ? pl.jersey : undefined} size={side(s).length === 1 ? 72 : 56} />
              </Pressable>
            ) : null;
          })}
        </View>
        <T v="heading" c={won ? 'text' : 'text2'} center numberOfLines={2}>{side(s).map((p) => name(p.member_id)).join(' and ')}</T>
        {st && !live ? <Pill label={won ? (st === 'walkover' ? 'Won, walkover' : 'Won') : st === 'walkover' ? 'No show' : 'Lost'} tone={won && st === 'walkover' ? 'win' : 'neutral'} />
          : won ? <Pill label={`Won ${signed(delta(s))}`} tone={live ? 'neutral' : 'win'} /> : <Pill label={`Lost ${signed(delta(s))}`} tone={live ? 'neutral' : 'loss'} />}
      </View>
    );
  };

  const react = async (emoji: string) => {
    Haptics.selectionAsync();
    await toggleReaction(session!.user, m.id, emoji);
    load();
  };

  const remove = () => Alert.alert('Delete this match?', 'Ratings are recalculated as if it never happened. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteMatch(session!.user, m.id); await refresh(); router.back(); } },
  ]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <MatchHeaderActions match={m} />
        {perm?.allowed ? (
          <>
            <IconButton icon={Pencil} label="Edit result" onPress={() => router.push({ pathname: '/log', params: { edit: m.id } })} />
            <IconButton icon={Trash2} label="Delete match" onPress={remove} />
          </>
        ) : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <T v="label" c="text2">{dayLabel(m.played_at)}, {clock(m.played_at)}</T>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Pill label={m.format} />
            {st ? <Pill label={{ pending: 'Pending', disputed: 'Disputed', no_show: 'No show', walkover: 'Walkover', void: 'Not counted' }[st]} tone={st === 'disputed' ? 'warning' : 'neutral'} /> : null}
          </View>
        </View>

        {st ? (
          <Card style={{ gap: space[3] }}>
            <T v="label">{banner[st]}</T>
            {st !== 'walkover' || confirmMod ? <Button label={live || st === 'no_show' ? 'Open' : 'Details'} size="md" variant="secondary" onPress={() => router.push(`/confirm/${m.id}`)} /> : null}
          </Card>
        ) : null}

        <Card style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space[6] }}>
          {sideView('a')}
          <View style={{ width: 72, alignItems: 'center', paddingTop: 22 }}>
            {score ? <T v="bigNumber" style={{ fontSize: 34, lineHeight: 38 }}>{m.score_a}:{m.score_b}</T> : <T v="section" c="text3">vs</T>}
          </View>
          {sideView('b')}
        </Card>

        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {m.reactions.map((r) => (
            <Pressable key={r.emoji} accessibilityRole="button" accessibilityLabel={`React ${r.emoji}`} accessibilityState={{ selected: r.mine }} onPress={() => react(r.emoji)}
              style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: r.mine ? t.primary : pressed ? t.surface3 : t.surface })}>
              <Text style={{ fontSize: 18 }}>{r.emoji}</Text>
              {r.count ? <Text style={{ fontFamily: font.semibold, fontSize: 14, color: r.mine ? t.onPrimary : t.text2 }}>{r.count}</Text> : null}
            </Pressable>
          ))}
        </View>
        {m.reactions.some((r) => r.count) ? (
          <T v="caption" c="text3">{[...new Set(m.reactions.flatMap((r) => r.who.map((w) => (w === me?.display_name ? 'You' : w))))].sort((x, y) => (x === 'You' ? -1 : y === 'You' ? 1 : 0)).join(', ')} reacted</T>
        ) : null}

        {st && !live ? null : <Card style={{ gap: space[3] }}>
          <T v="heading">{live ? 'Rating changes once confirmed' : 'Rating changes'}</T>
          {m.match_players.map((p) => {
            const pl = byId.get(p.member_id);
            return (
              <View key={p.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                {pl ? <Avatar name={pl.display_name} colour={pl.colour} size={32} /> : null}
                <T v="label" style={{ flex: 1 }}>{name(p.member_id)}</T>
                <T v="small" c="text3">{fmt(p.rating_after - p.delta)}</T>
                <T v="small" c="text3">to</T>
                <T v="label">{fmt(p.rating_after)}</T>
                <T v="label" c={p.delta > 0 ? 'win' : 'text2'} style={{ width: 44, textAlign: 'right' }}>{signed(p.delta)}</T>
              </View>
            );
          })}
          <Pressable accessibilityRole="link" onPress={() => router.push('/elo')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T v="caption" c="text3">Elo with K 32. In 2v2 each side plays as its average rating and both players move the same amount. <T v="caption" c="text2" style={{ textDecorationLine: 'underline' }}>How ratings work</T></T>
          </Pressable>
        </Card>}

        {confirmMod && !st && (m.match_players.some((p) => p.member_id === me?.id) || perm?.admin) ? (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Report a problem" size="md" variant="ghost" style={{ flex: 1 }} onPress={() => router.push(`/dispute/${m.id}`)} />
            {perm?.admin ? <Button label="Match log" size="md" variant="ghost" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/league/match-log', params: { id: m.id } })} /> : null}
          </View>
        ) : null}

        {perm && !perm.allowed && m.created_by === session!.user.id ? (
          <T v="caption" c="text3" center>The 15 minute edit window has closed. Ask a league admin to fix it.</T>
        ) : perm?.allowed && !perm.admin ? (
          <T v="caption" c="text3" center>You can edit or delete this for {perm.minutesLeft} more minutes.</T>
        ) : null}
        <MatchComments matchId={m.id} leagueId={m.league_id} />
      </ScrollView>
    </Screen>
  );
}
