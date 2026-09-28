import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Pencil, Swords } from 'lucide-react';
import { Challenge, Player, MatchRecord } from '../types';
import { LeagueInsights, findTopRival, RIVALRY_RACE_TARGET } from '../utils/league';
import {
  ACHIEVEMENTS,
  BADGES,
  TIERS,
  achievementProgress,
  buildBadgeContext,
  earnedBadges,
} from '../utils/achievements';
import { CupRecord } from '../utils/tournament';
import { DailyRecord } from '../utils/daily';
import { shamed } from '../utils/shame';
import { ballColor, playerBall } from '../utils/balls';
import { TitleBadges } from './TitleBadges';
import { Ball, PlayerAvatar } from './ui';

interface PlayerDossierModalProps {
  player: Player | null;
  rank: number;
  allPlayers: Player[];
  /** This season's matches: the ladder, the curve and the rivalries. */
  matches: MatchRecord[];
  league: LeagueInsights;
  onClose: () => void;
  onChallenge: (player: Player) => void;
  /** Every match ever, for badges and achievements that outlive a season. */
  allMatches?: MatchRecord[];
  challenges?: Challenge[];
  /** Ratings carried into the season, where the Elo curve starts. */
  startingElo?: Record<string, number>;
  currentPlayerId?: string;
  onSelectPlayer?: (player: Player) => void;
  onEditProfile?: () => void;
  /** Matches of the day, per player. */
  dailyRecords?: Map<string, DailyRecord>;
  cupRecords?: Map<string, CupRecord>;
  awardRecords?: Map<string, Array<{ week: string; key: string }>>;
}

type Tab = 'overview' | 'stats' | 'rivals' | 'badges';
const TABS: Tab[] = ['overview', 'stats', 'rivals', 'badges'];

/** Counts a number up from zero once, with the app's easing. */
const Count: React.FC<{ value: number; ms?: number }> = ({ value, ms = 700 }) => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now() + 150;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / ms));
      setShown(Math.round(value * ease(k)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return <>{shown}</>;
};

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : /(ch|sh|s|x)$/.test(word) ? `${word}es` : `${word}s`}`;

const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="grid gap-2">
    <div className="flex items-center justify-between px-1">
      <h3 className="text-base">{title}</h3>
      {aside && <span className="text-xs font-semibold text-white/55">{aside}</span>}
    </div>
    {children}
  </section>
);

const Tile: React.FC<{ value: number; label: string; pre?: string; post?: string }> = ({ value, label, pre = '', post = '' }) => (
  <div className="grid content-start gap-1.5 bg-card px-2.5 py-3.5">
    <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
      {pre}
      <Count value={value} />
      {post}
    </span>
    <span className="text-[10px] font-extrabold uppercase leading-tight tracking-[0.1em] text-white/55">{label}</span>
  </div>
);

/** Win and loss bar: felt green for wins, neutral grey for losses. */
const WinLoss: React.FC<{ wins: number; losses: number; small?: boolean }> = ({ wins, losses, small }) => (
  <span className={`flex gap-0.5 overflow-hidden rounded-full bg-surface ${small ? 'h-1.5 max-w-[150px]' : 'h-2.5'}`}>
    <span className="grow-x block min-w-0 basis-0 bg-felt" style={{ flexGrow: wins || 0.001 }} />
    <span className="grow-x block min-w-0 basis-0 bg-loss" style={{ flexGrow: losses || 0.001, transformOrigin: 'right' }} />
  </span>
);

export const PlayerDossierModal: React.FC<PlayerDossierModalProps> = ({
  player,
  rank,
  allPlayers,
  matches,
  league,
  onClose,
  onChallenge,
  allMatches,
  challenges = [],
  startingElo = {},
  currentPlayerId,
  onSelectPlayer,
  onEditProfile,
  dailyRecords,
  cupRecords,
  awardRecords,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => setTab('overview'), [player?.id]);
  useEffect(() => {
    if (!player) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  const everything = allMatches ?? matches;
  const context = useMemo(
    () => (player ? buildBadgeContext(player, everything, challenges, startingElo[player.id] ?? 1000, undefined, dailyRecords?.get(player.id), cupRecords?.get(player.id), awardRecords?.get(player.id)) : null),
    [player, everything, challenges, startingElo, dailyRecords, cupRecords, awardRecords]
  );
  const everyoneBadges = useMemo(
    () => (tab === 'badges' ? allPlayers.map((entry) => earnedBadges(buildBadgeContext(entry, everything, challenges, startingElo[entry.id] ?? 1000, undefined, dailyRecords?.get(entry.id), cupRecords?.get(entry.id), awardRecords?.get(entry.id)))) : []),
    [tab, allPlayers, everything, challenges, startingElo, dailyRecords]
  );

  if (!player || !context) return null;

  const isMe = player.id === currentPlayerId;
  const insight = league.insights.get(player.id);
  const titles = league.titlesByPlayer.get(player.id) ?? [];
  const rival = findTopRival(player.id, allPlayers, matches);
  const byId = new Map(allPlayers.map((entry) => [entry.id, entry]));

  // This season, in order: the curve, the tiles and the rivalries all read from it.
  const season = matches
    .filter((match) => match.playerAId === player.id || match.playerBId === player.id)
    .sort((a, b) => a.timestamp - b.timestamp);
  const wonMatches = season.filter((match) => match.winnerId === player.id);
  const lostMatches = season.filter((match) => match.winnerId !== player.id);
  const eloAfter = (match: MatchRecord) => (match.playerAId === player.id ? match.playerAEloAfter : match.playerBEloAfter);
  const curve = [startingElo[player.id] ?? 1000, ...season.map(eloAfter)];
  const peak = Math.max(...curve);
  const avg = (list: MatchRecord[]) => (list.length ? Math.round(list.reduce((sum, match) => sum + match.eloDelta + match.bountyCollected, 0) / list.length) : 0);
  let run = 0;
  let bestRun = 0;
  season.forEach((match) => {
    run = match.winnerId === player.id ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  });
  const winRate = season.length ? Math.round((wonMatches.length / season.length) * 100) : 0;

  const groupOf = (match: MatchRecord) => (match.winnerBall ? (match.winnerId === player.id ? match.winnerBall : match.winnerBall === 'solids' ? 'stripes' : 'solids') : null);
  const groupStat = (group: 'solids' | 'stripes') => {
    const played = season.filter((match) => groupOf(match) === group);
    const w = played.filter((match) => match.winnerId === player.id).length;
    return { n: played.length, w, l: played.length - w, rate: played.length ? Math.round((w / played.length) * 100) : 0 };
  };
  const solids = groupStat('solids');
  const stripes = groupStat('stripes');
  const withBall = matches.filter((match) => match.winnerBall);
  const stripeShare = withBall.length ? Math.round((withBall.filter((match) => match.winnerBall === 'stripes').length / withBall.length) * 100) : 0;
  const nerve = league.nerve.get(player.id);

  const header = (
    <>
      <div className="flex items-center justify-between gap-2 px-1 pt-[calc(var(--safe-top)+0.9rem)]">
        <button type="button" onClick={onClose} aria-label="Back" className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        {insight?.isDormant ? (
          <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">Dormant</span>
        ) : (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] ${rank === 1 ? 'bg-crown text-bg' : 'bg-surface-alt'}`}>
            {rank === 1 ? '👑 ' : ''}Rank {rank}
          </span>
        )}
      </div>
      <div className="grid justify-items-center gap-2.5 pb-1 pt-2 text-center">
        <PlayerAvatar player={player} size={112} />
        <h1 className="text-[30px] [overflow-wrap:anywhere]">{shamed(player.name, player)}</h1>
        <div className="flex flex-wrap justify-center gap-1.5">
          {player.department && <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">{player.department}</span>}
          <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">Ball {playerBall(player)}</span>
        </div>
        <div className="font-display text-[85px] font-extrabold leading-[.9] tracking-[-0.03em] tabular-nums">
          <Count value={player.elo} ms={500} />
        </div>
        <span className="flex gap-1" role="img" aria-label={`Form ${[...player.recentForm].reverse().join(' ')}`}>
          {[...player.recentForm].slice(0, 5).reverse().map((result, index) => (
            <i key={index} className={`block h-2 w-2 rounded-full ${result === 'W' ? 'bg-felt' : 'bg-loss'}`} />
          ))}
        </span>
      </div>
      {isMe ? (
        onEditProfile && (
          <button type="button" onClick={onEditProfile} className="press flex h-12 items-center justify-center gap-2 rounded-full bg-surface-alt text-[13px] font-extrabold uppercase tracking-[0.06em]">
            <Pencil className="h-[18px] w-[18px]" strokeWidth={2.25} />
            Edit profile and ball
          </button>
        )
      ) : (
        <button type="button" onClick={() => onChallenge(player)} className="press flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
          <Swords className="h-[18px] w-[18px]" strokeWidth={2.25} />
          Call {player.name.split(' ')[0]} out
        </button>
      )}
      <div role="tablist" className="relative grid grid-cols-4 gap-1 rounded-full bg-surface p-1">
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1 top-1 rounded-full bg-white transition-transform duration-300 ease-[var(--ease)]"
          style={{ width: 'calc((100% - 20px) / 4)', transform: `translateX(calc(${TABS.indexOf(tab)} * (100% + 4px)))` }}
        />
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            onClick={() => setTab(entry)}
            className={`relative z-10 h-11 min-w-0 rounded-full px-1 text-[11px] font-extrabold uppercase tracking-[0.05em] transition-colors duration-300 ${tab === entry ? 'text-bg' : 'text-white/55'}`}
          >
            {entry}
          </button>
        ))}
      </div>
    </>
  );

  const overview = (
    <>
      <div className="grid grid-cols-4 gap-0.5 overflow-hidden rounded-2xl bg-card">
        {[
          [player.wins, 'Wins'],
          [player.losses, 'Losses'],
          [player.currentStreak > 0 ? `W${player.currentStreak}` : player.currentStreak < 0 ? `L${-player.currentStreak}` : '0', 'Streak'],
          [player.peakElo, 'Peak'],
        ].map(([value, label]) => (
          <div key={label} className="grid justify-items-center gap-1.5 bg-card px-2 py-3.5">
            <span className="text-xl font-black leading-none tabular-nums">{value}</span>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
          </div>
        ))}
      </div>

      {titles.length > 0 && (
        <Section title="Titles held">
          <TitleBadges titles={titles} variant="card" />
        </Section>
      )}

      <Section title="Biggest rivalry" aside={`Race to ${RIVALRY_RACE_TARGET}`}>
        {rival ? (
          <button type="button" onClick={() => byId.get(rival.opponentId) && onSelectPlayer?.(byId.get(rival.opponentId)!)} className="press grid gap-3 rounded-2xl bg-card p-3.5 text-left">
            <div className="flex items-center gap-3">
              <PlayerAvatar player={byId.get(rival.opponentId) ?? { id: rival.opponentId, name: rival.opponentName, avatarUrl: '' }} size={34} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">vs {rival.opponentName}</span>
              <span className="text-[28px] font-black tabular-nums">{rival.wins}<span className="px-1.5 text-white/40"> </span>{rival.losses}</span>
            </div>
            <WinLoss wins={rival.wins} losses={rival.losses} />
            {rival.commentary.map((line) => (
              <p key={line} className="text-[13px] text-white/70">{line}</p>
            ))}
          </button>
        ) : (
          <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-white/70">No matches logged yet. No rivalry to speak of.</p>
        )}
      </Section>

      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl bg-card">
        <Tile value={insight?.winsVsHigherRated ?? 0} label="Upset wins" />
        <Tile value={insight?.bountyCollected ?? 0} label="Bounty claimed" />
        <Tile value={insight?.bestRankDefence ?? 0} label="Rank defended" />
      </div>

    </>
  );

  const chart = () => {
    if (curve.length < 2) {
      return (
        <div className="grid justify-items-center gap-2 rounded-2xl bg-surface px-4 py-6 text-center">
          <Ball n={playerBall(player)} size={56} />
          <h3 className="text-base">No curve yet</h3>
          <p className="text-sm text-white/70">Play a match this season and the line starts here.</p>
        </div>
      );
    }
    const W = 340, H = 150, L = 4, R = 44, T = 14, B = 14;
    const lo = Math.min(...curve) - 12, hi = Math.max(...curve) + 12;
    const x = (i: number) => L + (i * (W - L - R)) / (curve.length - 1);
    const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const line = curve.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const last = curve.length - 1;
    const peakAt = curve.lastIndexOf(peak);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Elo from ${curve[0]} to ${curve[last]}, peak ${peak}`} className="block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={`g-${player.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".2" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={L} x2={W - R} y1={y(curve[0])} y2={y(curve[0])} stroke="rgba(255,255,255,.26)" strokeDasharray="3 4" />
        <text x={W - R + 6} y={y(curve[0]) + 4} fill="rgba(255,255,255,.52)" fontSize="10" fontWeight="700">{curve[0]}</text>
        <text x={W - R + 6} y={y(peak) + 4} fill="rgba(255,255,255,.52)" fontSize="10" fontWeight="700">{peak}</text>
        <path d={`${line} L${x(last).toFixed(1)} ${H - B} L${x(0)} ${H - B} Z`} fill={`url(#g-${player.id})`} className="anim-fade" style={{ animationDelay: '800ms' }} />
        <path d={line} pathLength={1} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="draw-line" />
        <circle cx={x(peakAt)} cy={y(peak)} r="4" fill="#0A0A0A" stroke="#fff" strokeWidth="2" />
        <circle cx={x(last)} cy={y(curve[last])} r="5.5" fill={ballColor(playerBall(player)).c} stroke="#fff" strokeWidth="2" />
      </svg>
    );
  };

  const stats = (
    <>
      <div className="grid gap-2.5 rounded-2xl bg-card p-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-base">Elo this season</h3>
          <span className="text-xs font-semibold text-white/55">{plural(season.length, 'match')}</span>
        </div>
        {chart()}
        <div className="grid grid-cols-3 gap-0.5">
          {[['Start', curve[0]], ['Peak', peak], ['Now', player.elo]].map(([label, value]) => (
            <span key={label} className="grid gap-1.5 rounded-[10px] bg-surface p-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
              <b className="text-lg font-black leading-none tabular-nums">{value}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl bg-card">
        <Tile value={winRate} label="Win rate" post="%" />
        <Tile value={season.length} label="Matches" />
        <Tile value={bestRun} label="Best streak" />
        <Tile value={wonMatches.filter((match) => match.isUpset).length} label="Upset wins" />
        <Tile value={wonMatches.reduce((sum, match) => sum + match.bountyCollected, 0)} label="Bounty claimed" />
        <Tile value={context.my.filter((x) => x.won && x.defended && season.includes(x.m)).length} label="Crown defences" />
        <Tile value={avg(wonMatches)} label="Avg win" pre={avg(wonMatches) ? '+' : ''} />
        <Tile value={avg(lostMatches)} label="Avg loss" pre={avg(lostMatches) ? '−' : ''} />
        <Tile value={peak} label="Peak" />
      </div>

      {(solids.n > 0 || stripes.n > 0) && (
        <div className="grid gap-3 rounded-2xl bg-card p-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base">Solids vs stripes</h3>
            <span className="text-xs font-semibold text-white/55">Win rate</span>
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            {([['Solids', 1, solids], ['Stripes', 9, stripes]] as const).map(([label, n, stat]) => (
              <div key={label} className="grid justify-items-center gap-1.5 rounded-[10px] bg-surface px-2 py-3.5">
                <Ball n={n} size={44} />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
                <span className="font-display text-[32px] font-extrabold leading-none tabular-nums"><Count value={stat.rate} />%</span>
                <span className="text-xs font-semibold text-white/55">{stat.w}W {stat.l}L</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-white/70">
            {solids.rate === stripes.rate ? 'No preference. Plays both the same.' : `Better on ${solids.rate > stripes.rate ? 'solids' : 'stripes'}.`} Office wide, stripes win {stripeShare}% of matches.
          </p>
        </div>
      )}

      <div className="grid gap-2 rounded-2xl bg-card p-3.5">
        <div className="flex justify-between text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55"><span>Wins</span><span>Losses</span></div>
        <WinLoss wins={wonMatches.length} losses={lostMatches.length} />
        <div className="flex justify-between text-sm font-black tabular-nums"><span>{wonMatches.length}</span><span>{lostMatches.length}</span></div>
      </div>

      <Section title="Betting" aside="Chips on other matches">
        {nerve && nerve.total > 0 ? (
          <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl bg-card">
            <Tile value={context.chips.chips} label="Chips won" />
            <Tile value={context.chips.bets} label="Bets" />
            <Tile value={Math.round((nerve.correct / nerve.total) * 100)} label="Hit rate" post="%" />
            <Tile value={context.chips.biggest} label="Biggest win" />
            <Tile value={context.chips.jackpots} label="Jackpots" />
            <Tile value={context.chips.lost} label="Chips lost" />
          </div>
        ) : (
          <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-white/70">No bets yet. Put some chips on a match in the arena and the numbers start here.</p>
        )}
      </Section>
    </>
  );

  const rivalRows = Object.entries(
    season.reduce<Record<string, { w: number; l: number }>>((acc, match) => {
      const opp = match.playerAId === player.id ? match.playerBId : match.playerAId;
      acc[opp] ??= { w: 0, l: 0 };
      acc[opp][match.winnerId === player.id ? 'w' : 'l']++;
      return acc;
    }, {})
  )
    .map(([id, record]) => ({ id, opponent: byId.get(id), ...record, n: record.w + record.l }))
    .sort((a, b) => b.n - a.n || b.w - a.w);
  const victim = rivalRows.filter((row) => row.w >= 2 && row.w > row.l).sort((a, b) => b.w - a.w || a.l - b.l)[0];
  const nemesis = rivalRows.filter((row) => row.l >= 2 && row.l > row.w).sort((a, b) => b.l - a.l || a.w - b.w)[0];
  const opponentName = (row: { id: string; opponent?: Player }) =>
    row.opponent?.name ?? season.find((match) => match.playerAId === row.id)?.playerAName ?? season.find((match) => match.playerBId === row.id)?.playerBName ?? '';

  const rivals =
    rivalRows.length === 0 ? (
      <div className="grid justify-items-center gap-2 rounded-2xl bg-card px-4 py-7 text-center">
        <Ball n={playerBall(player)} size={64} />
        <h3 className="text-lg">No rivals yet</h3>
        <p className="text-sm text-white/70">Nobody has faced {isMe ? 'you' : player.name.split(' ')[0]} this season.</p>
      </div>
    ) : (
      <>
        {(victim || nemesis) && (
          <div className="grid grid-cols-2 gap-2">
            {[
              [victim, 'Favourite victim', victim ? `${plural(victim.w, 'win')} against` : ''],
              [nemesis, 'Nemesis', nemesis ? `${plural(nemesis.l, 'loss')} to` : ''],
            ].map(([row, label, text]) =>
              row && typeof row === 'object' ? (
                <button key={label as string} type="button" onClick={() => row.opponent && onSelectPlayer?.(row.opponent)} className="press grid justify-items-start gap-1.5 rounded-2xl bg-card p-3.5 text-left">
                  <PlayerAvatar player={row.opponent ?? { id: row.id, name: opponentName(row), avatarUrl: '' }} size={34} />
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label as string}</span>
                  <b className="font-display text-lg font-extrabold uppercase leading-none [overflow-wrap:anywhere]">{opponentName(row).split(' ')[0]}</b>
                  <span className="text-xs font-semibold text-white/55">{text as string}</span>
                </button>
              ) : (
                <span key={label as string} />
              )
            )}
          </div>
        )}
        <div className="stagger-rows grid gap-0.5">
          {rivalRows.map((row, index) => (
            <button
              key={row.id}
              type="button"
              onClick={() => row.opponent && onSelectPlayer?.(row.opponent)}
              style={{ ['--j' as string]: Math.min(index, 12) }}
              className="press grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left hover:bg-[#161616]"
            >
              <PlayerAvatar player={row.opponent ?? { id: row.id, name: opponentName(row), avatarUrl: '' }} size={34} />
              <span className="grid min-w-0 gap-1.5">
                <span className="truncate text-sm font-bold">{opponentName(row)}</span>
                <WinLoss wins={row.w} losses={row.l} small />
              </span>
              <span className="grid justify-items-end gap-1">
                <b className="text-[15px] font-black tabular-nums">{row.w}W {row.l}L</b>
                <span className="text-xs font-semibold text-white/55">{Math.round((row.w / row.n) * 100)}%</span>
              </span>
            </button>
          ))}
        </div>
      </>
    );

  const got = earnedBadges(context);
  const progress = achievementProgress(context);
  const ratio = (entry: (typeof progress)[number]) => (entry.t < 5 ? entry.v / entry.a.at[entry.t] : 1);
  const ordered = [...progress].sort((a, b) => b.t - a.t || ratio(b) - ratio(a));
  const levels = progress.reduce((sum, entry) => sum + entry.t, 0);
  const badgeList = [...BADGES].sort((a, b) => Number(got.has(b.id)) - Number(got.has(a.id)) || Number(!!a.secret) - Number(!!b.secret));
  const owners = (id: string) => everyoneBadges.filter((set) => set.has(id)).length;

  const badges = (
    <>
      <div className="grid gap-2.5 rounded-2xl bg-card p-3.5">
        <div className="grid grid-cols-2 gap-0.5">
          {[[levels, `of ${ACHIEVEMENTS.length * TIERS.length} tiers`], [got.size, `of ${BADGES.length} badges`]].map(([value, label]) => (
            <span key={label as string} className="grid gap-1.5 rounded-[10px] bg-surface p-3">
              <b className="font-display text-[30px] font-extrabold leading-none tabular-nums"><Count value={value as number} /></b>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-bold text-white/70">
          {TIERS.map((tier) => (
            <span key={tier.k} className="inline-flex items-center gap-1.5">
              <i className="block h-2.5 w-2.5 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.35)]" style={{ background: tier.c }} />
              {tier.label}
            </span>
          ))}
        </div>
      </div>

      <Section title="Achievements" aside="Five tiers each">
        <div className="stagger-rows grid gap-2">
          {ordered.map(({ a, v, t }, index) => {
            const current = t ? TIERS[t - 1] : null;
            const next = t < 5 ? TIERS[t] : null;
            const from = t ? a.at[t - 1] : a.id === 'peak' ? 1000 : 0;
            const to = next ? a.at[t] : a.at[4];
            const fill = next ? Math.max(0, Math.min(100, Math.round(((v - from) / (to - from)) * 100))) : 100;
            return (
              <div key={a.id} style={{ ['--j' as string]: Math.min(index, 14) }} className="grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-2xl bg-card p-3.5">
                <span
                  aria-hidden="true"
                  className={`grid h-14 w-14 place-items-center rounded-full text-[28px] leading-none ${current ? '' : 'grayscale brightness-[.6]'}`}
                  style={{
                    background: current?.c ?? '#222222',
                    boxShadow: current?.k === 'eight' ? '0 0 0 2px #fff, inset 0 0 0 3px rgba(255,255,255,.12)' : 'inset 0 0 0 3px rgba(255,255,255,.18)',
                  }}
                >
                  {a.e}
                </span>
                <div className="grid min-w-0 gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <b className="font-display text-base font-extrabold uppercase leading-[1.05] [overflow-wrap:anywhere]">{t ? a.names[t - 1] : a.name}</b>
                    {current ? (
                      <span className="flex-none rounded-md px-1.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em]" style={{ background: current.c, color: current.f, boxShadow: current.k === 'eight' ? 'inset 0 0 0 1.5px #fff' : undefined }}>
                        {current.label}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-white/55">Locked</span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-white/55">
                    {t ? `${a.name}. ` : ''}
                    {next ? `Next: ${next.label} ${a.names[t]} at ${a.at[t]} ${a.unit}` : 'Maxed out. Legend.'}
                  </span>
                  <span className="h-[7px] overflow-hidden rounded-full bg-surface-alt">
                    <span className="grow-x block h-full rounded-full" style={{ width: `${fill}%`, background: next && next.k !== 'eight' ? next.c : '#FFFFFF' }} />
                  </span>
                  <div className="flex items-center justify-between text-xs font-extrabold tabular-nums">
                    <span>{v}{next ? ` / ${to}` : ''}</span>
                    <span className="flex gap-1">
                      {TIERS.map((tier, i) => (
                        <i key={tier.k} className="block h-[9px] w-[9px] rounded-full" style={{ background: i < t ? tier.c : '#222222', boxShadow: i < t && tier.k === 'eight' ? 'inset 0 0 0 1.5px #fff' : undefined }} />
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Badges" aside={`${BADGES.filter((b) => b.secret).length} secret`}>
        <span className="h-2 overflow-hidden rounded-full bg-surface-alt">
          <span className="grow-x block h-full rounded-full bg-white" style={{ width: `${Math.round((got.size / BADGES.length) * 100)}%` }} />
        </span>
        <div className="stagger-rows grid grid-cols-2 gap-2">
          {badgeList.map((badge, index) => {
            const has = got.has(badge.id);
            const hidden = badge.secret && !has;
            const n = owners(badge.id);
            const rarity = n === 0 ? 'Nobody yet' : n === 1 && has ? `Only ${isMe ? 'you' : player.name.split(' ')[0]}` : plural(n, 'player');
            return (
              <div
                key={badge.id}
                style={{ ['--j' as string]: Math.min(index, 14) }}
                className={`grid content-start gap-1 rounded-2xl px-3 py-3.5 ${has ? 'bg-surface-alt' : 'bg-card'} ${badge.secret && has ? 'shadow-[inset_0_0_0_1.5px_#F2B705]' : ''}`}
              >
                <span aria-hidden="true" className={`mb-1.5 text-[44px] leading-none ${has ? '' : 'grayscale brightness-[.45]'}`}>{hidden ? '❔' : badge.e}</span>
                <b className={`font-display text-sm font-extrabold uppercase leading-[1.1] [overflow-wrap:anywhere] ${has ? '' : 'text-white/55'}`}>{hidden ? '???' : badge.name}</b>
                <span className={`text-xs leading-snug ${has ? 'text-white/70' : 'text-white/55'}`}>{hidden ? 'Secret. Keep playing.' : badge.desc}</span>
                <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/55">{rarity}</span>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );

  return (
    <div id="player-dossier-modal" role="dialog" aria-modal="true" aria-label={player.name} className="anim-fade fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto grid w-full max-w-md gap-3 px-3 pb-[calc(var(--safe-bottom)+1.5rem)]">
        {header}
        <div key={tab} className="stagger grid gap-3">
          {tab === 'overview' ? overview : tab === 'stats' ? stats : tab === 'rivals' ? rivals : badges}
        </div>
      </div>
    </div>
  );
};
