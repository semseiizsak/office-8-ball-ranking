import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Crown, Send, Swords, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/api';
import { cancelChallenge, composerInfo, createChallenge, DAILY_LIMIT, MESSAGES, previewStakes, stakesFor, whenAt, whenLabel, type Challenge, type When } from '@/lib/challenges';
import { daysSince } from '@/lib/time';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, playerColours, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Field, Icon, IconButton, Pill, T } from '@/ui';

const WHEN: { value: When; label: string }[] = [
  { value: 'any', label: 'Any time' }, { value: 'now', label: 'Now' }, { value: '30', label: 'In 30 min' }, { value: 'lunch', label: 'After lunch' },
];

// M8 New challenge (1v1 in the test build), M8.1 Pick opponent, M8.4 Challenge sent.
export default function NewChallenge() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const params = useLocalSearchParams<{ to?: string; opponent?: string }>();
  const [to, setTo] = useState<string | null>(params.to ?? params.opponent ?? null);
  const [when, setWhen] = useState<When>('any');
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState<{ openWith: Map<string, string>; sentToday: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<Challenge | null>(null);

  useEffect(() => {
    if (league && me) composerInfo(league.id, me.id).then(setInfo);
  }, [league, me]);

  const k = league?.k_factor ?? 32;
  const ranked = members.filter((m) => m.wins + m.losses > 0);
  const opp = members.find((m) => m.id === to);
  const meId = me?.id; // a plain value: the compiler turns me?.id inside the callback into me.id and crashes before the league loads
  const pool = members.filter((m) => m.id !== meId && !m.guest); // guests have no phone to answer
  const openId = opp ? info?.openWith.get(opp.id) : undefined;
  const limit = (info?.sentToday ?? 0) >= DAILY_LIMIT;

  const send = async () => {
    if (!session || !league || !opp) return;
    setBusy(true); setError(undefined);
    try {
      const c = await createChallenge(session.user, { league: league.id, to: opp.id, message, scheduled_at: whenAt(when) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(c);
    } catch (e) {
      setError(e instanceof ApiError && e.message === 'already open' ? 'You already have a challenge open with them.' : 'Could not send. Try again.');
    }
    setBusy(false);
  };

  // M8.4 Challenge sent
  if (sent && opp && me) {
    const s = stakesFor(sent, me.id);
    const next = pool.find((m) => m.id !== opp.id && !info?.openWith.has(m.id));
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: space[6], paddingBottom: insets.bottom + space[4], justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', gap: space[4], marginTop: space[12] }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={Send} size={38} color={t.onBrand} />
          </View>
          <T v="title" center>Challenge sent</T>
          <T c="text2" center>{opp.display_name} has until {whenLabel(sent.expires_at)} to answer. We will let you know the moment they do.</T>
          <Card style={{ alignSelf: 'stretch', gap: space[2] }}>
            <T v="label">You vs {opp.display_name}</T>
            <T v="small" c="text2">Win {signed(s.win)}, lose {signed(s.lose)}, {Math.round(s.chance * 100)}% chance</T>
            {sent.scheduled_at ? <T v="small" c="text2">{whenLabel(sent.scheduled_at)}</T> : null}
            {sent.message ? <T v="small" c="text2">“{sent.message}”</T> : null}
          </Card>
          {next ? <T v="small" c="text3" center>{next.display_name} could be up for a game too.</T> : null}
        </View>
        <View style={{ gap: space[3] }}>
          <Button label="Back to Arena" onPress={() => router.back()} />
          <Button label="Cancel challenge" variant="ghost" onPress={async () => { await cancelChallenge(session!.user, sent.id); router.back(); }} />
        </View>
      </View>
    );
  }

  // M8.1 opponent rows with mini stakes
  const pickRow = (m: Member) => {
    const p = me ? previewStakes(me, m, k) : null;
    const crown = ranked[0]?.id === m.id;
    return (
      <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Challenge ${m.display_name}`} onPress={() => { Haptics.selectionAsync(); setTo(m.id); setError(undefined); }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : t.surface })}>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T v="heading" numberOfLines={1}>{m.display_name}</T>
            {crown ? <Pill label="Crown" tone="crown" icon={Crown} /> : null}
          </View>
          {p ? <T v="caption" c="text3">Win {signed(p.aWins)}, lose {signed(p.bWins)}</T> : null}
        </View>
        <T v="number">{fmt(m.rating)}</T>
      </Pressable>
    );
  };

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
      <T v="label" c={on ? 'onPrimary' : 'text'}>{label}</T>
    </Pressable>
  );

  const stakesPanel = (o: Member) => {
    const p = previewStakes(me!, o, k);
    const chance = Math.round(p.chanceA * 100);
    const rankAfter = (r: number) => members.filter((m) => m.id !== me!.id && m.wins + m.losses > 0 && m.rating > r).length + 1;
    const now = rankAfter(me!.rating), up = rankAfter(me!.rating + p.aWins);
    return (
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T v="bigNumber">{chance}%</T>
          <T v="label" c="text2">Win chance</T>
        </View>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
          <View style={{ flex: Math.max(1, chance), backgroundColor: playerColours[me!.colour] }} />
          <View style={{ flex: Math.max(1, 100 - chance), backgroundColor: playerColours[o.colour] }} />
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.sm, padding: space[3], gap: 2 }}>
            <T v="caption" c="text3">If you win</T>
            <T v="number" c="win">{signed(p.aWins)}</T>
            <T v="caption" c="text2">{fmt(me!.rating + p.aWins)}{up < now ? `, up to rank ${up}` : ''}</T>
          </View>
          <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.sm, padding: space[3], gap: 2 }}>
            <T v="caption" c="text3">If you lose</T>
            <T v="number">{signed(p.bWins)}</T>
            <T v="caption" c="text2">{fmt(me!.rating + p.bWins)}</T>
          </View>
        </View>
        <T v="caption" c="text3">Stakes lock when you send.</T>
      </Card>
    );
  };

  const dormant = opp && opp.last_played_at ? daysSince(opp.last_played_at) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
        <T v="section">New challenge</T>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 140, gap: space[5] }} keyboardShouldPersistTaps="handled">
        {!me ? <T c="text2">Join this league to send challenges.</T> : !opp ? (
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2">Pick your opponent</T>
            {pool.length ? pool.map(pickRow) : <T v="small" c="text3">No one to challenge yet. Invite a teammate from Ranks.</T>}
          </View>
        ) : (
          <>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Avatar name={me.display_name} colour={me.colour} jersey={me.jersey} size={48} />
              <T v="label" c="text3">vs</T>
              <Avatar name={opp.display_name} colour={opp.colour} jersey={opp.jersey} size={48} />
              <View style={{ flex: 1 }}>
                <T v="heading" numberOfLines={1}>{opp.display_name}</T>
                <T v="caption" c="text3">{fmt(opp.rating)} rating</T>
              </View>
              <Button label="Change" size="sm" variant="secondary" onPress={() => setTo(null)} />
            </Card>
            {openId ? (
              <Card onPress={() => router.replace(`/challenge/${openId}`)} style={{ gap: 4 }}>
                <T v="label">You already have a challenge open with {opp.display_name}.</T>
                <T v="small" c="text2">Tap to open it.</T>
              </Card>
            ) : null}
            {dormant >= 14 ? <T v="small" c="text2">{opp.display_name} has not played in {Math.floor(dormant / 7)} weeks. They might be away.</T> : null}
            {stakesPanel(opp)}
            <View style={{ gap: space[2] }}>
              <T v="label" c="text2">When (optional)</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{WHEN.map((w) => chip(w.label, when === w.value, () => setWhen(w.value)))}</View>
            </View>
            <View style={{ gap: space[2] }}>
              <T v="label" c="text2">Message (optional)</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{MESSAGES.map((m) => chip(m, message === m, () => setMessage(message === m ? '' : m)))}</View>
              <Field value={message} onChangeText={setMessage} maxLength={120} placeholder="Or write your own" />
            </View>
          </>
        )}
        {limit ? <T v="small" c="text2">You have sent {DAILY_LIMIT} today. Try again tomorrow.</T> : null}
        {error ? <T v="small" c="error">{error}</T> : null}
      </ScrollView>
      {opp && me ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space[4], paddingBottom: insets.bottom + space[3], backgroundColor: t.bg }}>
          <Button label="Send challenge" icon={Swords} variant="brand" onPress={send} loading={busy} disabled={!!openId || limit || !info} />
        </View>
      ) : null}
    </View>
  );
}
