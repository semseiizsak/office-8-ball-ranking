// X1.13 Cup sign up wall: tap your name to sign in or out. Closed: the games still to play, or the champion.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { countdown, hm } from '@/lib/cup';
import { cupToggle, kioskHome, thisDevice, type Kiosk, type KioskHome } from '@/lib/kiosk';
import type { Member } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';
import { Avatar, Empty, Icon, Screen, T } from '@/ui';
import { KioskTop, useKioskSize } from '@/ui/kiosk-kit';

export default function KioskCup() {
  const { t } = useTheme();
  const { tablet, wide, width, pad } = useKioskSize();
  const [kiosk, setKiosk] = useState<Kiosk | null>(null);
  const [home, setHome] = useState<KioskHome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/kiosk')), []);

  const load = useCallback(async () => {
    const d = await thisDevice();
    if (!d) return close();
    setKiosk(d.kiosk);
    setHome(await kioskHome(d.kiosk));
  }, [close]);
  // Loaders only set state after an await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  if (!home || !kiosk) return <Screen edges={['top', 'bottom']}>{null}</Screen>;
  const c = home.cup, tz = home.league.tz;
  const name = (id: string | null) => home.members.find((m) => m.id === id)?.display_name ?? 'Someone';
  if (!c) return (
    <Screen edges={['top', 'bottom']}>
      <KioskTop title="Weekly cup" onClose={close} />
      <Empty icon={Trophy} title="No cup this week" body="The weekly cup is off for this league." />
    </Screen>
  );

  const toggle = async (m: Member) => {
    setBusy(m.id);
    try {
      const r = await cupToggle(kiosk, m.id);
      Haptics.selectionAsync();
      setNote(r.state === 'in' ? `You're in, ${m.display_name}. The draw is at ${hm(c.draw_at, tz)}.` : r.state === 'reserve' ? `The cup is full, ${m.display_name}. You're on the reserve list.`
        : `${m.display_name} is out of the cup.${r.promoted ? ` ${name(r.promoted)} gets the spot.` : ''}`);
      await load();
    } catch (e) {
      const s = String(e);
      setNote(s.includes('play a match first') ? `${m.display_name}, play one match first, then sign up.` : s.includes('closed') ? 'Sign up just closed.' : 'That did not work. Try again.');
    }
    setBusy(null);
  };

  const cols = tablet ? (wide ? 6 : 4) : 3;
  const tileW = Math.floor((Math.min(width, 1400) - pad * 2 - space[3] * (cols - 1)) / cols);
  const tile = (m: Member) => {
    const inn = c.entrants.includes(m.id), res = c.waitlist.includes(m.id);
    return (
      <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: inn || res, busy: busy === m.id }} accessibilityLabel={`${m.display_name}, ${inn ? 'signed in' : res ? 'reserve' : 'not signed in'}`}
        disabled={!!busy} onPress={() => toggle(m)}
        style={({ pressed }) => ({ width: tileW, minHeight: tablet ? 160 : 120, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 6, padding: space[2],
          backgroundColor: inn ? t.win : pressed ? t.surface3 : t.surface })}>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={tablet ? 72 : 52} />
        <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: tablet ? 18 : 15, color: inn ? t.onWin : t.text }}>{m.display_name}</Text>
        <Text style={{ fontFamily: font.medium, fontSize: 13, color: inn ? t.onWin : t.text2 }}>{inn ? 'Signed in' : res ? 'Reserve' : 'Tap to sign in'}</Text>
      </Pressable>
    );
  };

  const signup = () => (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3], alignItems: 'center', backgroundColor: t.surface, borderRadius: radius.md, padding: space[4] }}>
        <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
          <T v="heading">Sign up closes at {hm(c.draw_at, tz)}</T>
          <T v="small" c="text2">{c.entrants.length} of {c.max} signed in{c.waitlist.length ? `, ${c.waitlist.length} on the reserve list` : ''}</T>
        </View>
        <T v={tablet ? 'bigNumber' : 'number'}>{countdown(Date.parse(c.draw_at), now, true)}</T>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, (c.entrants.length / c.max) * 100)}%`, height: 8, backgroundColor: t.win }} />
      </View>
      {note ? <T v="heading" center>{note}</T> : <T v="body" c="text2" center>Tap your name to sign in or out</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>{home.members.map(tile)}</View>
      {c.prize ? <T v="body" c="text2" center>🏆 Winner takes {c.prize} coins</T> : null}
    </>
  );

  const closed = () => c.status === 'done' ? (
    <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[8] }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.crown, alignItems: 'center', justifyContent: 'center' }}><Icon as={Trophy} size={44} color={t.onCrown} /></View>
      <T v={tablet ? 'display' : 'title'} center>{name(c.champion)} won the cup</T>
    </View>
  ) : (
    <View style={{ gap: space[3] }}>
      <T v="heading">{c.status === 'upcoming' ? 'Sign up opens soon' : 'Sign up closed. The draw is out'}</T>
      {c.open.map((g, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: space[4], borderRadius: radius.md, backgroundColor: t.surface }}>
          <T v="heading" style={{ flex: 1 }}>{name(g.a)} vs {name(g.b)}</T>
          <T v="small" c="text2">To play</T>
        </View>
      ))}
      {c.status === 'running' && !c.open.length ? <T v="body" c="text2">Waiting for the next round.</T> : null}
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <KioskTop title="Weekly cup" sub={`Final ${new Date(c.final_at).toLocaleDateString('en-GB', { weekday: 'long' })} at ${hm(c.final_at, tz)}`} onClose={close} />
      <ScrollView contentContainerStyle={{ padding: pad, gap: space[4] }}>{c.status === 'signup' ? signup() : closed()}</ScrollView>
    </Screen>
  );
}
