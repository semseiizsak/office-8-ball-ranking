import { router, useLocalSearchParams } from 'expo-router';
import { Clock, Link2Off, Lock, Users, X, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { resolveInvite, setPendingInvite, takePendingInvite, type InvitePreview, type InviteStatus } from '@/lib/invite';
import { sportOf } from '@/lib/sports';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Icon, IconButton, Screen, T } from '@/ui';

// N4 deep link router for invites (A6.2): liga://join/CODE, in Expo Go exp://host/--/join/CODE.
// N4.1 resolving, N4.2 invalid, N4.3 need sign in (code kept 30 min), N4.5 expired or archived, already a member.
// Signed in with a valid code it hands over to the A6.3 join preview, prefilled.
export default function JoinLink() {
  const { t } = useTheme();
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const { leagues, select } = useLeague();
  const signedIn = !!session;
  const [res, setRes] = useState<{ status: InviteStatus; preview: InvitePreview | null } | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => setSlow(true), 300);
    resolveInvite(code, session?.user.id).then(async (r) => {
      if (!live) return;
      clearTimeout(timer);
      if (r.status === 'ok' && signedIn) {
        await takePendingInvite();
        router.replace({ pathname: '/join', params: { code: code.toUpperCase() } });
        return;
      }
      if (r.status === 'ok') await setPendingInvite(code);
      setRes(r);
    });
    return () => { live = false; clearTimeout(timer); };
  }, [code, signedIn, session?.user.id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const toCode = () => router.replace(signedIn ? '/join' : '/email');
  const owner = res?.preview?.inviter ?? 'whoever sent it';

  const state = (icon: LucideIcon, title: string, body: string, primary: { label: string; onPress: () => void }, secondary?: { label: string; onPress: () => void }) => (
    <View style={{ flex: 1, justifyContent: 'center', gap: space[4] }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={icon} size={40} />
      </View>
      <T v="title">{title}</T>
      <T c="text2">{body}</T>
      <View style={{ gap: space[2], marginTop: space[4] }}>
        <Button label={primary.label} onPress={primary.onPress} />
        {secondary ? <Button label={secondary.label} variant="ghost" onPress={secondary.onPress} /> : null}
      </View>
    </View>
  );

  const signIn = (p: InvitePreview) => {
    const sport = sportOf(p.sport);
    return (
      <View style={{ flex: 1, justifyContent: 'center', gap: space[5] }}>
        <T v="title">Sign in to join</T>
        <Card style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={sport.icon} color={t.onBrand} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading">{p.league_name}</T>
            <T v="small" c="text2">{p.team_name}, {sport.label}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Icon as={Users} size={14} color={t.text3} />
              <T v="caption" c="text3">{p.member_count} {p.member_count === 1 ? 'player' : 'players'}{p.inviter ? `, ${p.inviter} invited you` : ''}</T>
            </View>
          </View>
        </Card>
        <T c="text2">We keep your invite while you sign in. New here? Signing in creates your account.</T>
        <Button label="Continue with email" onPress={() => router.push({ pathname: '/email', params: { join: p.league_name } })} />
      </View>
    );
  };

  const body = () => {
    if (!res) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        {slow ? <><ActivityIndicator color={t.text2} /><T v="small" c="text2">Opening…</T></> : null}
      </View>
    );
    const p = res.preview;
    switch (res.status) {
      case 'ok': return p ? signIn(p) : null;
      case 'member': return state(Users, `You're already in ${p?.league_name ?? 'this league'}`, 'Nothing to join. Your spot on the ladder is waiting.',
        { label: 'Open league', onPress: async () => { if (p) await select(p.league_id); router.replace('/(app)/(tabs)'); } });
      case 'expired': return state(Clock, 'This invite has expired', `Invites stop working after a set time. Ask ${owner} for a fresh one.`,
        { label: 'Enter a code', onPress: toCode }, signedIn && leagues.length ? { label: 'Go to my league', onPress: () => router.replace('/(app)/(tabs)') } : undefined);
      case 'archived': return state(Lock, 'This league is archived', 'It no longer takes new players.',
        { label: signedIn && leagues.length ? 'Go to my league' : 'Enter a code', onPress: signedIn && leagues.length ? () => router.replace('/(app)/(tabs)') : toCode });
      default: return state(Link2Off, "This link doesn't work", 'It may be mistyped or incomplete. Ask whoever sent it for a new one.',
        signedIn && leagues.length ? { label: 'Go to my league', onPress: () => router.replace('/(app)/(tabs)') } : { label: 'Join with a code', onPress: toCode },
        signedIn && leagues.length ? { label: 'Enter a code', onPress: toCode } : undefined);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: space[6] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <IconButton icon={X} label="Close" onPress={close} />
        </View>
        {body()}
      </View>
    </Screen>
  );
}
