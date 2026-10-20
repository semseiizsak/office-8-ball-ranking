// X1.5 Pick players, X1.7 Quick log, X1.8 VS and live timer, X1.9 Who won, X1.10 Result, X1.11 Guest player (A15.2 phone icon on guests)
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Plus, Smartphone } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { eloPreview } from '@/lib/elo';
import { addKioskGuest, avgOf, chanceA, hms, kioskHome, namesOf, pct, quickLog, thisDevice, type Kiosk, type KioskHome, type KioskResult } from '@/lib/kiosk';
import type { Member } from '@/lib/types';
import { font, fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Field, Icon, Pill, Screen, Seg, T } from '@/ui';
import { KioskTop, useKioskSize } from '@/ui/kiosk-kit';

type Step = 'pick' | 'vs' | 'live' | 'won' | 'result';
type Format = '1v1' | '2v2';
const PICK_IDLE = 30_000, RESULT_HOME = 15_000;

export default function KioskPlay() {
  const { t } = useTheme();
  const { mode = 'live' } = useLocalSearchParams<{ mode?: 'live' | 'log' }>();
  const { tablet, wide, width, pad, gap } = useKioskSize();
  const [kiosk, setKiosk] = useState<Kiosk | null>(null);
  const [home, setHome] = useState<KioskHome | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [format, setFormat] = useState<Format>('1v1');
  const [picks, setPicks] = useState<string[]>([]);
  const [teams, setTeams] = useState<Record<string, 'a' | 'b'>>({});
  const [winner, setWinner] = useState<'a' | 'b' | null>(null);
  const [count, setCount] = useState(3);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<KioskResult | null>(null);
  const [resultAt, setResultAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const touched = useRef(0);

  const load = useCallback(async () => {
    const dev = await thisDevice();
    if (!dev?.active) return router.replace('/kiosk');
    setKiosk(dev.kiosk);
    setHome(await kioskHome(dev.kiosk));
  }, []);
  // Loaders only set state after an await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { touched.current = Date.now(); load(); }, [load]);

  const goHome = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/kiosk')), []);

  // One clock for the countdown, the live timer, the pick idle and the result timeout.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (step === 'pick' && now - touched.current > PICK_IDLE) goHome();
    if (step === 'result' && now - resultAt > RESULT_HOME) goHome();
  }, [now, step, resultAt, goHome]);
  useEffect(() => {
    if (step !== 'vs') return;
    const id = setInterval(() => setCount((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [step]);
  useEffect(() => {
    if (step !== 'vs' || count > 0) return;
    const live = !!home?.liveOn;
    const id = setTimeout(() => { setStartedAt(Date.now()); setStep(live ? 'live' : 'won'); }, 0);
    return () => clearTimeout(id);
  }, [step, count, home]);

  if (!home || !kiosk) return <Screen edges={['top', 'bottom']}>{null}</Screen>;
  const byId = new Map(home.members.map((m) => [m.id, m]));
  const busySet = new Set(home.busy);
  const a = format === '1v1' ? picks.slice(0, 1) : Object.keys(teams).filter((id) => teams[id] === 'a');
  const b = format === '1v1' ? picks.slice(1, 2) : Object.keys(teams).filter((id) => teams[id] === 'b');
  const ready = format === '1v1' ? a.length === 1 && b.length === 1 : a.length === 2 && b.length === 2;
  const side = (ids: string[]) => ids.map((id) => byId.get(id)).filter((m): m is Member => !!m);
  const A = side(a), B = side(b);
  const ra = A.map((m) => m.rating), rb = B.map((m) => m.rating);
  const preview = ready ? eloPreview(avgOf(ra), avgOf(rb), home.league.k) : null;
  const ca = ready ? chanceA(ra, rb) : 0.5;

  const poke = () => { touched.current = Date.now(); };
  const tap = (m: Member) => {
    Haptics.selectionAsync();
    if (format === '1v1') {
      setPicks((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : p.length < 2 ? [...p, m.id] : [p[0], m.id]));
      return;
    }
    setTeams((x) => {
      const cur = x[m.id], na = Object.values(x).filter((s) => s === 'a').length, nb = Object.values(x).filter((s) => s === 'b').length;
      const next = { ...x };
      if (!cur) { if (na < 2) next[m.id] = 'a'; else if (nb < 2) next[m.id] = 'b'; }
      else if (cur === 'a' && nb < 2) next[m.id] = 'b';
      else delete next[m.id];
      return next;
    });
  };
  const go = () => {
    setWinner(null); setStartedAt(null);
    if (mode === 'log') return setStep('won');
    setCount(3); setStep('vs');
  };
  const save = async () => {
    if (!winner) return;
    setBusy(true);
    try {
      const r = await quickLog(kiosk, { a, b, winner });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(r); setResultAt(r.at); setStep('result');
    } catch {
      Alert.alert('That did not work', 'Nothing was saved. Try again in a moment.');
    }
    setBusy(false);
  };
  const rematch = async () => { setResult(null); await load(); go(); };
  const cancelLive = () => Alert.alert('Cancel this match?', 'Nothing gets saved.', [
    { text: 'Keep playing', style: 'cancel' }, { text: 'Cancel match', style: 'destructive', onPress: goHome },
  ]);
  const addGuest = async () => {
    setBusy(true);
    try {
      const g = await addKioskGuest(kiosk, guestName);
      setGuestOpen(false); setGuestName('');
      await load();
      tap(g);
    } catch (e) {
      Alert.alert(String(e).includes('name taken') ? 'That name is taken' : 'That did not work', String(e).includes('name taken') ? 'Add a last initial, like Ben K.' : 'Try again in a moment.');
    }
    setBusy(false);
  };

  /* ---------- pick ---------- */
  const cols = tablet ? (wide ? 6 : 4) : 3;
  const tileW = Math.floor((Math.min(width, 1400) - pad * 2 - space[3] * (cols - 1)) / cols);
  const av = Math.min(112, Math.round(tileW * 0.62));
  const slotOf = (id: string) => (format === '1v1' ? (picks[0] === id ? 'a' : picks[1] === id ? 'b' : null) : teams[id] ?? null);

  const tile = (m: Member) => {
    const s = slotOf(m.id), playing = busySet.has(m.id) && !s;
    const bg = s === 'a' ? t.brand : s === 'b' ? t.primary : t.surface;
    const fg = s === 'a' ? t.onBrand : s === 'b' ? t.onPrimary : t.text;
    const label = format === '1v1' ? (s === 'a' ? 'Player 1' : s === 'b' ? 'Player 2' : fmt(m.rating)) : s ? `Team ${s.toUpperCase()}` : fmt(m.rating);
    // The phone button sits beside the tile's Pressable, not inside it (nested buttons break on web and for screen readers).
    return (
      <View key={m.id}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !!s, disabled: playing }} accessibilityLabel={`${m.display_name}, ${playing ? 'playing' : label}`}
        disabled={playing} onPress={() => tap(m)}
        style={({ pressed }) => ({ width: tileW, minHeight: av + 72, borderRadius: radius.md, backgroundColor: pressed && !s ? t.surface3 : bg, alignItems: 'center', justifyContent: 'center', gap: 6, padding: space[2] })}>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={av} />
        <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: tablet ? 18 : 15, color: playing ? t.text3 : fg }}>{m.display_name}</Text>
        {playing ? <Pill label="Playing" tone="live" /> : <Text style={{ fontFamily: font.medium, fontSize: 13, color: s ? fg : t.text2 }}>{label}</Text>}
        {s ? <View style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' }}><Icon as={Check} size={16} color={bg} /></View> : null}
      </Pressable>
        {m.guest && !m.user_id && home.code && !s ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Take ${m.display_name} to a phone`} hitSlop={4}
            onPress={() => router.push({ pathname: '/kiosk/claim-qr', params: { m: m.id } })}
            style={{ position: 'absolute', top: 2, right: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={Smartphone} size={20} color={t.text2} />
          </Pressable>
        ) : null}
      </View>
    );
  };
  const guestTile = () => (
    <Pressable key="guest" accessibilityRole="button" accessibilityLabel="Add a guest" onPress={() => setGuestOpen(true)}
      style={({ pressed }) => ({ width: tileW, minHeight: av + 72, borderRadius: radius.md, borderWidth: 2, borderColor: t.lineStrong, borderStyle: 'dashed', backgroundColor: pressed ? t.surface3 : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 6 })}>
      <View style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon as={Plus} size={av * 0.36} /></View>
      <Text style={{ fontFamily: font.semibold, fontSize: tablet ? 18 : 15, color: t.text }}>Guest</Text>
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: t.text2 }}>No account</Text>
    </Pressable>
  );
  const sideLabel = (ms: Member[], fallback: string) => (ms.length ? `${namesOf(ms)} ${fmt(Math.round(avgOf(ms.map((m) => m.rating))))}` : fallback);

  const pick = () => {
    const title = format === '2v2' ? 'Pick two teams' : picks.length === 0 ? 'Pick player 1' : picks.length === 1 ? 'Pick player 2' : 'Ready';
    const main = !ready ? (format === '1v1' ? (picks.length ? 'Next, pick player 2' : 'Pick player 1') : 'Pick two players a side')
      : mode === 'log' ? 'Next, who won' : format === '1v1' ? `Start ${A[0].display_name} vs ${B[0].display_name}` : 'Start 2v2';
    const diff = Math.abs(Math.round(avgOf(ra)) - Math.round(avgOf(rb)));
    return (
      <View style={{ flex: 1 }}>
        <KioskTop title={title} sub={`Step ${format === '1v1' && picks.length === 0 ? 1 : 2} of 3`} right={<View style={{ width: tablet ? 220 : 140 }}><Seg options={[{ value: '1v1', label: '1v1' }, { value: '2v2', label: '2v2' }]} value={format} onChange={(f) => { setFormat(f); setPicks([]); setTeams({}); }} /></View>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: pad, padding: space[3], borderRadius: radius.md, backgroundColor: t.surface2 }}>
          <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{sideLabel(A, format === '1v1' ? 'Player 1' : 'Team A')}</T>
          <T v="label" c="text3">vs</T>
          <T v="heading" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{sideLabel(B, format === '1v1' ? 'Player 2' : 'Team B')}</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: pad, flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }} onScrollBeginDrag={poke}>
          {home.members.map(tile)}
          {kiosk.settings.allowGuests ? guestTile() : null}
        </ScrollView>
        <View style={{ paddingHorizontal: pad, paddingBottom: space[4], gap: space[2] }}>
          {ready && format === '2v2' ? <T v="small" c="text2" center>{diff <= 40 ? 'Fair match, ' : ''}team ratings {fmt(Math.round(avgOf(ra)))} and {fmt(Math.round(avgOf(rb)))}</T> : null}
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <Button label="Cancel" variant="secondary" onPress={goHome} style={{ flex: 1 }} />
            <Button label={main} disabled={!ready} onPress={go} style={{ flex: 2 }} />
          </View>
        </View>
      </View>
    );
  };

  /* ---------- vs, live ---------- */
  const big = tablet ? 160 : 96;
  const sideBlock = (ms: Member[], chance: number | null, key: string) => (
    <View key={key} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
      <View style={{ flexDirection: 'row', gap: space[3] }}>{ms.map((m) => <Avatar key={m.id} name={m.display_name} colour={m.colour} jersey={m.jersey} size={ms.length > 1 ? big * 0.75 : big} />)}</View>
      <T v={tablet ? 'display' : 'title'} center numberOfLines={2}>{namesOf(ms)}</T>
      <T v="number" c="text2">{fmt(Math.round(avgOf(ms.map((m) => m.rating))))}</T>
      {chance !== null ? <T v="heading" c="text2">Win chance {pct(chance)}%</T> : null}
    </View>
  );
  const vs = () => (
    <View style={{ flex: 1, padding: pad, gap }}>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', alignItems: 'center' }}>
        {sideBlock(A, ca, 'a')}
        <T v={tablet ? 'hero' : 'display'} c="text3">VS</T>
        {sideBlock(B, 1 - ca, 'b')}
      </View>
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <T v="hero">{Math.max(count, 0)}</T>
        <T v="heading" c="text2">Starting</T>
      </View>
      <Button label="Cancel" variant="secondary" onPress={() => setStep('pick')} />
    </View>
  );
  const live = () => (
    <View style={{ flex: 1, padding: pad, gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pill label="Live" tone="live" />
        <T v="caption" c="text2">{kiosk.name}</T>
      </View>
      <T v="hero" center style={{ fontVariant: ['tabular-nums'] }}>{hms(now - (startedAt ?? now))}</T>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', alignItems: 'center' }}>
        {sideBlock(A, null, 'a')}
        <T v="title" c="text3">vs</T>
        {sideBlock(B, null, 'b')}
      </View>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Button label="Cancel match" variant="secondary" onPress={cancelLive} style={{ flex: 1 }} />
        <Button label="Finish, who won?" onPress={() => setStep('won')} style={{ flex: 1.3 }} />
      </View>
    </View>
  );

  /* ---------- who won ---------- */
  const winCard = (s: 'a' | 'b', ms: Member[]) => {
    const on = winner === s;
    const delta = preview ? (s === 'a' ? preview.aWins : -preview.bWins) : 0;
    return (
      <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${namesOf(ms)} won`} onPress={() => { Haptics.selectionAsync(); setWinner(s); }}
        style={({ pressed }) => ({ flex: 1, minHeight: tablet ? 280 : 160, borderRadius: radius.lg, backgroundColor: on ? t.win : pressed ? t.surface3 : t.surface, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] })}>
        <View style={{ flexDirection: 'row', gap: space[2] }}>{ms.map((m) => <Avatar key={m.id} name={m.display_name} colour={m.colour} jersey={m.jersey} size={tablet ? 112 : 64} />)}</View>
        <T v={tablet ? 'title' : 'section'} c={on ? 'onWin' : 'text'} center numberOfLines={2}>{namesOf(ms)}</T>
        <T v="heading" c={on ? 'onWin' : 'text2'}>{ms.length > 1 ? 'Win' : 'Wins'}, about {signed(delta)}</T>
      </Pressable>
    );
  };
  const won = () => {
    const w = winner === 'a' ? A : winner === 'b' ? B : null;
    return (
      <View style={{ flex: 1 }}>
        <KioskTop title="Who won?" sub={`Step 3 of 3, ${startedAt ? `played ${hms(now - startedAt)}, ` : ''}tap the winner`} />
        <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', gap, paddingHorizontal: pad }}>
          {winCard('a', A)}
          {winCard('b', B)}
        </View>
        <View style={{ flexDirection: 'row', gap: space[3], padding: pad }}>
          <Button label="Back" variant="secondary" style={{ flex: 1 }}
            onPress={() => setStep(startedAt && home.liveOn ? 'live' : 'pick')} />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !w || busy }} disabled={!w || busy} onPress={save}
            style={({ pressed }) => ({ flex: 2, height: 52, borderRadius: radius.pill, backgroundColor: w ? t.win : t.surface2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: w ? t.onWin : t.text3 }}>{busy ? 'Saving' : w ? `Confirm, ${namesOf(w)} won` : 'Tap the winner'}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  /* ---------- result ---------- */
  const resultRow = (r: KioskResult['rows'][number]) => (
    <View key={r.m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: t.surface }}>
      <Avatar name={r.m.display_name} colour={r.m.colour} jersey={r.m.jersey} size={tablet ? 56 : 44} />
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={1}>{r.m.display_name}</T>
        <T v="caption" c="text3">{r.rank ? `Rank ${r.rank}` : 'New player'}</T>
      </View>
      <T v="number" c="text2">{fmt(r.before)} → {fmt(r.after)}</T>
      <Pill label={signed(r.delta)} tone={r.delta >= 0 ? 'win' : 'loss'} />
    </View>
  );
  const res = () => {
    if (!result) return null;
    const ws = result.rows.filter((r) => r.side === result.winner).map((r) => r.m);
    const sub = [result.streak >= 2 ? `${result.streak} wins in a row 🔥` : '', result.firstPlace ? '#1 👑' : ''].filter(Boolean).join(', ');
    const left = Math.max(0, Math.ceil((RESULT_HOME - (now - resultAt)) / 1000));
    return (
      <ScrollView contentContainerStyle={{ padding: pad, gap, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[4] }}>
          <View style={{ flexDirection: 'row', gap: space[3] }}>{ws.map((m) => <Avatar key={m.id} name={m.display_name} colour={m.colour} jersey={m.jersey} size={tablet ? 140 : 96} />)}</View>
          <T v={tablet ? 'display' : 'title'} center>{namesOf(ws)} {ws.length > 1 ? 'win' : 'wins'}</T>
          {sub ? <T v="heading" c="text2" center>{sub}</T> : null}
        </View>
        {result.pending ? (
          <View style={{ backgroundColor: t.surface2, borderRadius: radius.md, padding: space[4] }}>
            <T v="heading">Saved. {namesOf(result.pending.map((n) => ({ display_name: n })))}, confirm it on your phone.</T>
            <T v="small" c="text2">Ratings move once it is confirmed.</T>
          </View>
        ) : null}
        {result.rows.map(resultRow)}
        {result.h2h ? <T v="body" c="text2" center>Head to head, {result.h2h.lead}</T> : null}
        <T v="body" c="text2" center>{result.today} {result.today === 1 ? 'match' : 'matches'} today</T>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <Button label="Rematch" variant="secondary" onPress={rematch} style={{ flex: 1 }} />
          <Button label="Done" onPress={goHome} style={{ flex: 1 }} />
        </View>
        <T v="caption" c="text3" center>Back home in {left} s</T>
      </ScrollView>
    );
  };

  const guestSheet = () => (
    <Modal visible={guestOpen} transparent animationType="fade" onRequestClose={() => setGuestOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.scrim, justifyContent: 'center', padding: space[4] }}>
        <View style={{ backgroundColor: t.overlay, borderRadius: radius.lg, padding: space[6], gap: space[4], maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          <T v="title">Add a guest</T>
          <T v="body" c="text2">Guests play without an account and their matches count. Join on your phone later to keep them.</T>
          <Field label="Name" placeholder="Guest" value={guestName} onChangeText={setGuestName} maxLength={24} autoFocus />
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <Button label="Cancel" variant="secondary" onPress={() => setGuestOpen(false)} style={{ flex: 1 }} />
            <Button label="Continue" onPress={addGuest} loading={busy} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1 }} onTouchStart={poke}>
        {step === 'pick' ? pick() : step === 'vs' ? vs() : step === 'live' ? live() : step === 'won' ? won() : res()}
      </View>
      {guestSheet()}
    </Screen>
  );
}
