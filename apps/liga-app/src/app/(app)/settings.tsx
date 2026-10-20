import { router } from 'expo-router';
import { ArrowLeft, Bell, ChevronRight, LogOut, UserPlus } from 'lucide-react-native';
import { Alert, ScrollView, View } from 'react-native';

import { auth, resetLocalData } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Avatar, Button, Card, Icon, IconButton, Screen, Seg, T } from '@/ui';
import { Group, Row } from '@/ui/list-row';
import { PlanSummary } from '@/ui/plan-kit';

// B0 settings: your profile in this league, invite, theme, sign out.
export default function Settings() {
  const { t, mode, setMode } = useTheme();
  const { session } = useAuth();
  const { me, league } = useLeague();

  const signOut = () => Alert.alert('Sign out?', 'You can sign back in with your email any time.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => auth.signOut() },
  ]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <T v="section">Settings</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {me ? (
          <Card onPress={() => router.push('/profile-edit')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Avatar name={me.display_name} colour={me.colour} jersey={me.jersey} size={56} />
            <View style={{ flex: 1 }}>
              <T v="heading">{me.display_name}, number {me.jersey}</T>
              <T v="caption" c="text3">{session?.user.email}</T>
            </View>
            <Icon as={ChevronRight} color={t.text3} />
          </Card>
        ) : null}

        <PlanSummary />{/* B0 subscription card, B5.6 */}

        <Card onPress={() => router.push('/invite')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Icon as={UserPlus} />
          <View style={{ flex: 1 }}>
            <T v="heading">Invite people</T>
            <T v="caption" c="text3">QR, link or code {league?.invite_code}</T>
          </View>
          <Icon as={ChevronRight} color={t.text3} />
        </Card>

        <Card onPress={() => router.push('/notification-settings')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Icon as={Bell} />
          <T v="heading" style={{ flex: 1 }}>Notifications</T>
          <Icon as={ChevronRight} color={t.text3} />
        </Card>

        <Card style={{ gap: space[3] }}>
          <T v="heading">Appearance</T>
          <Seg value={mode} onChange={setMode} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </Card>

        <Group title="This league">
          <Row first label="League settings" value={me?.role === 'owner' || me?.role === 'admin' ? undefined : 'View only'} onPress={() => router.push('/league')} />
          <Row label="Members" onPress={() => router.push('/league/members')} />
          <Row label="Blocked members" onPress={() => router.push('/blocked')} />
        </Group>
        <Group title="App">
          <Row first label="Language" value="English" onPress={() => router.push('/language')} />
        </Group>
        <Group title="Your account">
          <Row first label="Download your data" onPress={() => router.push('/account/data')} />
          <Row label="Delete account" danger onPress={() => router.push('/account/delete')} />
        </Group>
        <Group title="Support">
          <Row first label="Send feedback" onPress={() => router.push('/feedback')} />
          <Row label="About Liga" onPress={() => router.push('/about')} />
        </Group>

        <Button label="Sign out" icon={LogOut} variant="secondary" onPress={signOut} />
        <Button label="Reset test data" variant="ghost" onPress={() => Alert.alert('Reset test data?', 'All leagues and matches on this phone are deleted and the demo league comes back.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: async () => { await resetLocalData(); await auth.signOut(); } },
        ])} />
        <T v="caption" c="text3" center>Liga test build, data stays on this phone</T>
      </ScrollView>
    </Screen>
  );
}
