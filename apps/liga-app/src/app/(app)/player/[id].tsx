import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, BarChart3, ChevronRight, Crown, Info, MoreHorizontal, Pencil, Plus, Search, Swords, UserX } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { eloPreview } from '@/lib/elo';
import { DORMANT_DAYS, historySince, PROVISIONAL, playerStats, splitLadder, standingOf, type PlayerStats, type Rival } from '@/lib/stats';
import { dayLabel } from '@/lib/time';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Field, Icon, IconButton, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { FormDots, LineChart, RateBar } from '@/ui/chart';
import { ProfileProgress } from '@/ui/badges-kit';
import { MatchCard } from '@/ui/match-card';
import { goChallenge, goCompare, goH2H, PlayerMenu } from '@/ui/player-menu';
import { Chip, Tabs } from '@/ui/tabs';

type Tab = 'overview' | 'stats' | 'rivals' | 'matches';
type Filter = 'all' | 'wins' | 'losses' | '1v1' | '2v2';
type RivalSort = 'played' | 'best' | 'worst' | 'recent';
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PAGE = 20;
const pct = (won: number, played: number) => (played ? Math.round((won / played) * 100) : 0);

// R2 own profile, R3 other player's profile (header plus Overview, Stats, Rivals, Matches),
// R2.2 with R2.2.1 and R2.2.2, R2.3 with R2.3.1, R2.5 with R2.5.1 filters, R3.1 more menu, R10 former player.
export default function Player() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, me, league } = useLeague();
  const [s, setS] = useState<PlayerStats | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [opp, setOpp] = useState<string | null>(null);
  const [page, setPage] = useState(PAGE);
  const [allRivals, setAllRivals] = useState(false);
  const [query, setQuery] = useState('');
  const [rivalSort, setRivalSort] = useState<RivalSort>('played');
  const [partnerSort, setPartnerSort] = useState<'played' | 'rate'>('played');

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => setS(await playerStats(league.id, id)))();
  }, [league, id, members])); // eslint-disable-line react-hooks/exhaustive-deps

  const m = members.find((x) => x.id === id);
  const byId = useMemo(() => new Map(members.map((x) => [x.id, x])), [members]);
  const name = (mid: string) => (mid === me?.id ? 'You' : byId.get(mid)?.display_name ?? 'Former player');

  // R10.1 and R10.2: left or removed players keep their history but have no profile here.
  if (!m) {
    return (
      <Screen>
        <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}>
          <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        </View>
        <Empty icon={UserX} title="No longer in this league" body="Their matches stay in the history, so everyone's ratings stay the same." />
      </Screen>
    );
  }

  const isMe = m.id === me?.id;
  const standing = standingOf(members, m.id)!;
  const { ranked } = splitLadder(members);
  const crowned = standing.kind === 'ranked' && standing.rank === 1;
  const played = m.wins + m.losses;
  const k = league?.k_factor ?? 32;
  const stake = me && !isMe ? eloPreview(me.rating, m.rating, k) : null;

  const bigStat = (label: string, value: string, onPress?: () => void) => (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? t.surface3 : t.surface, borderRadius: radius.md, padding: space[3], gap: 2, minHeight: 64 })}>
      <T v="number">{value}</T>
      <T v="caption" c="text3">{label}</T>
    </Pressable>
  );
  const tile = (label: string, value: string) => (
    <View key={label} style={{ width: '31.5%', flexGrow: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 2 }}>
      <T v="number" numberOfLines={1}>{value}</T>
      <T v="caption" c="text3" numberOfLines={1}>{label}</T>
    </View>
  );
  const linkRow = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <T v="label">{label}</T>
      <Icon as={ChevronRight} size={18} color={t.text3} />
    </Pressable>
  );
  const rankLabel = standing.kind === 'ranked' ? `#${standing.rank} of ${standing.of}` : standing.kind === 'new' ? `${played} of ${PROVISIONAL}` : 'Dormant';

  /* ---------- header (R2.0, R3) ---------- */
  const header = (
    <View style={{ gap: space[3] }}>
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={104} />
        <T v="title" style={{ marginTop: space[2] }} center numberOfLines={1}>{m.display_name}</T>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {crowned ? <Pill label="Crown" tone="crown" icon={Crown} /> : null}
          {standing.kind === 'new' ? <Pill label="New" tone="brand" /> : null}
          {standing.kind === 'dormant' ? <Pill label="Dormant" /> : null}
          {m.streak >= 2 ? <Pill label={`Streak W${m.streak}`} /> : null}
        </View>
        {s?.playedToday ? <T v="label" c={s.today > 0 ? 'win' : 'text2'}>{signed(s.today)} today</T> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {bigStat('Rating', `${fmt(m.rating)}${standing.kind === 'new' ? '?' : ''}`, () => router.push(`/rating/${m.id}`))}
        {bigStat(standing.kind === 'new' ? 'Matches to rank' : 'Rank', rankLabel, standing.kind === 'new' ? () => router.push({ pathname: '/elo', params: { topic: 'new' } }) : undefined)}
        {bigStat('Win rate', played ? `${pct(m.wins, played)}%` : 'None yet', () => setTab('stats'))}
      </View>
      {isMe ? (
        <View style={{ flexDirection: 'row', gap: space[2], justifyContent: 'center' }}>
          <Button label="Edit profile" icon={Pencil} size="md" variant="secondary" onPress={() => router.push('/profile-edit')} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <Button label={standing.kind === 'dormant' ? 'Challenge to wake up' : `Challenge ${m.display_name}`} icon={Swords} size="md" style={{ flex: 1 }}
            onPress={() => goChallenge(m.id)} />
          {me ? <IconButton icon={BarChart3} label={`Compare with ${m.display_name}`} onPress={() => goCompare(me.id, m.id)} /> : null}
          <IconButton icon={MoreHorizontal} label="More" onPress={() => setMenu(true)} />
        </View>
      )}
      {stake ? <T v="caption" c="text2" center>If you win {signed(stake.aWins)}, if you lose {signed(stake.bWins)}.</T> : null}
    </View>
  );

  /* ---------- Overview (R2.1) ---------- */
  const above = (() => { const i = ranked.findIndex((x) => x.id === m.id); return i > 0 ? ranked[i - 1] : null; })();
  const target = () => {
    if (!isMe || !s) return null;
    let text = '', who: Member | null = null;
    if (standing.kind === 'new') text = `${standing.left} more ${standing.left === 1 ? 'match' : 'matches'} to get ranked.`;
    else if (standing.kind === 'dormant') text = 'Play one match to rejoin the ladder.';
    else if (crowned) text = 'You wear the crown. Win to defend it.';
    else if (above) {
      const gap = above.rating - m.rating + 1;
      const win = eloPreview(m.rating, above.rating, k).aWins;
      const wins = Math.max(1, Math.ceil(gap / Math.max(win, 1)));
      text = `${gap} points to pass ${above.display_name}. About ${wins} ${wins === 1 ? 'win' : 'wins'}.`;
      who = above;
    }
    if (!text) return null;
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label">Next target</T>
          <T v="small" c="text2">{text}</T>
        </View>
        {who ? <Button label="Challenge" size="sm" variant="secondary" onPress={() => goChallenge(who.id)} /> : null}
      </Card>
    );
  };
  const rival = s ? s.nemesis ?? s.rivals[0] ?? null : null;
  const recent = s ? s.entries.slice(-4).reverse() : [];
  const month = s ? historySince(s.history, 30) : [];
  const monthLine = s && month.length < 2 ? s.history.slice(-2) : month;

  const overview = () => {
    if (!s) return [0, 1, 2].map((i) => <Skeleton key={i} h={110} />);
    if (!s.played) {
      return isMe ? (
        <Card style={{ alignItems: 'center', gap: space[3], paddingVertical: space[6] }}>
          <T v="heading" center>Your first match puts you on the board</T>
          <T v="small" c="text2" center>Win or lose, the ladder starts moving.</T>
          <Button label="Log match" icon={Plus} onPress={() => router.push('/log')} />
        </Card>
      ) : <Empty icon={Swords} title="No matches yet" body={`${m.display_name} has not played yet. Be the first.`} />;
    }
    const wins10 = s.form.filter((r) => r === 'W').length;
    return (
      <>
        <Card style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label">Form{m.streak > 0 ? ` W${m.streak}` : m.streak < 0 ? ` L${-m.streak}` : ''}</T>
            <T v="caption" c="text3">{wins10} of last {s.form.length} won</T>
          </View>
          <FormDots form={s.form} />
        </Card>
        {target()}
        <ProfileProgress member={m} isMe={isMe} />
        <Card onPress={() => router.push(`/rating/${m.id}`)} style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label">Rating, 30 days</T>
            <T v="label" c={monthLine[monthLine.length - 1].rating - monthLine[0].rating > 0 ? 'win' : 'text2'}>{signed(monthLine[monthLine.length - 1].rating - monthLine[0].rating)}</T>
          </View>
          {s.played >= 3 ? <LineChart series={[{ values: monthLine.map((p) => p.rating), color: t.pct[m.colour] }]} height={96} baseline={monthLine[0].rating} />
            : <T v="small" c="text2">Your chart starts after 3 matches.</T>}
        </Card>
        {rival && me ? (
          <Card onPress={() => goH2H(m.id, rival.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            {byId.get(rival.id) ? <Avatar name={byId.get(rival.id)!.display_name} colour={byId.get(rival.id)!.colour} size={44} /> : null}
            <View style={{ flex: 1 }}>
              <T v="label">{s.nemesis ? 'Nemesis' : 'Most played'}, {name(rival.id)}</T>
              <T v="caption" c="text3">{rival.played} played</T>
            </View>
            <T v="number">{rival.won} : {rival.lost}</T>
          </Card>
        ) : null}
        <T v="section" style={{ marginTop: space[2] }}>Recent</T>
        {recent.map((e) => <MatchCard key={e.match.id} match={e.match} members={members} meId={me?.id} />)}
        {s.played > 4 ? <Button label="See all matches" variant="secondary" size="md" onPress={() => setTab('matches')} /> : null}
      </>
    );
  };

  /* ---------- Stats (R2.2, R2.2.1, R2.2.2) ---------- */
  const stats = () => {
    if (!s) return [0, 1].map((i) => <Skeleton key={i} h={140} />);
    const fmtRow = (label: string, x: { played: number; won: number; net: number }) => (
      <View key={label} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="label">{label}</T>
          <T v="caption" c="text2">{x.played} played, {pct(x.won, x.played)}%, {signed(x.net)}</T>
        </View>
        <RateBar value={x.played ? x.won / x.played : 0} />
      </View>
    );
    const partners = [...s.byPartner].sort((a, b) => (partnerSort === 'played' ? b.played - a.played : b.won / b.played - a.won / a.played));
    const maxDay = Math.max(1, ...s.byWeekday.map((d) => d.played));
    return (
      <>
        <Card onPress={() => router.push(`/rating/${m.id}`)} style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T v="bigNumber" style={{ fontSize: 36, lineHeight: 40 }}>{fmt(m.rating)}</T>
            <T v="caption" c="text3">Peak {fmt(s.peak)}</T>
          </View>
          {s.played >= 3 ? <LineChart series={[{ values: s.history.map((p) => p.rating), color: t.pct[m.colour] }]} height={96} baseline={s.start} /> : null}
          <T v="caption" c="text3">Tap for the full rating history</T>
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {tile('Matches', String(s.played))}
          {tile('Won', String(s.won))}
          {tile('Lost', String(s.played - s.won))}
          {tile('Peak', fmt(s.peak))}
          {tile('Best streak', s.bestStreak ? `W${s.bestStreak}` : '0')}
          {tile('Upsets', String(s.upsets.won))}
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {tile('Avg opponent', s.avgOpp ? fmt(s.avgOpp) : '0')}
          {tile('Biggest win', s.biggestWin ? `${signed(s.biggestWin.mp.delta)} vs ${s.biggestWin.opponents.map(name).join(' and ')}` : 'None yet')}
        </View>
        {s.played < 5 ? (
          <Card><T v="small" c="text2" center>Stats fill in after 5 matches.</T></Card>
        ) : (
          <>
            <Card style={{ gap: space[3] }}>
              <T v="heading">Win rate by mode</T>
              {s.byFormat['1v1'].played ? fmtRow('1v1', s.byFormat['1v1']) : null}
              {s.byFormat['2v2'].played ? fmtRow('2v2', s.byFormat['2v2']) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="label">Upsets</T>
                <T v="caption" c="text2">{s.upsets.won} won as the underdog, {s.upsets.lost} lost as the favourite</T>
              </View>
              {!s.byFormat['1v1'].played || !s.byFormat['2v2'].played ? <T v="caption" c="text3">Play the other format to compare.</T> : null}
            </Card>
            {s.byPartner.length ? (
              <Card style={{ gap: space[3] }}>
                <T v="heading">Partners in 2v2</T>
                {s.bestPartner ? <T v="small" c="text2">Best partner, {name(s.bestPartner.id)}, {s.bestPartner.won} of {s.bestPartner.played} won</T> : null}
                {s.toughestPartner ? <T v="small" c="text2">Toughest pairing, {name(s.toughestPartner.id)}, {s.toughestPartner.won} of {s.toughestPartner.played} won</T> : null}
                <Seg value={partnerSort} onChange={setPartnerSort} options={[{ value: 'played', label: 'Most played' }, { value: 'rate', label: 'Win rate' }]} />
                {partners.map((p) => {
                  const pm = byId.get(p.id);
                  return (
                    <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/pair/[a]/[b]', params: { a: m.id, b: p.id } })}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
                      {pm ? <Avatar name={pm.display_name} colour={pm.colour} size={36} /> : null}
                      <T v="label" style={{ flex: 1 }} numberOfLines={1}>{name(p.id)}</T>
                      <T v="caption" c="text2">{p.played} played, {pct(p.won, p.played)}%</T>
                      <Icon as={ChevronRight} size={16} color={t.text3} />
                    </Pressable>
                  );
                })}
              </Card>
            ) : null}
            <Card style={{ gap: space[3] }}>
              <T v="heading">When you play</T>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2], height: 96 }}>
                {s.byWeekday.map((d, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <T v="caption" c="text3">{d.played ? `${pct(d.won, d.played)}%` : ''}</T>
                    <View style={{ width: '70%', height: Math.max(3, (d.played / maxDay) * 56), borderRadius: 4, backgroundColor: d.played ? t.text2 : t.surface2 }} />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                {WEEK.map((w) => <T key={w} v="caption" c="text3" center style={{ flex: 1 }}>{w}</T>)}
              </View>
              {(() => {
                const best = s.byWeekday.map((d, i) => ({ ...d, i })).filter((d) => d.played >= 3).sort((a, b) => b.won / b.played - a.won / a.played)[0];
                return best ? <T v="caption" c="text2">Best day: {WEEK[best.i]}, {pct(best.won, best.played)}% won</T> : null;
              })()}
            </Card>
          </>
        )}
        {me && !isMe ? linkRow(`Compare you and ${m.display_name}`, () => goCompare(me.id, m.id)) : null}
      </>
    );
  };

  /* ---------- Rivals (R2.3, R2.3.1) ---------- */
  const rivalRow = (r: Rival) => {
    const rm = byId.get(r.id);
    return (
      <Pressable key={r.id} accessibilityRole="button" onPress={() => goH2H(m.id, r.id)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: pressed ? t.surface3 : 'transparent' })}>
        {rm ? <Avatar name={rm.display_name} colour={rm.colour} jersey={rm.jersey} size={40} /> : <Avatar name="?" colour="ink" size={40} ring={false} />}
        <View style={{ flex: 1 }}>
          <T v="heading" numberOfLines={1}>{name(r.id)}</T>
          <T v="caption" c="text3">{r.played} played, last match {['Today', 'Yesterday'].includes(dayLabel(r.last)) ? dayLabel(r.last).toLowerCase() : new Date(r.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, {signed(r.net)}</T>
        </View>
        <T v="number">{r.won} : {r.lost}</T>
      </Pressable>
    );
  };
  const storyCard = (label: string, r: Rival, line: string, action?: { label: string; run: () => void }) => {
    const rm = byId.get(r.id);
    return (
      <Card onPress={() => goH2H(m.id, r.id)} style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {rm ? <Avatar name={rm.display_name} colour={rm.colour} jersey={rm.jersey} size={52} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" c="text2">{label}</T>
            <T v="section" numberOfLines={1}>{name(r.id)}</T>
            <T v="caption" c="text3">{line}</T>
          </View>
          <T v="number">{r.won} : {r.lost}</T>
        </View>
        {action ? <Button label={action.label} size="sm" variant="secondary" onPress={action.run} style={{ alignSelf: 'flex-start' }} /> : null}
      </Card>
    );
  };
  const rivals = () => {
    if (!s) return [0, 1].map((i) => <Skeleton key={i} h={100} />);
    if (!s.rivals.length) return <Empty icon={Swords} title="No opponents yet" body="Every match adds a head to head record." />;
    const run = (r: Rival) => { const x = s.lastRun(r.id); return x.n >= 2 ? `${x.won ? 'won' : 'lost'} last ${x.n}, ` : ''; };
    const q = query.trim().toLowerCase();
    const list = s.rivals.filter((r) => !q || name(r.id).toLowerCase().includes(q)).sort((a, b) =>
      rivalSort === 'best' ? b.won / b.played - a.won / a.played || b.played - a.played
        : rivalSort === 'worst' ? a.won / a.played - b.won / b.played || b.played - a.played
          : rivalSort === 'recent' ? b.last.localeCompare(a.last) : 0);
    const current = list.filter((r) => byId.has(r.id)), former = list.filter((r) => !byId.has(r.id));
    return (
      <>
        {s.nemesis ? storyCard('Nemesis', s.nemesis, `${run(s.nemesis)}rating ${signed(s.nemesis.net)}`, isMe ? { label: 'Rematch', run: () => goChallenge(s.nemesis!.id) } : undefined) : null}
        {s.victim ? storyCard('Favourite victim', s.victim, `${run(s.victim)}rating ${signed(s.victim.net)}`) : null}
        {!s.nemesis && !s.victim ? <Card><T v="small" c="text2" center>Play 3 matches against someone to start a rivalry.</T></Card> : null}
        <T v="section" style={{ marginTop: space[2] }}>{allRivals ? 'All opponents' : 'Head to head'}</T>
        {allRivals ? (
          <>
            <Field placeholder="Search opponents" value={query} onChangeText={setQuery} autoCorrect={false} accessibilityLabel="Search opponents" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
              {([['played', 'Most played'], ['best', 'Best record'], ['worst', 'Worst record'], ['recent', 'Recent']] as const).map(([v, l]) => (
                <Chip key={v} label={l} on={rivalSort === v} onPress={() => setRivalSort(v)} />
              ))}
            </ScrollView>
            {current.map(rivalRow)}
            {former.length ? <T v="label" c="text2" style={{ marginTop: space[2] }}>Former players</T> : null}
            {former.map(rivalRow)}
            {!list.length ? <Empty icon={Search} title="No one found" body={`No one called ${query.trim()} here.`} /> : null}
          </>
        ) : (
          <>
            {s.rivals.slice(0, 5).map(rivalRow)}
            {s.rivals.length > 5 ? <Button label="See all opponents" variant="secondary" size="md" onPress={() => setAllRivals(true)} /> : null}
          </>
        )}
      </>
    );
  };

  /* ---------- Matches (R2.5, R2.5.1) ---------- */
  const matches = () => {
    if (!s) return [0, 1].map((i) => <Skeleton key={i} h={150} />);
    if (!s.played) return <Empty icon={Swords} title="No matches yet" body={isMe ? 'Log your first match to get ranked.' : `${m.display_name} has not played yet.`} />;
    const opps = s.rivals.slice(0, 12);
    const list = s.entries.slice().reverse().filter((e) =>
      (filter === 'all' || (filter === 'wins' && e.won) || (filter === 'losses' && !e.won) || e.match.format === filter) && (!opp || e.opponents.includes(opp)));
    const shown = list.slice(0, page);
    const groups: { day: string; items: typeof shown }[] = [];
    shown.forEach((e) => { const d = dayLabel(e.at); const g = groups[groups.length - 1]; if (g?.day === d) g.items.push(e); else groups.push({ day: d, items: [e] }); });
    return (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {([['all', 'All'], ['wins', 'Wins'], ['losses', 'Losses'], ['1v1', '1v1'], ['2v2', '2v2']] as const).map(([v, l]) => (
            <Chip key={v} label={l} on={filter === v} onPress={() => { setFilter(v); setPage(PAGE); }} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          <Chip label="Any opponent" on={!opp} onPress={() => { setOpp(null); setPage(PAGE); }} />
          {opps.map((r) => <Chip key={r.id} label={`vs ${name(r.id)}`} on={opp === r.id} onPress={() => { setOpp(opp === r.id ? null : r.id); setPage(PAGE); }} />)}
        </ScrollView>
        <T v="caption" c="text3">{list.length} {list.length === 1 ? 'match' : 'matches'}</T>
        {groups.map((g) => (
          <View key={g.day} style={{ gap: space[2] }}>
            <T v="label" c="text2" style={{ marginTop: space[2] }}>{g.day}</T>
            {g.items.map((e) => <MatchCard key={e.match.id} match={e.match} members={members} meId={me?.id} />)}
          </View>
        ))}
        {!list.length ? <Empty icon={Swords} title="Nothing here" body="No matches with these filters." action={<Button label="Reset filters" size="md" variant="secondary" onPress={() => { setFilter('all'); setOpp(null); }} />} /> : null}
        {list.length > page ? <Button label="Load more" variant="secondary" size="md" onPress={() => setPage(page + PAGE)} /> : null}
      </>
    );
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        {isMe ? <IconButton icon={Info} label="How ratings work" onPress={() => router.push('/elo')} /> : null}
        {isMe && (above ?? ranked.find((x) => x.id !== m.id)) ? (
          <IconButton icon={BarChart3} label="Compare with someone" onPress={() => goCompare(m.id, (above ?? ranked.find((x) => x.id !== m.id))!.id)} />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, gap: space[3], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {header}
        {standing.kind === 'dormant' && isMe ? (
          <View style={{ backgroundColor: t.warning, borderRadius: radius.sm, padding: space[3] }}>
            <T v="label" c="#0A0A0A">No match in {standing.days} days. Play one to rejoin the ladder.</T>
          </View>
        ) : null}
        <View style={{ marginTop: space[2] }}>
          <Tabs value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'stats', label: 'Stats' }, { value: 'rivals', label: 'Rivals' }, { value: 'matches', label: 'Matches' }]} />
        </View>
        {tab === 'overview' ? overview() : tab === 'stats' ? stats() : tab === 'rivals' ? rivals() : matches()}
        {tab !== 'rivals' && standing.kind === 'dormant' && !isMe ? <T v="caption" c="text3" center>Dormant after {DORMANT_DAYS} days without a match.</T> : null}
      </ScrollView>
      <PlayerMenu member={menu ? m : null} me={me} leagueId={league?.id} onClose={() => setMenu(false)} />
    </Screen>
  );
}
