import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { updateMember } from '@/lib/api';
import { useLeague } from '@/providers/league';
import { playerColours, space, useTheme, type PlayerColour } from '@/theme';
import { Avatar, Button, Field, IconButton, T } from '@/ui';

// R7 Edit your profile in this league: name, jersey number, colour.
export default function ProfileEdit() {
  const { me } = useLeague();
  // The form seeds its fields from `me`, so wait until it is loaded (cold start or reload on this route).
  return me ? <Form key={me.id} me={me} /> : null;
}

function Form({ me }: { me: NonNullable<ReturnType<typeof useLeague>['me']> }) {
  const { t } = useTheme();
  const { members, league, refresh } = useLeague();
  const [name, setName] = useState(me.display_name);
  const [jersey, setJersey] = useState(String(me.jersey ?? ''));
  const [colour, setColour] = useState<PlayerColour>(me.colour ?? 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const n = Number(jersey);
  const holder = members.find((m) => m.jersey === n && m.id !== me.id);
  const numberError = jersey === '' ? 'Pick a number' : holder ? `${holder.display_name} wears ${n}` : undefined;
  const colourMates = members.filter((m) => m.colour === colour && m.id !== me.id).map((m) => m.display_name);
  const dirty = name.trim() !== me.display_name || n !== me.jersey || colour !== me.colour;

  const save = async () => {
    setBusy(true); setError(undefined);
    try {
      await updateMember(me.id, { display_name: name.trim(), jersey: n, colour });
      await refresh();
      router.back();
    } catch {
      setError('Could not save. Try another number.');
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
        <T v="section">Edit profile</T>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[5] }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Avatar name={name || '?'} colour={colour} jersey={jersey === '' ? undefined : n} size={112} />
          <T v="heading" style={{ color: t.pct[colour] }}>{name || 'Your name'}</T>
          <T v="caption" c="text3">In {league?.name}</T>
        </View>
        <Field label="Name" value={name} onChangeText={setName} maxLength={24} />
        <Field label="Jersey number" keyboardType="number-pad" maxLength={2} value={jersey} onChangeText={(v) => setJersey(v.replace(/\D/g, ''))} error={numberError} />
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Colour</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(Object.keys(playerColours) as PlayerColour[]).map((c) => (
              <Pressable key={c} accessibilityLabel={c} accessibilityState={{ selected: c === colour }} onPress={() => setColour(c)}
                style={{ width: 48, height: 48, borderRadius: 24, padding: 3, borderWidth: 2, borderColor: c === colour ? t.text : 'transparent' }}>
                <View style={{ flex: 1, borderRadius: 24, backgroundColor: playerColours[c], borderWidth: c === 'ink' ? 1 : 0, borderColor: t.lineStrong }} />
              </Pressable>
            ))}
          </View>
          {colourMates.length ? <T v="caption" c="text3">Also worn by {colourMates.join(', ')}. Your number keeps you apart.</T> : null}
        </View>
        {error ? <T v="small" c="error">{error}</T> : null}
        <Button label="Save" onPress={save} loading={busy} disabled={!dirty || !!numberError || !name.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
