// G8.6.1 New trade: pick a teammate, what you give (cards they need first), what you get (their spares you need first).
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { REDEEM, RARITY_LABEL, sendTrade, tradeOptions, TRADE_MAX, type CardView } from '@/lib/cards';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Field, Screen, Skeleton, T } from '@/ui';
import { CollectCard } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

type Opt = { card: CardView; spare: number; needed: boolean };

export default function NewTrade() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const params = useLocalSearchParams<{ to?: string; give?: string; want?: string }>();
  const people = members.filter((m) => m.id !== me?.id && !m.guest);
  const [to, setTo] = useState<string | null>(params.to ?? null);
  const [opts, setOpts] = useState<{ give: Opt[]; get: Opt[] } | null>(null);
  const [give, setGive] = useState<string[]>(params.give ? [params.give] : []);
  const [want, setWant] = useState<string[]>(params.want ? [params.want] : []);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || !league || !to) return;
    (async () => setOpts(await tradeOptions(session.user, league.id, to)))();
  }, [session, league, to]);

  const toggle = (list: string[], set: (v: string[]) => void, key: string) => {
    if (list.includes(key)) set(list.filter((k) => k !== key));
    else if (list.length < TRADE_MAX) { Haptics.selectionAsync(); set([...list, key]); }
  };
  const value = (keys: string[], from: Opt[] | undefined) => keys.reduce((s, k) => s + REDEEM[from?.find((o) => o.card.key === k)?.card.rarity ?? 'common'], 0);
  const label = (keys: string[], from: Opt[] | undefined) => keys.map((k) => RARITY_LABEL[from?.find((o) => o.card.key === k)?.card.rarity ?? 'common']).join(' and ');
  const gv = value(give, opts?.give), wv = value(want, opts?.get);
  const balance = !give.length || !want.length ? null : gv === wv ? `Fair: ${label(give, opts?.give)} for ${label(want, opts?.get)}` : gv > wv ? 'You give more than you get' : 'You ask for more than you give';

  const send = async () => {
    if (!session || !league || !to) return;
    setBusy(true);
    try { await sendTrade(session.user, league.id, { to, give, want, note }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); }
    catch (e) { Alert.alert('Couldn’t send the offer', e instanceof Error && e.message.length > 12 ? e.message : 'Try again in a moment.'); }
    setBusy(false);
  };

  const grid = (list: Opt[], picked: string[], onPick: (k: string) => void, tag: string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      {list.map((o) => {
        const on = picked.includes(o.card.key);
        return (
          <Pressable key={o.card.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${o.card.name} ${o.card.label}${o.needed ? `, ${tag}` : ''}`} onPress={() => onPick(o.card.key)}
            style={{ alignItems: 'center', gap: 4, padding: 4, borderRadius: radius.sm, borderWidth: 2, borderColor: on ? t.primary : 'transparent' }}>
            <CollectCard card={o.card} w={72} count={o.card.count} />
            <T v="caption" c={o.needed ? 'text' : 'text3'}>{o.needed ? tag : o.spare ? 'Spare' : 'Last copy'}</T>
          </Pressable>
        );
      })}
    </View>
  );
  const who = people.find((m) => m.id === to);

  return (
    <Screen>
      <Header title="New trade" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[3] }}>
          {people.map((m) => (
            <Pressable key={m.id} accessibilityRole="radio" accessibilityState={{ selected: m.id === to }} onPress={() => { setTo(m.id); setOpts(null); setWant([]); }}
              style={{ alignItems: 'center', gap: 4, padding: space[1], borderRadius: radius.sm, backgroundColor: m.id === to ? t.surface3 : 'transparent' }}>
              <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={48} />
              <T v="caption">{m.display_name}</T>
            </Pressable>
          ))}
        </ScrollView>
        {!to ? <Empty icon={ArrowLeftRight} title="Who do you want to trade with?" body="Pick a teammate above. Card for card, up to 3 a side." /> : !opts ? <Skeleton h={300} /> : (
          <>
            <View style={{ gap: space[2] }}>
              <T v="heading">You give</T>
              {opts.give.length ? grid(opts.give, give, (k) => toggle(give, setGive, k), `${who?.display_name ?? 'They'} needs it`) : <T v="small" c="text2">No tradeable cards yet. Open a pack first.</T>}
            </View>
            <View style={{ gap: space[2] }}>
              <T v="heading">You get</T>
              {opts.get.length ? grid(opts.get, want, (k) => toggle(want, setWant, k), 'You need it') : <T v="small" c="text2">{who?.display_name ?? 'They'} has no spares right now. You can still send a gift.</T>}
            </View>
            {balance ? <T v="label" c="text2" center>{balance}</T> : null}
            <Field label="Message, optional" value={note} onChangeText={setNote} maxLength={140} placeholder="Need this one for my set" />
            <Button label="Send offer" icon={ArrowLeftRight} loading={busy} disabled={!give.length && !want.length} onPress={send} />
            <T v="caption" c="text3" center>Only cards change hands, never coins. Special editions stay with their owner.</T>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
