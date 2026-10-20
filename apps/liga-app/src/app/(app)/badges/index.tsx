// G4 Achievements hub, G4.1 Timeline, G4.2 Collection, R2.4 Badges with titles.
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Award, Plus, Search } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';

import { badgeBook, setFunBadges, type Book, type BadgeView } from '@/lib/badges';
import { CATEGORIES, TIER_LABEL, TIERS, type Category } from '@/lib/progress-engine';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Field, Screen, Seg, Skeleton, T } from '@/ui';
import { Bar, Medal, TierPill } from '@/ui/badges-kit';
import { Header } from '@/ui/list-row';
import { Chip } from '@/ui/tabs';

type View_ = 'timeline' | 'collection';
type Filter = 'all' | 'earned' | 'progress' | 'locked' | Category;
const pct = (x: number) => `${Math.max(1, Math.round(x * 100))}%`;
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Badges() {
  const { t } = useTheme();
  const { member: param } = useLocalSearchParams<{ member?: string }>();
  const { league, members, me } = useLeague();
  const { session } = useAuth();
  const id = param ?? me?.id ?? '';
  const m = members.find((x) => x.id === id);
  const [book, setBook] = useState<Book | undefined>(undefined);
  const [view, setView] = useState<View_>('timeline');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const admin = me?.role === 'owner' || me?.role === 'admin';

  const load = useCallback(async () => { if (league && id) setBook(await badgeBook(league.id, id)); }, [league, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isMe = id === me?.id;
  const name = (x: string) => (x === me?.id ? 'You' : members.find((y) => y.id === x)?.display_name ?? 'Former player');
  const open = (badge: string) => router.push(`/badges/${badge}?member=${id}` as Href);

  const summary = (b: NonNullable<Book>) => (
    <Card style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <Medal tier={b.overall.tier} icon="award" size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading">{b.overall.tier ? `${TIER_LABEL[b.overall.tier]} tier, ${b.earnedCount} of ${b.total}` : `${b.earnedCount} of ${b.total} earned`}</T>
          <T v="small" c="text2">{b.overall.next ? `${b.overall.left} more for ${TIER_LABEL[b.overall.next]}` : 'Top tier reached'}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {TIERS.map((tier) => (
          <View key={tier} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Medal tier={b.tierCount[tier] ? tier : null} icon="medal" size={36} />
            <T v="label" c={b.tierCount[tier] ? 'text' : 'text3'}>{b.tierCount[tier]}</T>
            <T v="caption" c="text3">{TIER_LABEL[tier]}</T>
          </View>
        ))}
      </View>
    </Card>
  );

  const nextCard = (v: BadgeView) => (
    <Pressable accessibilityRole="button" onPress={() => open(v.def.id)}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.brandPress : t.brand, borderRadius: radius.md, padding: space[4], gap: space[3] })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Medal tier={v.next.tier} icon={v.def.icon} size={48} />
        <View style={{ flex: 1 }}>
          <T v="heading" c="onBrand">{v.def.name}</T>
          <T v="small" c="onBrand">{v.def.rule(v.next.goal)}</T>
        </View>
        <T v="label" c="onBrand">{v.next.value} of {v.next.goal}</T>
      </View>
      <Bar value={v.next.value / v.next.goal} color="#FFFFFF" track={t.brandPress} />
    </Pressable>
  );

  const timeline = (b: NonNullable<Book>) => {
    const groups: { month: string; items: typeof b.timeline }[] = [];
    b.timeline.forEach((e) => { const k = monthOf(e.at); const g = groups[groups.length - 1]; if (g?.month === k) g.items.push(e); else groups.push({ month: k, items: [e] }); });
    return (
      <>
        {b.next ? nextCard(b.next) : null}
        {groups.map((g) => (
          <View key={g.month} style={{ gap: space[2] }}>
            <T v="label" c="text2" style={{ marginTop: space[2] }}>{g.month}</T>
            {g.items.map((e, i) => (
              <Pressable key={`${e.id}:${e.step}`} accessibilityRole="button" onPress={() => open(e.id)} style={{ flexDirection: 'row', gap: space[3] }}>
                <View style={{ width: 52, paddingTop: 14, alignItems: 'flex-end' }}>
                  <T v="label">{dayOf(e.at)}</T>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Medal tier={e.tier} icon={e.def.icon} size={44} />
                  {i < g.items.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: t.lineStrong, marginTop: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 4, marginBottom: space[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{e.def.name}</T>
                    <TierPill tier={e.tier} />
                  </View>
                  <T v="small" c="text2">{e.def.rule(e.def.goals[e.step])}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <View style={{ width: 40 }}><Bar value={e.rarity} h={4} color={t.text2} /></View>
                    <T v="caption" c="text3">{pct(e.rarity)} of players have this</T>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </>
    );
  };

  const tile = (v: BadgeView) => {
    const inProgress = !v.next.done && (v.steps > 0 || v.value > 0);
    return (
      <Pressable key={v.def.id} accessibilityRole="button" accessibilityLabel={v.hidden ? 'Secret badge' : `${v.def.name}, ${v.steps} of ${v.def.goals.length} earned`} onPress={() => open(v.def.id)}
        style={({ pressed }) => ({ width: '31.5%', flexGrow: 1, maxWidth: '33%', backgroundColor: pressed ? t.surface3 : t.surface, borderRadius: radius.md, padding: space[3], alignItems: 'center', gap: 6 })}>
        <Medal tier={v.top} icon={v.hidden ? 'sparkles' : v.def.icon} size={56} locked={!v.steps} />
        <T v="label" center numberOfLines={1} c={v.steps ? 'text' : 'text2'}>{v.hidden ? 'Secret' : v.def.name}</T>
        {v.def.goals.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {v.def.goals.map((_, i) => <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i < v.steps ? t.text : t.surface3 }} />)}
          </View>
        ) : null}
        {v.hidden ? <T v="caption" c="text3">Keep playing</T> : v.next.done ? <T v="caption" c="text3">Complete</T> : inProgress ? (
          <View style={{ alignSelf: 'stretch', gap: 4 }}>
            <T v="caption" c="text3" center>{v.next.value} of {v.next.goal}</T>
            <Bar value={v.next.value / v.next.goal} h={4} color={t.text2} />
          </View>
        ) : <T v="caption" c="text3">Locked</T>}
      </Pressable>
    );
  };

  const collection = (b: NonNullable<Book>) => {
    const s = q.trim().toLowerCase();
    const list = b.list.filter((v) =>
      (filter === 'all' || (filter === 'earned' && v.steps > 0) || (filter === 'progress' && !v.next.done && (v.steps > 0 || v.value > 0)) || (filter === 'locked' && !v.steps) || v.def.cat === filter)
      && (!s || (!v.hidden && v.def.name.toLowerCase().includes(s))));
    const counts = { earned: b.list.filter((v) => v.steps).length, progress: b.list.filter((v) => !v.next.done && (v.steps || v.value)).length };
    const cats = CATEGORIES.filter((c) => b.list.some((v) => v.def.cat === c.id));
    return (
      <>
        {b.list.length > 20 ? <Field placeholder="Search badges" value={q} onChangeText={setQ} autoCorrect={false} accessibilityLabel="Search badges" /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {([['all', 'All'], ['earned', `Earned ${counts.earned}`], ['progress', `In progress ${counts.progress}`], ['locked', 'Locked']] as const).map(([v, l]) => (
            <Chip key={v} label={l} on={filter === v} onPress={() => setFilter(v)} />
          ))}
          {cats.map((c) => <Chip key={c.id} label={c.label} on={filter === c.id} onPress={() => setFilter(c.id)} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{list.map(tile)}</View>
        {!list.length ? <Empty icon={Search} title="Nothing here" body="No badges with this filter." /> : null}
      </>
    );
  };

  const titles = (b: NonNullable<Book>) => b.titles.length ? (
    <View style={{ gap: space[2] }}>
      <T v="section" style={{ marginTop: space[4] }}>Titles</T>
      <Card style={{ gap: space[1], paddingVertical: space[2] }}>
        {b.titles.map((x) => {
          const holder = members.find((y) => y.id === x.who);
          return (
            <Pressable key={x.key} accessibilityRole="button" onPress={() => router.push(`/player/${x.who}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, borderRadius: radius.sm, paddingHorizontal: space[1], backgroundColor: pressed ? t.surface3 : 'transparent' })}>
              {holder ? <Avatar name={holder.display_name} colour={holder.colour} size={36} /> : null}
              <View style={{ flex: 1 }}>
                <T v="label">{x.label}</T>
                <T v="caption" c="text3">{name(x.who)}, {x.value}</T>
              </View>
              {x.who === id ? <TierPill tier="gold" label="Held" /> : null}
            </Pressable>
          );
        })}
      </Card>
      <T v="caption" c="text3">Titles go to whoever leads right now, so they can change hands any match.</T>
    </View>
  ) : null;

  const body = () => {
    if (book === undefined) return [0, 1, 2].map((i) => <Skeleton key={i} h={110} />);
    if (book === null) return <Empty icon={Award} title="Badges are off" body="An admin can turn on badges and titles in the league modules." />;
    return (
      <>
        {summary(book)}
        <Seg value={view} onChange={setView} options={[{ value: 'timeline', label: 'Timeline' }, { value: 'collection', label: 'Collection' }]} />
        {view === 'timeline' && !book.timeline.length ? (
          <Empty icon={Award} title={isMe ? 'Your first badge is one match away' : 'No badges yet'}
            body={isMe ? 'Log your first match to earn First Blood.' : `${m?.display_name ?? 'They'} will earn badges by playing.`}
            action={isMe ? <Button label="Log match" icon={Plus} size="md" onPress={() => router.push('/log')} /> : undefined} />
        ) : view === 'timeline' ? timeline(book) : collection(book)}
        {titles(book)}
        {admin && session && league ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: t.surface, borderRadius: radius.md, padding: space[4], marginTop: space[4] }}>
            <View style={{ flex: 1 }}>
              <T v="label">Fun badges</T>
              <T v="caption" c="text3">Clown Car, Cursed and The Duck. Admins only.</T>
            </View>
            <Switch value={book.fun} accessibilityLabel="Fun badges" trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF"
              onValueChange={async (on) => { await setFunBadges(session.user, league.id, on); load(); }} />
          </View>
        ) : null}
      </>
    );
  };

  return (
    <Screen>
      <Header title={isMe || !m ? 'Badges' : `${m.display_name}, badges`} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: space[2], gap: space[3], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {body()}
      </ScrollView>
    </Screen>
  );
}
