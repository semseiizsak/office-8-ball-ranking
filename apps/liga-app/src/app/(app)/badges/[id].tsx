// G4.3 and R2.4.1 Badge detail sheet: big medal, rule, date or progress, tier steps, who else has it, Share and Pin.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pin, PinOff, Share2, Sparkles } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';

import { ApiError } from '@/lib/api';
import { badgeBook, MAX_PINS, togglePin, type Book } from '@/lib/badges';
import { TIER_LABEL } from '@/lib/progress-engine';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Skeleton, T } from '@/ui';
import { Bar, Medal, TierPill } from '@/ui/badges-kit';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function BadgeDetail() {
  const { t } = useTheme();
  const { id, member: param } = useLocalSearchParams<{ id: string; member?: string }>();
  const { league, members, me } = useLeague();
  const { session } = useAuth();
  const who = param ?? me?.id ?? '';
  const [book, setBook] = useState<Book | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { if (league && who) setBook(await badgeBook(league.id, who)); }, [league, who]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (book === undefined) return <View style={{ padding: space[5], gap: space[3], alignItems: 'center' }}><Skeleton h={160} w={160} r={80} /><Skeleton h={60} /></View>;
  const v = book?.list.find((x) => x.def.id === id);
  if (!book || !v) return <Empty icon={Sparkles} title="Badge not found" body="It may be switched off in this league." />;

  const isMe = who === me?.id;
  const holderName = (x: string) => (x === me?.id ? 'You' : members.find((m) => m.id === x)?.display_name ?? 'Former player');
  const ownerName = isMe ? 'You' : members.find((m) => m.id === who)?.display_name ?? 'They';
  const last = v.earned[v.earned.length - 1];
  const pinned = book.pins.includes(v.def.id);
  const rule = v.def.rule(last ? v.def.goals[last.step] ?? v.next.goal : v.next.done ? v.def.goals[v.def.goals.length - 1] : v.next.goal);

  if (v.hidden) {
    return (
      <View style={{ padding: space[6], gap: space[3], alignItems: 'center' }}>
        <Medal tier={null} icon="sparkles" size={160} locked />
        <T v="title" center>Secret badge</T>
        <T c="text2" center>Secret badge. Keep playing.</T>
      </View>
    );
  }

  const pin = async () => {
    if (!session || !league) return;
    setBusy(true);
    try { await togglePin(session.user, league.id, v.def.id); await load(); } catch (e) {
      if (e instanceof ApiError && e.message === 'pins full') Alert.alert(`You can pin ${MAX_PINS} badges`, 'Unpin one first.');
    }
    setBusy(false);
  };
  const share = () => Share.share({ message: `${isMe ? 'I earned' : `${ownerName} earned`} ${v.def.name}${v.top ? `, ${TIER_LABEL[v.top]}` : ''} 🏅\n${rule}.\n${league?.name ?? ''}` });

  return (
    <ScrollView contentContainerStyle={{ padding: space[5], gap: space[4], paddingBottom: 48 }}>
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <Medal tier={v.top ?? v.next.tier} icon={v.def.icon} size={160} locked={!v.steps} />
        <T v="title" center style={{ marginTop: space[2] }}>{v.def.name}</T>
        {v.top ? <TierPill tier={v.top} /> : null}
        <T c="text2" center>{rule}.</T>
        {last ? (
          <T v="small" c="text3" center>{ownerName === 'You' ? 'Earned' : `${ownerName} earned it`} {date(last.at)}</T>
        ) : null}
      </View>

      {!v.next.done ? (
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space[4], gap: space[2] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label">{v.steps ? `Next, ${TIER_LABEL[v.next.tier]}` : TIER_LABEL[v.next.tier]}</T>
            <T v="label" c="text2">{v.next.value} of {v.next.goal}</T>
          </View>
          <Bar value={v.next.value / v.next.goal} color={t.brand} />
        </View>
      ) : null}

      {v.def.goals.length > 1 ? (
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, paddingVertical: space[2] }}>
          {v.def.goals.map((g, i) => {
            const e = v.earned.find((x) => x.step === i);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                <Medal tier={v.def.tiers[i]} icon={v.def.icon} size={32} locked={!e} />
                <View style={{ flex: 1 }}>
                  <T v="label" c={e ? 'text' : 'text2'}>{TIER_LABEL[v.def.tiers[i]]}</T>
                  <T v="caption" c="text3">{v.def.unit(g)}</T>
                </View>
                <T v="caption" c="text3">{e ? date(e.at) : `${Math.min(v.value, g)} of ${g}`}</T>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: space[2] }}>
        <T v="label">{v.holders.length ? `Earned by ${v.holders.length} of ${book.players}${v.holders.length <= 4 ? `: ${v.holders.map(holderName).join(', ')}` : ''}` : 'No one has this yet. Be the first.'}</T>
        {v.holders.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {v.holders.map((x) => {
              const m = members.find((y) => y.id === x);
              return m ? <Avatar key={x} name={m.display_name} colour={m.colour} size={36} /> : null;
            })}
          </View>
        ) : null}
      </View>

      {last?.match ? <Button label="See the match" variant="ghost" size="md" onPress={() => router.push(`/match/${last.match}`)} /> : null}
      {v.steps ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Share" icon={Share2} variant="secondary" size="md" style={{ flex: 1 }} onPress={share} />
          {isMe ? <Button label={pinned ? 'Unpin' : 'Pin to profile'} icon={pinned ? PinOff : Pin} variant="secondary" size="md" style={{ flex: 1 }} loading={busy} onPress={pin} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
