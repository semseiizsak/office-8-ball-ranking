// B4.2 Rating settings: rating speed (K factor), starting rating, preview, recalculate. Members read only.
import { useFocusEffect } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { isAdmin, K_SPEEDS, leagueAdminInfo, recalculate, setKFactor } from '@/lib/admin';
import { eloPreview } from '@/lib/elo';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, signed, space } from '@/theme';
import { Button, Card, Screen, Seg, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

type Info = Awaited<ReturnType<typeof leagueAdminInfo>>;

export default function LeagueRules() {
  const { session } = useAuth();
  const { league, me, members, refresh, reloadLeagues } = useLeague();
  const [info, setInfo] = useState<Info | null>(null);
  const [k, setK] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'replay' | null>(null);

  const load = useCallback(async () => { if (league) setInfo(await leagueAdminInfo(league.id)); }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!league || !session) return null;
  const user = session.user;
  const admin = isAdmin(me) && !league.archived_at;
  const kv = Number(k ?? league.k_factor);
  const speed = K_SPEEDS.find((x) => x.k === kv);
  const [a, b] = members;
  const p = a && b ? eloPreview(a.rating, b.rating, kv) : null;
  const matches = info?.matchCount ?? 0;

  const fail = () => Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.');
  const save = async () => {
    setBusy('save');
    try { await setKFactor(user, league.id, kv); await reloadLeagues(league.id); setK(null); } catch { fail(); }
    setBusy(null);
  };
  const replay = () => Alert.alert('Recalculate all ratings?', `Replays ${matches} matches with ${speed?.label ?? 'the current'} speed. Ranks may change.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Recalculate', onPress: async () => {
      setBusy('replay');
      try { await recalculate(user, league.id); await Promise.all([refresh(), load()]); } catch { fail(); }
      setBusy(null);
    } },
  ]);

  return (
    <Screen>
      <Header title="Rating" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Rating speed</T>
          {admin ? (
            <Seg value={String(kv)} onChange={setK} options={K_SPEEDS.map((x) => ({ value: String(x.k), label: x.label }))} />
          ) : (
            <Group><Row first label={speed?.label ?? 'Custom'} value={`K ${kv}`} /></Group>
          )}
          <T v="small" c="text2">A win against an equal player moves about {Math.round(kv / 2)} points. Faster speed means ranks change quicker.</T>
        </View>

        {p ? (
          <Card style={{ gap: space[1] }}>
            <T v="label" c="text2">Example</T>
            <T v="body">{a.display_name} ({fmt(a.rating)}) beats {b.display_name} ({fmt(b.rating)}):</T>
            <T v="heading">{a.display_name} {signed(p.aWins)}, {b.display_name} {signed(-p.aWins)}</T>
          </Card>
        ) : null}

        <Group footer="Everyone starts here when they join. Fixed for now.">
          <Row first label="Starting rating" value={fmt(info?.league.start_rating ?? 1000)} />
          <Row label="2v2" value="Side average, shared ladder" />
        </Group>

        {admin ? (
          <View style={{ gap: space[3] }}>
            {k !== null && kv !== league.k_factor ? <T v="small" c="text2">Applies from the next match. Matches already played keep their points unless you recalculate.</T> : null}
            <Button label="Save" onPress={save} loading={busy === 'save'} disabled={kv === league.k_factor} />
            <Button label={busy === 'replay' ? 'Recalculating' : 'Recalculate all ratings'} icon={RefreshCw} variant="secondary" onPress={replay} loading={busy === 'replay'} disabled={k !== null && kv !== league.k_factor} />
            <T v="caption" c="text3">Recalculate replays every match with the saved speed. Best at the start of a season.</T>
          </View>
        ) : (
          <T v="caption" c="text3">Owners and admins set these rules.</T>
        )}
      </ScrollView>
    </Screen>
  );
}
