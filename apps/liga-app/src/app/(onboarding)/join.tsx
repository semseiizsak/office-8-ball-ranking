import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { needsAge } from '@/lib/account';
import { resolveInvite, type InvitePreview } from '@/lib/invite';
import { sportOf } from '@/lib/sports';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Field, Icon, IconButton, Screen, T } from '@/ui';

type Preview = InvitePreview;
const ERRORS = { invalid: 'No league with that code. Check the 6 characters with whoever sent it.', expired: 'This code expired. Ask for a fresh invite.', archived: 'This league is archived.' } as const;

// A6 join by code with A6.3 preview and A6.4 errors. Prefilled from an invite link it checks right away.
export default function Join() {
  const { t } = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [member, setMember] = useState(false);
  const { session } = useAuth();
  const { select } = useLeague();
  // A4: an invite link skips the fork, so new accounts get the age question here too.
  useFocusEffect(useCallback(() => {
    if (session) needsAge(session.user.id).then((r) => r && router.push({ pathname: '/age', params: r === 'blocked' ? { blocked: '1' } : {} }));
  }, [session]));

  const check = async (value = code) => {
    setBusy(true); setError(undefined);
    const res = await resolveInvite(value, session?.user.id);
    setBusy(false);
    if (res.status !== 'ok' && res.status !== 'member') { setError(ERRORS[res.status]); return; }
    setMember(res.status === 'member');
    setPreview(res.preview);
  };
  // Runs once for a prefilled code; check() only sets state after an await.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (params.code && params.code.length === 6) check(params.code); }, []);

  const sport = sportOf(preview?.sport);
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space[6], gap: space[5] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="title">Join a league</T>
        <Field label="Invite code" placeholder="7KQ4MD" autoCapitalize="characters" autoCorrect={false} maxLength={7} value={code}
          onChangeText={(v) => { setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setPreview(null); setMember(false); }} error={error}
          style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center' }} onSubmitEditing={() => check()} />
        {preview ? (
          <Card style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={sport.icon} color={t.onBrand} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="heading">{preview.league_name}</T>
              <T v="small" c="text2">{preview.team_name}, {sport.label}</T>
              {preview.inviter ? <T v="caption" c="text3">Invited by {preview.inviter}</T> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Icon as={Users} size={14} color={t.text3} />
                <T v="caption" c="text3">{preview.member_count} {preview.member_count === 1 ? 'player' : 'players'}</T>
              </View>
            </View>
          </Card>
        ) : null}
        <View style={{ flex: 1 }} />
        {preview && member ? (
          <Button label="You're already in, open league" onPress={async () => { await select(preview.league_id); router.dismissAll(); router.replace('/(app)/(tabs)'); }} />
        ) : preview ? (
          <Button label={`Join ${preview.league_name}`} onPress={() => router.push({ pathname: '/profile', params: { mode: 'join', code, league: preview.league_name, taken: preview.taken_jerseys.join(',') } })} />
        ) : (
          <Button label="Find league" onPress={() => check()} loading={busy} disabled={code.length < 6} />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
