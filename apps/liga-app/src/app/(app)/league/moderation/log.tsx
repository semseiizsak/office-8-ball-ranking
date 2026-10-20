// K11.4 Moderation log: who did what and when, filter by admin and action; the full log comes with Team
import { router, useFocusEffect, type Href } from 'expo-router';
import { Lock, ScrollText } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LOG_ACTIONS, moderationLog, type LogAction } from '@/lib/moderation';
import { clock, dayLabel } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof moderationLog>>;
type Entry = Data['rows'][number];

export default function ModLog() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [actor, setActor] = useState<string | null>(null);
  const [action, setAction] = useState<LogAction | null>(null);
  const [d, setD] = useState<Data | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!session || !league) return;
    try { setD(await moderationLog(session.user, league.id, { actor, action })); } catch { setD(null); }
  }, [session, league, actor, action]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={press}
      style={{ height: 44, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? t.onPrimary : t.text }}>{label}</Text>
    </Pressable>
  );

  const row = (x: Entry, i: number) => (
    <Pressable key={x.id} accessibilityRole={x.ref ? 'button' : undefined} disabled={!x.ref}
      onPress={() => x.ref && router.push({ pathname: '/league/moderation/report', params: { id: x.ref } })}
      style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: 52,
        borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface3 : 'transparent' })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T>{x.actorName} {x.text}{x.reason ? `, ${x.reason}` : ''}</T>
        <T v="caption" c="text3">{dayLabel(x.at)}, {clock(x.at)}</T>
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <Header title="Moderation log" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        {d === undefined ? <View style={{ gap: space[2] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={56} />)}</View> : !d ? (
          <Empty icon={ScrollText} title="For owners and admins" body="The log shows what admins did in this league." />
        ) : (
          <>
            {d.pro ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
                  {chip('all', 'Everyone', !actor, () => setActor(null))}
                  {d.actors.map((a) => chip(a.id, a.name, actor === a.id, () => setActor(a.id)))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
                  {chip('any', 'All actions', !action, () => setAction(null))}
                  {LOG_ACTIONS.map((a) => chip(a.id, a.label, action === a.id, () => setAction(a.id)))}
                </ScrollView>
              </>
            ) : null}
            {d.rows.length ? <View style={{ borderRadius: radius.md, backgroundColor: t.surface, overflow: 'hidden' }}>{d.rows.map(row)}</View>
              : <Empty icon={ScrollText} title="No moderation actions yet" body="Removed messages, mutes and settings changes show up here." />}
            {!d.pro && d.total > d.rows.length ? (
              <Card onPress={() => router.push('/plans' as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Icon as={Lock} size={20} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="heading">Full log with Team</T>
                  <T v="small" c="text2">{d.total - d.rows.length} more {d.total - d.rows.length === 1 ? 'entry' : 'entries'}, plus filters by admin and action.</T>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
