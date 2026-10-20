// B4.6 Season settings (length, carry over, wrap) and B4.6.1 End season now. Owner and admins edit, others read.
import { router } from 'expo-router';
import { Flag, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { CARRY_STEPS, endSeasonNow, LENGTHS, nameIn, progressOf, setSeasonSettings, turnOnSeasons, lastDay, type SeasonLength } from '@/lib/seasons';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, space, useTheme } from '@/theme';
import { Button, Card, Screen, Seg, Skeleton, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';
import { useSeasons } from '@/ui/season';

export default function SeasonSettings() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me, members, reloadLeagues } = useLeague();
  const { data, reload } = useSeasons();
  const [length, setLength] = useState<SeasonLength | null>(null);
  const [carry, setCarry] = useState<number | null>(null);
  const [wrap, setWrap] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data || !league || !session) return <Screen><Header title="Season settings" /><View style={{ padding: space[4] }}><Skeleton h={240} /></View></Screen>;
  const admin = isAdmin(me) && !league.archived_at;
  const fail = () => Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.');

  if (!data.on) {
    return (
      <Screen>
        <Header title="Season settings" />
        <View style={{ padding: space[4] }}>
          <Card style={{ gap: space[3], alignItems: 'flex-start' }}>
            <T v="heading">Seasons are off. The ladder runs forever.</T>
            <T v="small" c="text2">Turn them on for a fresh race every quarter, a soft reset and a wrap story at the end.</T>
            {admin ? <Button label="Turn on" size="md" loading={busy} onPress={async () => {
              setBusy(true);
              try { await turnOnSeasons(session.user, league.id); await reloadLeagues(league.id); await reload(); } catch { fail(); }
              setBusy(false);
            }} /> : <T v="caption" c="text3">Only the owner or an admin can turn seasons on.</T>}
          </Card>
        </View>
      </Screen>
    );
  }

  const s = data.current;
  const p = progressOf(s);
  const lv = length ?? data.config.length;
  const cv = carry ?? data.carry;
  const wv = wrap ?? data.config.wrap;
  const dirty = lv !== data.config.length || cv !== data.carry || wv !== data.config.wrap;
  const lengths = data.config.length === 'weekly' ? [{ value: 'weekly' as SeasonLength, label: 'Weekly' }, ...LENGTHS] : LENGTHS;
  const base = data.league.start_rating;

  const save = async () => {
    setBusy(true);
    try {
      await setSeasonSettings(session.user, league.id, { length: lv, carry: cv, wrap: wv });
      setLength(null); setCarry(null); setWrap(null);
      await reloadLeagues(league.id); await reload();
    } catch { fail(); }
    setBusy(false);
  };
  const end = () => {
    const top = s.rows.slice(0, 3).map((r, i) => `${i + 1}. ${nameIn(members, r.id)}, ${fmt(r.rating)}`).join('\n');
    const champ = s.rows[0] ? `${nameIn(members, s.rows[0].id)} wins the season. ` : 'No one played, so there is no winner. ';
    Alert.alert(`End Season ${s.n} now?`, `${champ}Ratings carry over ${data.carry}%. Season ${s.n + 1} starts right away.${top ? `\n\n${top}` : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End season', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await endSeasonNow(session.user, league.id); await reload(); router.replace(`/season/${s.n}`); } catch { fail(); }
        setBusy(false);
      } },
    ]);
  };

  return (
    <Screen>
      <Header title="Season settings" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 64 }}>
        <Card style={{ gap: 4 }}>
          <T v="heading">Season {s.n}</T>
          <T v="small" c="text2">{p.days ? `Day ${Math.min(p.day, p.days)} of ${p.days}, ends ${lastDay(s.end!)}` : `Day ${p.day}, ends when you close it`}</T>
        </Card>

        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Length</T>
          {admin ? <Seg options={lengths} value={lv} onChange={setLength} /> : <T v="body">{lengths.find((x) => x.value === lv)?.label}</T>}
          <T v="caption" c="text3">{'A new length starts with the next season. Seasons follow the league\'s timezone.'}</T>
        </View>

        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Carry over, {cv}%</T>
          {admin ? <Seg options={CARRY_STEPS.map((c) => ({ value: String(c), label: `${c}%` }))} value={String(cv)} onChange={(v) => setCarry(Number(v))} /> : null}
          <T v="caption" c="text3">
            {cv === 0 ? `Everyone starts the next season at ${fmt(base)}.` : cv === 100 ? 'Season ratings continue as they are.' : `Everyone moves ${cv === 50 ? 'halfway' : `${100 - cv}% of the way`} back to ${fmt(base)} at the start of a new season.`}
          </T>
        </View>

        <Group>
          <Row first label="Season wrap story" right={<Switch value={wv} disabled={!admin} onValueChange={setWrap} trackColor={{ true: t.win, false: t.surface3 }} />} />
        </Group>

        {admin ? <Button label="Save" disabled={!dirty} loading={busy} onPress={save} /> : <T v="caption" c="text3">Only the owner or an admin can change seasons.</T>}

        <Group>
          {admin ? <Row first icon={Flag} label="End season now" onPress={end} /> : null}
          <Row first={!admin} icon={Trophy} label="Hall of fame" onPress={() => router.push('/season/archive')} />
        </Group>
      </ScrollView>
    </Screen>
  );
}
