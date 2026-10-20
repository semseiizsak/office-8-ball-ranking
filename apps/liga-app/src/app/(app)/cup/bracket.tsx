// G1.4 Bracket (one round per page on phones) and G1.9.1 a finished cup (same screen with ?id=)
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { countdown, getCup, roundShort, winChances } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useLeague } from '@/providers/league';
import { fmt, space, useTheme } from '@/theme';
import { Avatar, Card, Empty, Pill, Seg, Skeleton, T } from '@/ui';
import { GameCell, useNow, who } from '@/ui/cup';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof getCup>>;

export default function Bracket() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [d, setD] = useState<Data | undefined>(undefined);
  const [round, setRound] = useState<string | null>(null);
  const now = useNow(30000);

  const load = useCallback(async () => { if (league) setD(await getCup(league.id, id)); }, [league, id]);
  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]));

  const c = d?.cup;
  if (d === undefined) return <View style={{ flex: 1, backgroundColor: t.bg }}><Header title="Bracket" /><View style={{ padding: space[4], gap: space[2] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={120} />)}</View></View>;
  if (!c || !c.rounds) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Bracket" />
        <Empty icon={Trophy} title="No bracket yet" body={c?.status === 'cancelled' ? c.reason ?? 'No cup this week.' : 'The bracket is drawn when sign up closes.'} />
      </View>
    );
  }
  const tz = d!.tz;
  const current = c.games.filter((g) => g.status === 'open').sort((a, b) => a.round - b.round);
  const mineOpen = current.find((g) => g.a === me?.id || g.b === me?.id);
  const def = String(mineOpen?.round ?? current[0]?.round ?? c.rounds - 1);
  const r = Number(round ?? def);
  const games = c.games.filter((g) => g.round === r && (g.status !== 'bye' || r > 0)).sort((a, b) => a.slot - b.slot);
  const byes = c.games.filter((g) => g.round === r && g.status === 'bye');
  const chance = me && c.status === 'running' ? winChances(c, members, league?.k_factor).get(me.id) : undefined;
  const champ = members.find((m) => m.id === c.champion_id);
  const done = c.status === 'done';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Weekly cup, week ${c.week_no}`} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        {done ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ padding: 3, borderRadius: 32, backgroundColor: t.crown }}>
              {champ ? <Avatar name={champ.display_name} colour={champ.colour} size={52} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="caption" c="text3">Champion</T>
              <T v="heading">{who(members, c.champion_id, me?.id) ?? 'Former player'}</T>
              <T v="small" c="text2">{c.final_score ? `${c.final_score[0]} : ${c.final_score[1]} against ${who(members, c.runner_up_id, me?.id)}` : `Final against ${who(members, c.runner_up_id, me?.id)}`}</T>
            </View>
          </Card>
        ) : (
          <View style={{ gap: space[2] }}>
            <T c="text2">{c.seeds.length} players, single elimination</T>
            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
              <Pill label={`Final in ${countdown(new Date(c.final_at).getTime(), now)}`} />
              {mineOpen ? <Pill tone="brand" label="Your match is on" /> : null}
            </View>
          </View>
        )}

        <Seg value={String(r)} onChange={setRound} options={Array.from({ length: c.rounds }, (_, i) => ({ value: String(i), label: roundShort(i, c.rounds) }))} />

        <View style={{ gap: space[2] }}>
          {games.map((g) => <GameCell key={g.id} c={c} g={g} members={members} meId={me?.id} tz={tz} now={now} />)}
          {byes.length ? <T v="caption" c="text3">Byes: {byes.map((g) => who(members, g.winner, me?.id)).join(', ')}, straight through.</T> : null}
        </View>

        {chance !== undefined && chance > 0 ? (
          <Card style={{ gap: 2 }}>
            <T v="number">{Math.round(chance * 100)}%</T>
            <T v="caption" c="text3">Your chance to win the cup, by rating</T>
          </Card>
        ) : null}
        <Card style={{ gap: 4 }}>
          <T v="label" c="text2">{done ? 'Prizes' : 'For the champion'}</T>
          <T v="small">Cup badge, week {c.week_no}</T>
          {isOn(league, 'coins') ? <T v="small">Winner {fmt(c.prizes.winner)} coins, final {fmt(c.prizes.runner)} coins</T> : null}
        </Card>
        {done ? <T v="caption" c="text3" center>Tap a match to see it.</T> : null}
      </ScrollView>
    </View>
  );
}
