import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { createLeague, joinLeague } from '@/lib/api';
import { hasNameMatch } from '@/lib/guests';
import { applySetup } from '@/lib/invite';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { playerColours, space, useTheme, type PlayerColour } from '@/theme';
import { Avatar, Button, Field, IconButton, Screen, T } from '@/ui';

// A10: name, jersey number and colour for this league.
export default function Profile() {
  const { t } = useTheme();
  const p = useLocalSearchParams<{ mode: 'create' | 'join'; team?: string; league?: string; sport?: string; code?: string; taken?: string; template?: string; timezone?: string }>();
  const { reloadLeagues } = useLeague();
  const { session } = useAuth();
  const taken = useMemo(() => new Set((p.taken ?? '').split(',').filter(Boolean).map(Number)), [p.taken]);
  const firstFree = useMemo(() => [7, 10, 9, 11, 8, 23, 5, 3].find((n) => !taken.has(n)) ?? 1, [taken]);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState(String(firstFree));
  const [colour, setColour] = useState<PlayerColour>('blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const n = Number(jersey);
  const numberError = jersey === '' ? undefined : taken.has(n) ? `Number ${n} is taken in this league` : n > 99 ? 'Pick 0 to 99' : undefined;
  const ok = name.trim().length >= 1 && jersey !== '' && !numberError;

  const save = async () => {
    setBusy(true); setError(undefined);
    let id: string;
    try {
      const user = session!.user;
      id = p.mode === 'create'
        ? await createLeague(user, { team: p.team!, league: p.league!, sport: p.sport!, name: name.trim(), jersey: n, colour }).then(async (lid) => { await applySetup(user, lid, p); return lid; })
        : await joinLeague(user, { code: p.code!, name: name.trim(), jersey: n, colour });
    } catch (e) {
      setBusy(false);
      setError(String(e).includes('number taken') ? `Number ${n} was just taken. Pick another.` : 'Something went wrong. Try again.');
      return;
    }
    setBusy(false);
    await reloadLeagues(id);
    router.dismissAll();
    if (p.mode === 'create') router.replace({ pathname: '/invite', params: { ready: '1' } }); // A8.5 then A9
    else router.replace((await hasNameMatch(session!.user, id)) ? '/claim' : '/(app)/(tabs)'); // A15.1 Is this you?
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[6], gap: space[5] }} keyboardShouldPersistTaps="handled">
          <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
          <T v="title">You in {p.league}</T>
          <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
            <Avatar name={name || '?'} colour={colour} jersey={jersey === '' ? undefined : n} size={112} />
            <T v="heading" style={{ color: t.pct[colour] }}>{name || 'Your name'}</T>
          </View>
          <Field label="Name in this league" placeholder="Dave" value={name} onChangeText={setName} maxLength={24} />
          <Field label="Jersey number" keyboardType="number-pad" maxLength={2} value={jersey} onChangeText={(v) => setJersey(v.replace(/\D/g, ''))} error={numberError} />
          <T v="label" c="text2">Colour</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(Object.keys(playerColours) as PlayerColour[]).map((c) => (
              <Pressable key={c} accessibilityLabel={c} accessibilityState={{ selected: c === colour }} onPress={() => setColour(c)}
                style={{ width: 48, height: 48, borderRadius: 24, padding: 3, borderWidth: 2, borderColor: c === colour ? t.text : 'transparent' }}>
                <View style={{ flex: 1, borderRadius: 24, backgroundColor: playerColours[c], borderWidth: c === 'ink' ? 1 : 0, borderColor: t.lineStrong }} />
              </Pressable>
            ))}
          </View>
          {error ? <T v="small" c="error">{error}</T> : null}
        </ScrollView>
        <View style={{ padding: space[6], paddingTop: 0 }}>
          <Button label={p.mode === 'create' ? 'Create league' : 'Join league'} variant={p.mode === 'create' ? 'brand' : 'primary'} onPress={save} loading={busy} disabled={!ok} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
