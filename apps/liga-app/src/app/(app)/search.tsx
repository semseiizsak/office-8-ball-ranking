// N2 Global search, M6.2 Search matches
import { router } from 'expo-router';
import { ArrowLeft, Clock, Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { clearRecent, MIN_QUERY, recentSearches, rememberSearch, search, type LeagueHit, type MatchHit, type PlayerHit, type Results } from '@/lib/search';
import { sportOf } from '@/lib/sports';
import { clock, dayLabel } from '@/lib/time';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Empty, Icon, IconButton, Pill, Screen, Seg, Skeleton, T } from '@/ui';

type Scope = 'all' | 'players' | 'matches' | 'leagues';
const GROUP_MAX = 3;

export default function Search() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, leagues, select } = useLeague();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [everywhere, setEverywhere] = useState<'this' | 'all'>('this');
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const many = leagues.length > 1;
  const uid = session?.user.id;
  const leagueId = league?.id ?? null;

  useEffect(() => { recentSearches().then(setRecent); }, []);
  useEffect(() => {
    if (!uid || q.trim().length < MIN_QUERY) return;
    const id = setTimeout(async () => {
      setLoading(true);
      setRes(await search(uid, q, { leagueId, all: everywhere === 'all' }));
      setLoading(false);
    }, 250);
    return () => clearTimeout(id);
  }, [q, everywhere, uid, leagueId]);

  const typed = q.trim().length >= MIN_QUERY;
  const remember = () => { rememberSearch(q).then(() => recentSearches().then(setRecent)); };
  const go = async (lid: string, path: string) => {
    remember();
    if (lid !== leagueId) await select(lid);
    router.push(path as never);
  };

  const rowStyle = (pressed: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: space[3], padding: space[3], minHeight: 56, borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface });

  const playerRow = (h: PlayerHit) => (
    <Pressable key={h.member.id} accessibilityRole="button" onPress={() => go(h.leagueId, `/player/${h.member.id}`)} style={({ pressed }) => rowStyle(pressed)}>
      <Avatar name={h.member.display_name} colour={h.member.colour} jersey={h.member.jersey} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading" numberOfLines={1}>{h.mine ? `${h.member.display_name}, you` : h.member.display_name}</T>
        <T v="caption" c="text3" numberOfLines={1}>No. {h.member.jersey}, {h.league}, {fmt(h.member.rating)}{h.member.guest ? ', no account yet' : ''}</T>
      </View>
    </Pressable>
  );
  const matchRow = (h: MatchHit) => (
    <Pressable key={h.id} accessibilityRole="button" onPress={() => go(h.leagueId, `/match/${h.id}`)} style={({ pressed }) => rowStyle(pressed)}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading" numberOfLines={1}>{h.title}</T>
        <T v="caption" c="text3" numberOfLines={1}>{h.score ? `${h.score}, ` : ''}{dayLabel(h.played_at)} {clock(h.played_at)}</T>
      </View>
      {h.result ? <Pill label={h.result} tone={h.result === 'W' ? 'win' : 'loss'} /> : null}
    </Pressable>
  );
  const leagueRow = (h: LeagueHit) => {
    const l = leagues.find((x) => x.id === h.id);
    return (
      <Pressable key={h.id} accessibilityRole="button" onPress={async () => { remember(); await select(h.id); router.back(); }} style={({ pressed }) => rowStyle(pressed)}>
        <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={sportOf(l?.sport).icon} size={20} color={t.onBrand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading" numberOfLines={1}>{h.name}</T>
          <T v="caption" c="text3" numberOfLines={1}>{h.team}, {h.players} players</T>
        </View>
      </Pressable>
    );
  };

  const group = <X,>(key: Scope, title: string, list: X[], render: (x: X) => ReactNode) => {
    if (!list.length || (scope !== 'all' && scope !== key)) return null;
    const shown = scope === 'all' ? list.slice(0, GROUP_MAX) : list;
    return (
      <View key={key} style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
          <T v="label" c="text2">{title}</T>
          {scope === 'all' && list.length > GROUP_MAX ? (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setScope(key)}><T v="label">{list.length >= 30 ? 'See all' : `See all ${list.length}`}</T></Pressable>
          ) : null}
        </View>
        {shown.map(render)}
      </View>
    );
  };

  const results = () => {
    if (loading && !res) return [0, 1, 2].map((i) => <Skeleton key={i} h={56} />);
    if (!res) return null;
    const total = res.players.length + res.matches.length + (many ? res.leagues.length : 0);
    if (!total) return <Empty icon={SearchIcon} title={`No results for “${q.trim()}”`} body="Try a name, a score like 10:7, or a league." />;
    return [
      group('players', 'Players', res.players, playerRow),
      group('matches', 'Matches', res.matches, matchRow),
      many ? group('leagues', 'Leagues', res.leagues, leagueRow) : null,
    ];
  };

  const scopes: { value: Scope; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'players', label: 'Players' }, { value: 'matches', label: 'Matches' }];
  if (many) scopes.push({ value: 'leagues', label: 'Leagues' });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.pill, backgroundColor: t.surface2, paddingLeft: 14, gap: 8 }}>
          <Icon as={SearchIcon} size={18} color={t.text3} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Players, matches, leagues" placeholderTextColor={t.text3} returnKeyType="search"
            autoCorrect={false} onSubmitEditing={remember} accessibilityLabel="Search"
            style={{ flex: 1, height: 48, color: t.text, fontFamily: font.medium, fontSize: 16 }} />
          {q ? <IconButton icon={X} label="Clear search" tone="ghost" onPress={() => { setQ(''); setRes(null); }} /> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Seg value={scope} onChange={setScope} options={scopes} />
        {many ? <Seg value={everywhere} onChange={setEverywhere} options={[{ value: 'this', label: 'This league' }, { value: 'all', label: 'All leagues' }]} /> : null}
        {typed ? results() : recent.length ? (
          <View style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
              <T v="label" c="text2">Recent</T>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={async () => { await clearRecent(); setRecent([]); }}><T v="label">Clear recent</T></Pressable>
            </View>
            {recent.map((r) => (
              <Pressable key={r} accessibilityRole="button" onPress={() => setQ(r)} style={({ pressed }) => rowStyle(pressed)}>
                <Icon as={Clock} size={18} color={t.text3} />
                <T v="body" style={{ flex: 1 }} numberOfLines={1}>{r}</T>
              </Pressable>
            ))}
          </View>
        ) : (
          <T v="small" c="text3" center>Search by name, a score like 10:7, or a league.</T>
        )}
      </ScrollView>
    </Screen>
  );
}
