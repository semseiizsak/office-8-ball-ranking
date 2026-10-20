import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Plus, Radio, Trophy, Undo2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avg, eloPreview } from '@/lib/elo';
import { deleteMatch, editMatch, getMatch, recordMatch } from '@/lib/api';
import { completeChallenge } from '@/lib/challenges';
import { armCupGame, linkCupMatch } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { planGate } from '@/lib/billing';
import { useAuth } from '@/providers/auth';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { font, fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Icon, IconButton, Seg, T } from '@/ui';
import { UnlockPeek } from '@/ui/badges-kit';
import { openPaywall } from '@/ui/plan-kit';

type Fmt = '1v1' | '2v2';
type Slot = { side: 'a' | 'b'; i: number };

// M1 Log a match (1v1 and 2v2) and M2 result.
export default function LogMatch() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, me, league, refresh } = useLeague();
  const { session } = useAuth();
  const { edit, a: preA, b: preB, challenge, cup } = useLocalSearchParams<{ edit?: string; a?: string; b?: string; challenge?: string; cup?: string }>(); // cup: a cup game, players fixed
  const [undoLeft, setUndoLeft] = useState(0);
  const [format, setFormat] = useState<Fmt>('1v1');
  const [aRaw, setA] = useState<(string | null)[]>([preA ?? me?.id ?? null, null]);
  const [b, setB] = useState<(string | null)[]>([preB ?? null, null]);
  // Cold start (deep link): the league may load after mount, so I fill the empty first slot once known.
  const meId = me?.id;
  const a = aRaw[0] || edit || preA || !meId || aRaw.includes(meId) || b.includes(meId) ? aRaw : [meId, aRaw[1]];
  const [active, setActive] = useState<Slot>({ side: 'b', i: 0 });
  const [winner, setWinner] = useState<'a' | 'b' | null>(null);
  const [scoreOn, setScoreOn] = useState(false);
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [before, setBefore] = useState<Map<string, number>>(); // edit mode: ratings going into the match
  const [result, setResult] = useState<{ delta: number; rating: number; won: boolean; matchId: string; pending?: { names: string[]; hours: number; required: boolean } | null } | null>(null);

  // Edit mode (M4): load the match, players stay fixed, only the result can change.
  useEffect(() => {
    if (!edit) return;
    getMatch(edit, session!.user.id).then((x) => {
      if (!x) return;
      const s = (side: 'a' | 'b') => x.match_players.filter((p) => p.side === side).map((p) => p.member_id);
      setBefore(new Map(x.match_players.map((p) => [p.member_id, p.rating_after - p.delta])));
      setFormat(x.format); setA([...s('a'), null].slice(0, 2)); setB([...s('b'), null].slice(0, 2)); setWinner(x.winner);
      if (x.score_a != null && x.score_b != null) { setScoreOn(true); setSa(String(x.score_a)); setSb(String(x.score_b)); }
    });
  }, [edit, session]);

  // M1.5: 10 second undo after saving.
  useEffect(() => {
    if (undoLeft <= 0) return;
    const id = setTimeout(() => setUndoLeft((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [undoLeft]);

  const n = format === '1v1' ? 1 : 2;
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const sideA = a.slice(0, n), sideB = b.slice(0, n);
  const picked = new Set([...sideA, ...sideB].filter(Boolean) as string[]);
  const complete = sideA.every(Boolean) && sideB.every(Boolean);
  const rating = (id: string) => before?.get(id) ?? byId.get(id)!.rating;
  const ra = complete ? avg(sideA.map((id) => rating(id!))) : 0;
  const rb = complete ? avg(sideB.map((id) => rating(id!))) : 0;
  const preview = complete ? eloPreview(ra, rb, league?.k_factor ?? 32) : null;

  const order: Slot[] = format === '1v1' ? [{ side: 'a', i: 0 }, { side: 'b', i: 0 }] : [{ side: 'a', i: 0 }, { side: 'a', i: 1 }, { side: 'b', i: 0 }, { side: 'b', i: 1 }];
  const get = (s: Slot) => (s.side === 'a' ? a : b)[s.i];
  const set = (s: Slot, id: string | null) => (s.side === 'a' ? setA : setB)((prev) => prev.map((v, i) => (i === s.i ? id : v)));

  const pick = (id: string) => {
    Haptics.selectionAsync();
    set(active, id);
    setWinner(null);
    const next = order.find((s) => !(s.side === active.side && s.i === active.i) && !get(s));
    if (next) setActive(next);
  };
  const changeFormat = (f: Fmt) => {
    setFormat(f); setWinner(null);
    setActive(f === '2v2' ? (a[1] ? { side: 'b', i: 0 } : { side: 'a', i: 1 }) : { side: 'b', i: 0 });
  };

  const save = async () => {
    if (!league || !winner) return;
    setBusy(true); setError(undefined);
    const startRating = me?.rating ?? 0; // read before saving: the store mutates member objects in place
    const gate = !edit && me ? await planGate(league.id, me.id, 'log') : null; // B5.7: over the plan limit, show why instead of failing
    if (gate) { setBusy(false); openPaywall(gate); return; }
    const score = scoreOn && sa !== '' && sb !== '';
    let matchId = '';
    let pending: { names: string[]; hours: number; required: boolean } | null = null;
    try {
      if (edit) {
        await editMatch(session!.user, edit, { winner, score: score ? [Number(sa), Number(sb)] : null });
        await refresh();
        router.back();
        return;
      }
      if (cup) armCupGame(cup);
      const res = await recordMatch(session!.user, { league: league.id, a: sideA as string[], b: sideB as string[], winner, score: score ? [Number(sa), Number(sb)] : null });
      matchId = res.matchId; pending = res.pending;
      if (challenge) await completeChallenge(session!.user, challenge, matchId).catch(() => {});
      if (cup) await linkCupMatch(cup, matchId).catch(() => {});
    } catch {
      setBusy(false);
      setError('Could not save. Try again.');
      return;
    }
    setBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const mineSide = me && sideA.includes(me.id) ? 'a' : me && sideB.includes(me.id) ? 'b' : null;
    const aDelta = winner === 'a' ? preview!.aWins : preview!.bWins;
    const d = mineSide === 'a' ? aDelta : mineSide === 'b' ? -aDelta : 0;
    setResult({ delta: d, rating: startRating + (pending ? 0 : d), won: mineSide === winner, matchId, pending });
    setUndoLeft(10);
    refresh();
  };

  const reset = () => { setResult(null); setWinner(null); setB([null, null]); setA([me?.id ?? null, null]); setActive({ side: 'b', i: 0 }); setScoreOn(false); setSa(''); setSb(''); };

  if (result) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: space[6], paddingBottom: insets.bottom + space[4], justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', gap: space[4], marginTop: space[12] }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: result.won ? t.win : t.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={result.won ? Trophy : Check} size={40} color={result.won ? t.onWin : t.text} />
          </View>
          <T v="title" center>{result.won ? 'Nice win' : 'Match saved'}</T>
          {me ? (
            <>
              <T v="hero" c={result.pending ? 'text3' : result.won ? 'win' : 'text2'} style={{ textTransform: 'none' }}>{signed(result.delta)}</T>
              <T c="text2" center>{result.pending ? `Pending, counts when ${result.pending.names.join(' or ')} confirms` : `Your rating is now ${fmt(result.rating)}`}</T>
            </>
          ) : null}
          {result.pending ? <T v="small" c="text3" center>{result.pending.required ? `They have ${result.pending.hours} h to confirm. Your rating stays ${fmt(result.rating)} until then.` : `No answer in ${result.pending.hours} h and it counts automatically.`}</T> : null}
        </View>
        <View style={{ gap: space[3] }}>
          {undoLeft > 0 ? (
            <Button label={`Undo (${undoLeft})`} icon={Undo2} variant="ghost"
              onPress={async () => { await deleteMatch(session!.user, result.matchId); await refresh(); setUndoLeft(0); reset(); }} />
          ) : null}
          <UnlockPeek />
          <Button label="Done" onPress={() => router.back()} />
          <Button label="Log another" variant="secondary" onPress={reset} />
        </View>
      </View>
    );
  }

  const slotView = (s: Slot) => {
    const id = get(s);
    const m = id ? byId.get(id) : undefined;
    const on = active.side === s.side && active.i === s.i;
    return (
      <Pressable key={`${s.side}${s.i}`} disabled={!!edit || !!cup} accessibilityRole="button" accessibilityLabel={m ? m.display_name : 'Empty slot'} onPress={() => setActive(s)} style={{ alignItems: 'center', gap: 6, width: 76 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: m ? 'solid' : 'dashed',
          borderColor: on ? t.text : m ? 'transparent' : t.lineStrong }}>
          {m ? <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={56} /> : <Icon as={Plus} color={t.text3} />}
        </View>
        <T v="caption" c={m ? 'text' : 'text3'} numberOfLines={1}>{m ? (m.id === me?.id ? 'You' : m.display_name) : on ? 'Pick below' : 'Empty'}</T>
      </Pressable>
    );
  };

  const winBtn = (s: 'a' | 'b') => {
    const on = winner === s;
    const ids = s === 'a' ? sideA : sideB;
    const names = ids.map((id) => (id === me?.id ? 'You' : byId.get(id!)?.display_name)).join(' and ');
    const d = s === 'a' ? preview!.aWins : -preview!.bWins;
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { Haptics.selectionAsync(); setWinner(s); }}
        style={({ pressed }) => ({ flex: 1, minHeight: 88, borderRadius: radius.md, padding: space[3], gap: 4, alignItems: 'center', justifyContent: 'center',
          backgroundColor: on ? t.win : t.surface, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Text style={{ fontFamily: font.bold, fontSize: 16, color: on ? t.onWin : t.text, textAlign: 'center' }} numberOfLines={2}>{names} won</Text>
        <Text style={{ fontFamily: font.semibold, fontSize: 13, color: on ? t.onWin : t.text2 }}>{signed(d)} rating</Text>
      </Pressable>
    );
  };

  const pool = [...members].sort((x, y) => (y.last_played_at ?? '').localeCompare(x.last_played_at ?? ''));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
        <T v="section">{edit ? 'Edit result' : 'Log a match'}</T>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 140, gap: space[5] }} keyboardShouldPersistTaps="handled">
        {edit || cup ? null : <Seg value={format} onChange={changeFormat} options={[{ value: '1v1', label: '1v1' }, { value: '2v2', label: '2v2' }]} />}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], backgroundColor: t.surface, borderRadius: radius.lg, paddingVertical: space[5] }}>
          <View style={{ flexDirection: 'row' }}>{order.filter((s) => s.side === 'a').map(slotView)}</View>
          <T v="label" c="text3" style={{ marginBottom: 22 }}>vs</T>
          <View style={{ flexDirection: 'row' }}>{order.filter((s) => s.side === 'b').map(slotView)}</View>
        </View>

        {!complete ? (
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2">{active.side === 'a' ? (format === '2v2' && active.i === 1 ? 'Pick your partner' : 'Pick a player') : format === '2v2' ? 'Pick the opponents' : 'Pick your opponent'}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {pool.filter((m) => !picked.has(m.id)).map((m: Member) => {
                return (
                  <Pressable key={m.id} onPress={() => pick(m.id)} accessibilityRole="button" accessibilityLabel={m.display_name}
                    style={({ pressed }) => ({ width: '23%', alignItems: 'center', gap: 6, paddingVertical: space[3], borderRadius: radius.sm,
                      backgroundColor: pressed ? t.surface3 : t.surface })}>
                    <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={44} />
                    <T v="caption" numberOfLines={1}>{m.id === me?.id ? 'You' : m.display_name}</T>
                  </Pressable>
                );
              })}
            </View>
            {members.length < n * 2 ? <T v="small" c="text3">You need {n * 2} players in the league for {format}. Invite more people from Ranks.</T> : null}
            <Button label="Add a player without an account" variant="ghost" size="md" onPress={() => router.push('/guest-new')} />{/* M1.7 */}
          </View>
        ) : (
          <View style={{ gap: space[3] }}>
            {!edit && isOn(league, 'live') ? <Button label="Play live instead" icon={Radio} variant="secondary" size="md" onPress={() => router.replace({ pathname: '/live/setup', params: { a: sideA.join(','), b: sideB.join(','), ...(challenge ? { challenge } : {}), ...(cup ? { cup } : {}) } })} /> : null}{/* M11.1 */}
            <T v="label" c="text2">Who won?</T>
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              {winBtn('a')}
              {winBtn('b')}
            </View>
            <Pressable accessibilityRole="button" onPress={() => setScoreOn((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T v="label" c="text2">{scoreOn ? 'Remove score' : 'Add score (optional)'}</T>
            </Pressable>
            {scoreOn ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                {[[sa, setSa], [sb, setSb]].map(([v, setV], i) => (
                  <TextInput key={i} value={v as string} onChangeText={(x) => (setV as (s: string) => void)(x.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3}
                    placeholder="0" placeholderTextColor={t.text3}
                    style={{ flex: 1, minWidth: 0, height: 56, borderRadius: radius.sm, backgroundColor: t.surface, color: t.text, textAlign: 'center', fontFamily: font.heavy, fontSize: 24 }} />
                ))}
              </View>
            ) : null}
          </View>
        )}
        {error ? <T v="small" c="error">{error}</T> : null}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space[4], paddingBottom: insets.bottom + space[3], backgroundColor: t.bg }}>
        <Button label={edit ? 'Save changes' : 'Save match'} onPress={save} loading={busy} disabled={!complete || !winner} />
      </View>
    </View>
  );
}
