// G2.1 Manage this week's cup: entrants, redraw, walkover, extend a deadline, cancel. Every action is logged with a reason.
import { router, useFocusEffect } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { adminEntrant, canRedraw, cancelCup, dayHm, extendDeadline, getCup, giveWalkover, hm, redraw, roundName } from '@/lib/cup';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Field, T } from '@/ui';
import { who } from '@/ui/cup';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof getCup>>;

export default function ManageCup() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const [d, setD] = useState<Data | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { if (league) setD(await getCup(league.id)); }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isAdmin(me)) return <View style={{ flex: 1, backgroundColor: t.bg }}><Header title="Manage cup" /><Empty icon={Trophy} title="Admins only" body="Ask an admin to change the cup." /></View>;
  const c = d?.cup;
  if (!c || !league || !session) return <View style={{ flex: 1, backgroundColor: t.bg }}><Header title="Manage cup" />{d === null ? <Empty icon={Trophy} title="No cup this week" body="Turn the cup on in settings." /> : null}</View>;
  const tz = d!.tz;
  const name = (id: string | null) => who(members, id, me?.id) ?? 'Former player';

  const confirm = (title: string, key: string, f: () => Promise<void>) => Alert.alert(title, reason ? `Reason shown to players: ${reason}` : 'Add a reason above so players know why.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress: async () => {
      setBusy(key);
      try { await f(); setReason(''); } catch { Alert.alert('That did not work', 'The cup changed meanwhile. Nothing was done.'); }
      setBusy(null);
      load();
    } },
  ]);

  const editable = c.status === 'upcoming' || c.status === 'signup' || canRedraw(c);
  const entrants = new Set(c.entrants.map((e) => e.member_id));
  const others = members.filter((m) => !entrants.has(m.id));
  const open = c.games.filter((g) => g.status === 'open' || g.status === 'waiting').sort((a, b) => a.round - b.round || a.slot - b.slot);
  const row = (id: string, right: ReactNode, i: number) => {
    const m = members.find((x) => x.id === id);
    return (
      <View key={id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
        {m ? <Avatar name={m.display_name} colour={m.colour} size={32} /> : null}
        <T v="label" style={{ flex: 1 }} numberOfLines={1}>{name(id)}</T>
        {right}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Manage cup" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <T c="text2">Week {c.week_no}, {c.status === 'signup' ? 'sign up open' : c.status === 'running' ? 'in play' : c.status === 'done' ? 'finished' : c.status === 'cancelled' ? 'cancelled' : `opens ${dayHm(c.opens_at, tz)}`}.</T>
          <Field label="Reason, shown to players" value={reason} onChangeText={setReason} placeholder="For example: Joe is on holiday" maxLength={120} />

          <View style={{ gap: space[2] }}>
            <T v="heading">Players</T>
            {!editable ? <T v="small" c="text3">The first round has started, players are fixed.</T> : null}
            <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
              {c.entrants.map((e, i) => row(e.member_id, editable ? <Button label="Remove" size="sm" variant="secondary" loading={busy === 'rm' + e.member_id}
                onPress={() => confirm(`Remove ${name(e.member_id)}?`, 'rm' + e.member_id, () => adminEntrant(session.user, league.id, e.member_id, false, reason))} /> : <T v="caption" c="text3">{hm(e.at, tz)}</T>, i))}
              {!c.entrants.length ? <T v="small" c="text3" style={{ padding: space[4] }}>Nobody signed up yet.</T> : null}
            </View>
            {editable && others.length ? (
              <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
                {others.map((m, i) => row(m.id, <Button label="Add" size="sm" variant="secondary" loading={busy === 'add' + m.id}
                  onPress={() => confirm(`Add ${name(m.id)}?`, 'add' + m.id, () => adminEntrant(session.user, league.id, m.id, true, reason))} />, i))}
              </View>
            ) : null}
            {c.status === 'running' ? <Button label="Redraw" variant="secondary" disabled={!canRedraw(c)} loading={busy === 'redraw'}
              onPress={() => confirm('Draw the bracket again?', 'redraw', () => redraw(session.user, league.id, reason))} /> : null}
            {c.status === 'running' && !canRedraw(c) ? <T v="caption" c="text3">Redraw is off, the first round has started.</T> : null}
          </View>

          {open.length ? (
            <View style={{ gap: space[2] }}>
              <T v="heading">Open matches</T>
              {open.map((g) => (
                <View key={g.id} style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space[4], gap: space[2] }}>
                  <T v="label">{roundName(g.round, c.rounds)} {g.slot + 1}: {g.a ? name(g.a) : 'To be decided'} vs {g.b ? name(g.b) : 'To be decided'}</T>
                  <T v="caption" c="text3">Due {dayHm(g.deadline, tz)}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    {g.status === 'open' ? [g.a!, g.b!].map((w) => (
                      <Button key={w} label={`Win for ${name(w)}`} size="sm" variant="secondary" loading={busy === 'wo' + g.id + w}
                        onPress={() => confirm(`Give ${name(w)} a walkover?`, 'wo' + g.id + w, () => giveWalkover(session.user, g.id, w, reason))} />
                    )) : null}
                    <Button label="Extend 24 h" size="sm" variant="secondary" loading={busy === 'ext' + g.id}
                      onPress={() => confirm('Extend this deadline by 24 hours?', 'ext' + g.id, () => extendDeadline(session.user, g.id, reason))} />
                    {g.status === 'open' ? <Button label="Set result" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/log', params: { a: g.a!, b: g.b!, cup: g.id } })} /> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {c.events.length ? (
            <View style={{ gap: space[1] }}>
              <T v="heading">Log</T>
              {[...c.events].reverse().map((e) => <T key={e.at + e.text} v="small" c="text2">{dayHm(e.at, tz)}, {name(e.by)}: {e.text}</T>)}
            </View>
          ) : null}

          {c.status !== 'done' && c.status !== 'cancelled' ? (
            <Button label="Cancel this week's cup" variant="danger" loading={busy === 'cancel'}
              onPress={() => confirm("Cancel this week's cup?", 'cancel', () => cancelCup(session.user, league.id, reason))} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
