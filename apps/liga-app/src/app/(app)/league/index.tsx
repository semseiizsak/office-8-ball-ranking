// B4 League settings hub, B4.1 General, B4.1.1 Sport picker, B3.1 Team name, B3.6 Leave, B4.9 Archive
import { router, useFocusEffect } from 'expo-router';
import { Archive, ArchiveRestore, Blocks, Crown, Flag, Gauge, ListChecks, LogOut, ShieldHalf, Tablet, UserRoundPlus, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { isOn } from '@/lib/modules';
import { isAdmin, isOwner, K_SPEEDS, leagueAdminInfo, leaveLeague, ROLE_LABEL, setArchived, updateLeague } from '@/lib/admin';
import { SPORTS, sportOf } from '@/lib/sports';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Field, Icon, Pill, Screen, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

type Info = Awaited<ReturnType<typeof leagueAdminInfo>>;

export default function LeagueSettings() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me, reloadLeagues, refresh } = useLeague();
  const [info, setInfo] = useState<Info | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { if (league) setInfo(await leagueAdminInfo(league.id)); }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!league || !session) return null;
  const user = session.user;
  const archived = !!league.archived_at;
  const admin = isAdmin(me) && !archived;
  const owner = isOwner(me);
  const s = sportOf(sport ?? league.sport);
  const nameV = name ?? league.name, teamV = team ?? info?.team?.name ?? '';
  const dirty = nameV.trim() !== league.name || teamV.trim() !== (info?.team?.name ?? '') || s.id !== league.sport;
  const speed = K_SPEEDS.find((x) => x.k === league.k_factor);

  const fail = () => Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.');
  const after = async () => { await Promise.all([reloadLeagues(league.id), refresh(), load()]); };

  const saveGeneral = async () => {
    setBusy(true);
    try {
      await updateLeague(user, league.id, { name: nameV, team: teamV, sport: s.id });
      await after();
      setName(null); setTeam(null); setSport(null);
    } catch { fail(); }
    setBusy(false);
  };

  const archive = () => Alert.alert(
    archived ? `Restore ${league.name}?` : `Archive ${league.name}?`,
    archived ? 'Everyone can log matches again.' : 'No new matches. Everything stays readable. You can restore it any time.',
    [{ text: 'Cancel', style: 'cancel' }, { text: archived ? 'Restore' : 'Archive', onPress: async () => {
      try { await setArchived(user, league.id, !archived); await after(); } catch { fail(); }
    } }],
  );

  const leave = () => {
    if (owner) return Alert.alert('Transfer ownership first', 'Make someone an admin, then hand the league over to them. After that you can leave.', [
      { text: 'Not now', style: 'cancel' }, { text: 'Choose new owner', onPress: () => router.push('/league/members?transfer=1') },
    ]);
    Alert.alert(`Leave ${league.name}?`, 'Your matches stay in the history. You need the invite code to come back.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await leaveLeague(user, league.id); await reloadLeagues(); if (router.canDismiss()) router.dismissAll(); } catch { fail(); }
      } },
    ]);
  };

  const sportChip = (x: (typeof SPORTS)[number]) => {
    const on = x.id === s.id;
    return (
      <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSport(x.id)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surface2 }}>
        <Icon as={x.icon} size={16} color={on ? t.onPrimary : t.text} />
        <T v="label" c={on ? 'onPrimary' : 'text'}>{x.label}</T>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Header title="League settings" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 48, height: 48, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={sportOf(league.sport).icon} size={22} color={t.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={1}>{league.name}</T>
              <T v="caption" c="text3" numberOfLines={2}>{league.teams?.name}, {info?.memberCount ?? 0} members, {info?.matchCount ?? 0} matches</T>
            </View>
            {me ? <Pill label={ROLE_LABEL[me.role]} tone={owner ? 'brand' : 'neutral'} /> : null}
          </Card>

          {archived ? (
            <Card style={{ gap: space[3] }}>
              <T v="heading">Archived, read only</T>
              <T v="small" c="text2">No new matches. Everything stays readable.</T>
              {owner ? <Button label="Restore league" icon={ArchiveRestore} size="md" variant="secondary" onPress={archive} /> : null}
            </Card>
          ) : !isAdmin(me) ? (
            <T v="small" c="text2">Owners and admins change these settings. Here are the rules everyone plays by.</T>
          ) : null}

          {admin ? (
            <View style={{ gap: space[4] }}>
              <Field label="League name" value={nameV} onChangeText={setName} maxLength={40} />
              <Field label="Team name" value={teamV} onChangeText={setTeam} maxLength={40} />
              <View style={{ gap: space[2] }}>
                <T v="label" c="text2">Sport</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{SPORTS.map(sportChip)}</View>
                {s.id !== league.sport ? <T v="caption" c="text3">Ratings and matches stay. Icons and words change.</T> : null}
              </View>
              <Button label="Save" onPress={saveGeneral} loading={busy} disabled={!dirty || nameV.trim().length < 2 || teamV.trim().length < 2} />
            </View>
          ) : (
            <Group title="General">
              <Row first label="League name" value={league.name} />
              <Row label="Team" value={league.teams?.name} />
              <Row label="Sport" value={sportOf(league.sport).label} />
            </Group>
          )}

          <Group title="League">
            <Row first icon={Gauge} label="Rating" value={speed ? `${speed.label}, K ${league.k_factor}` : `K ${league.k_factor}`} onPress={() => router.push('/league/rules')} />
            <Row icon={Users} label="Members" value={String(info?.memberCount ?? '')} onPress={() => router.push('/league/members')} />
            <Row icon={ListChecks} label="Match rules" value={isOn(league, 'confirm') ? 'Opponent confirms' : 'Count right away'} onPress={() => router.push('/league/match-rules')} />
            {isOn(league, 'confirm') && isAdmin(me) ? <Row icon={Flag} label="Disputes" onPress={() => router.push('/league/disputes')} /> : null}
            {isAdmin(me) ? <Row icon={ShieldHalf} label="Moderation" onPress={() => router.push('/league/moderation')} /> : null}
            <Row icon={Blocks} label="Modules" value={isAdmin(me) ? undefined : 'View only'} onPress={() => router.push('/league/modules')} />
            {!archived ? <Row icon={UserRoundPlus} label="Add a player without an account" onPress={() => router.push('/guest-new')} /> : null}
            {admin ? <Row icon={Tablet} label="Turn this device into a kiosk" value={isOn(league, 'kiosk') ? undefined : 'Off'} onPress={() => router.push('/kiosk/setup')} /> : null}
          </Group>

          {owner ? (
            <Group title="Owner" footer="Only the owner can hand the league over or archive it.">
              <Row first icon={Crown} label="Transfer ownership" onPress={() => router.push('/league/members?transfer=1')} />
              <Row icon={archived ? ArchiveRestore : Archive} label={archived ? 'Restore league' : 'Archive league'} onPress={archive} />
            </Group>
          ) : null}

          <Group>
            <Row first icon={LogOut} label="Leave league" danger onPress={leave} />
          </Group>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
