// A9.4 Add a player without an account, M1.7 Add a guest player
import { router } from 'expo-router';
import { Share2, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, View } from 'react-native';

import { addGuest, freeJersey } from '@/lib/guests';
import { inviteUrl, prettyCode } from '@/lib/invite';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Avatar, Button, Field, IconButton, Pill, T } from '@/ui';

export default function GuestNew() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, refresh } = useLeague();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<Member | null>(null);
  if (!league || !session) return null;
  const clean = name.trim();
  const first = clean.split(' ')[0] || 'They';

  const add = async () => {
    setBusy(true); setError(undefined);
    try {
      const m = await addGuest(session.user, league.id, clean);
      await refresh();
      setAdded(m);
    } catch (e) {
      setError(String(e).includes('name taken') ? `There's already a ${clean}. Add a last initial?` : 'Could not add the player. Try again.');
    }
    setBusy(false);
  };

  // Opened by a deep link there is nothing to go back to, so fall back to Ranks.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const invite = (m: Member) => Share.share({
    message: `${m.display_name}, your matches in ${league.name} are waiting. Join with code ${prettyCode(league.invite_code)} and pick yourself to keep them: ${inviteUrl(league.invite_code)}`,
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4] }}>
        <T v="section">{added ? 'Player added' : 'Add a player'}</T>
        <IconButton icon={X} label="Close" onPress={() => close()} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5] }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
            <Avatar name={added?.display_name ?? (clean || '?')} colour={added?.colour ?? 'ink'} jersey={added?.jersey ?? freeJersey(new Set(members.map((m) => m.jersey)))} size={96} />
            {added ? <Pill label="No account yet" /> : null}
          </View>
          {added ? (
            <View style={{ gap: space[3] }}>
              <T v="heading" center>{added.display_name} is on the ladder</T>
              <T v="small" c="text2" center>Log matches with {added.display_name} right away. When {added.display_name} joins with the invite code, they pick this player and keep every match and the rating.</T>
            </View>
          ) : (
            <View style={{ gap: space[3] }}>
              <Field label="Name" placeholder="Kim" value={name} onChangeText={(v) => { setName(v); setError(undefined); }} maxLength={24} autoFocus error={error}
                returnKeyType="done" onSubmitEditing={() => clean && add()} />
              <T v="small" c="text2">Number and colour are picked for you. {first} can claim this player later by joining with the invite code. Matches and rating carry over.</T>
            </View>
          )}
        </ScrollView>
        <View style={{ padding: space[4], gap: space[2], paddingBottom: space[8] }}>
          {added ? (
            <>
              <Button label={`Send ${added.display_name} the invite`} icon={Share2} onPress={() => invite(added)} />
              <Button label="Done" variant="secondary" onPress={() => close()} />
            </>
          ) : (
            <Button label={clean ? `Add ${clean}` : 'Add player'} onPress={add} loading={busy} disabled={!clean} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
