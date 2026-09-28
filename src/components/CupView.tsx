import React, { useEffect, useMemo, useState } from 'react';
import { MatchRecord, Player } from '../types';
import { CUP_MIN_PLAYERS, CupRecord, CupState, FINAL_ROUND, Tournament, resolveCup, roundDeadline, roundName, weekTournament } from '../utils/tournament';
import { addSeen, cupIn, cupNames, cupPhase, dayMonth, hm, myRoad, readSeen, usePrefersReducedMotion, weekday } from '../utils/cupView';
import { CupChampionHero } from './cup/CupChampionHero';
import { CupFinalCard } from './cup/CupFinalCard';
import { CupFixtures } from './cup/CupFixtures';
import { CupCabinet, CupHowItWorks, CupPastCups } from './cup/CupLower';
import { CupMyMatch } from './cup/CupMyMatch';
import { CupSeats } from './cup/CupSeats';
import { CupCountdown, CupReigning, CupStage, CupStakeBanner } from './cup/CupStage';
import { CupStandings } from './cup/CupStandings';
import { PlayerAvatar, Sheet } from './ui';

/** A section's slot in the page timeline. Everything renders straight away, no scrolling needed. */
const Reveal: React.FC<{ at: number; motion: boolean; children: (base: number, hold: boolean) => React.ReactNode }> = ({ at, children }) => (
  <div className="min-w-0">{children(at, false)}</div>
);

/**
 * Everything about the weekly cup in one tab, laid out like a championship
 * poster: the stage with this week's headline, then sign-ups or the rounds
 * (your game, fixtures, standings, the final), then how it works, the trophy
 * cabinet and every past cup. The top of the page enters on one timeline, and
 * tapping the crest runs it again.
 */
export const CupView: React.FC<{
  tournaments: Tournament[];
  current: Tournament | null;
  currentState: CupState | null;
  records: Map<string, CupRecord>;
  matches: MatchRecord[];
  players: Player[];
  currentPlayer: Player;
  now: number;
  onJoin: () => void;
  onPlay: (opponentId: string) => void;
  onSelectPlayer: (player: Player) => void;
}> = ({ tournaments, current, currentState, records, matches, players, currentPlayer, now, onJoin, onPlay, onSelectPlayer }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const motion = !usePrefersReducedMotion();
  const [replayKey, setReplayKey] = useState(0);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const phase = cupPhase(current, currentState, now);
  const week = current?.week ?? '';
  // What this viewer had already watched when the tab opened (or the intro was replayed).
  const seen = useMemo(() => readSeen(week), [week, replayKey]);
  const celebrate = phase === 'champion' && (replayKey > 0 || !seen.has('champion'));

  useEffect(() => {
    if (!celebrate || !week) return;
    const timer = window.setTimeout(() => !document.hidden && addSeen(week, ['champion']), 3300);
    return () => window.clearTimeout(timer);
  }, [celebrate, week]);

  const past = tournaments
    .filter((cup) => cup.week !== current?.week)
    .sort((a, b) => b.week.localeCompare(a.week))
    .map((cup) => ({ cup, state: resolveCup(cup, matches, now) }))
    .filter((entry): entry is { cup: Tournament; state: CupState } => entry.state !== null);
  const cabinet = [...records]
    .filter(([id, record]) => byId.has(id) && (record.titles > 0 || record.finals > 0))
    .sort((a, b) => b[1].titles - a[1].titles || b[1].finals - a[1].finals || b[1].matchWins - a[1].matchWins);
  const reigning = past.find((entry) => entry.state.champion && byId.has(entry.state.champion));
  const thisWeek = weekTournament(now);
  const nextOpen = now < thisWeek.opensAt ? thisWeek.opensAt : weekTournament(now + 7 * 86_400_000).opensAt;

  const names = useMemo(() => cupNames(current?.field ?? [], byId), [current, byId]);
  const road = currentState ? myRoad(currentState, currentPlayer.id, now) : null;
  const tone = phase === 'off' || phase === 'unfinished' ? 'silver' : 'gold';
  const round = currentState ? Math.min(currentState.current, FINAL_ROUND) : 0;
  const roundClose = current && currentState ? (round === FINAL_ROUND && currentState.final ? currentState.final.deadline : roundDeadline(current, round)) : 0;

  const title =
    phase === 'weekend' ? 'Next cup'
    : phase === 'before' || phase === 'open' ? 'Sign up'
    : phase === 'drawing' ? 'The draw'
    : phase === 'off' ? 'No cup'
    : phase === 'champion' ? 'Champion'
    : phase === 'unfinished' ? 'No winner'
    : round === FINAL_ROUND ? 'The final'
    : roundName(round);

  const subline =
    phase === 'weekend' ? `Opens ${weekday(nextOpen)} ${hm(nextOpen)}`
    : phase === 'drawing' ? 'Drawing round 1'
    : phase === 'off' ? `Only ${current!.entrants.length} signed up. It takes ${CUP_MIN_PLAYERS}.`
    : phase === 'unfinished' ? `The final was not played by ${weekday(current!.deadline)} ${hm(current!.deadline)}`
    : phase === 'live' ? `Week of ${dayMonth(current!.opensAt)}. ${current!.field!.length} players`
    : `Week of ${dayMonth(current!.opensAt)}`;

  const countdown =
    phase === 'weekend' ? { to: nextOpen, caption: 'Everyone who signs up plays' }
    : phase === 'before' ? { to: current!.opensAt, caption: `Sign ups open at ${hm(current!.opensAt)}` }
    : phase === 'open' ? { to: current!.closesAt, caption: `Sign ups close at ${hm(current!.closesAt)}` }
    : phase === 'off' ? { to: nextOpen, caption: `Next cup opens ${weekday(nextOpen)} ${hm(nextOpen)}` }
    : phase === 'live' ? { to: roundClose, caption: `${roundName(round)} closes ${weekday(roundClose)} ${hm(roundClose)}` }
    : null;
  const stake = phase !== 'off' && phase !== 'unfinished' && phase !== 'champion';

  const championId = currentState?.champion ?? null;
  const openCup = openWeek ? past.find((entry) => entry.cup.week === openWeek) : null;
  const saw = (keys: string[]) => week && addSeen(week, keys);

  // The rounds: fixtures, the table and the final, with whatever matters most right now first.
  const rounds = current && currentState && (phase === 'live' || phase === 'champion' || phase === 'unfinished') ? (
    (() => {
      const fixtures = (at: number) => (
        <Reveal key="fixtures" at={at} motion={motion}>
          {(base, hold) => (
            <CupFixtures
              state={currentState}
              byId={byId}
              names={names}
              meId={currentPlayer.id}
              now={now}
              seen={seen}
              force={replayKey > 0}
              flip={replayKey === 0 && !seen.has('drawn')}
              motion={motion}
              base={base}
              hold={hold}
              onSelectPlayer={onSelectPlayer}
              onSeen={saw}
            />
          )}
        </Reveal>
      );
      const standings = (at: number) => (
        <Reveal key="standings" at={at} motion={motion}>
          {(base) => <CupStandings state={currentState} byId={byId} names={names} meId={currentPlayer.id} base={base} motion={motion} onSelectPlayer={onSelectPlayer} />}
        </Reveal>
      );
      const final = (at: number) => (
        <Reveal key="final" at={at} motion={motion}>
          {(base, hold) => (
            <CupFinalCard
              state={currentState}
              tournament={current}
              byId={byId}
              names={names}
              meId={currentPlayer.id}
              now={now}
              seen={seen}
              force={replayKey > 0}
              motion={motion}
              base={base + (celebrate ? 600 : 0)}
              hold={hold}
              onSelectPlayer={onSelectPlayer}
              onSeen={saw}
            />
          )}
        </Reveal>
      );
      return currentState.current >= FINAL_ROUND ? [final(820), standings(1000), fixtures(1180)] : [fixtures(820), standings(1000), final(1180)];
    })()
  ) : null;

  return (
    <div className="-mx-3 grid gap-4 overflow-x-clip px-4 pb-28">
      <React.Fragment key={replayKey}>
        <CupStage title={title} subline={subline} tone={tone} strong={phase === 'champion'} drawing={phase === 'drawing'} onReplay={() => setReplayKey((key) => key + 1)}>
          {countdown && <CupCountdown to={countdown.to} caption={countdown.caption} delay={460} />}
          {stake && <CupStakeBanner delay={560} />}
        </CupStage>

        {(phase === 'before' || phase === 'open' || phase === 'drawing') && current && (
          <CupSeats tournament={current} players={players} currentPlayer={currentPlayer} mode={phase} delay={640} onJoin={onJoin} />
        )}

        {(phase === 'weekend' || phase === 'before') && reigning && (
          <CupReigning
            player={byId.get(reigning.state.champion!)!}
            titles={records.get(reigning.state.champion!)?.titles ?? 1}
            delay={phase === 'weekend' ? 640 : 740}
            onSelect={() => onSelectPlayer(byId.get(reigning.state.champion!)!)}
          />
        )}

        {phase === 'off' && current && (
          <div className="cup-in grid gap-3 rounded-3xl bg-card p-4" style={cupIn('rise-in', 640, 360)}>
            <h2 className="text-xl">Signed up</h2>
            <div className="flex flex-wrap gap-2">
              {current.entrants.map((entry) => (
                <PlayerAvatar key={entry.id} player={byId.get(entry.id) ?? { id: entry.id, name: '?', avatarUrl: '' }} size={36} />
              ))}
            </div>
          </div>
        )}

        {phase === 'champion' && currentState && championId && (
          <CupChampionHero
            champion={byId.get(championId) ?? null}
            championId={championId}
            name={names.get(championId) ?? 'Former player'}
            runnerUp={currentState.runnerUp ? byId.get(currentState.runnerUp) ?? null : null}
            runnerUpName={currentState.runnerUp ? names.get(currentState.runnerUp) ?? '' : ''}
            titles={records.get(championId)?.titles ?? 1}
            isMe={championId === currentPlayer.id}
            celebrate={celebrate}
            motion={motion}
            delay={640}
            onSelect={() => byId.has(championId) && onSelectPlayer(byId.get(championId)!)}
          />
        )}

        {phase === 'unfinished' && (
          <div className="cup-in rounded-3xl bg-card p-4 text-sm font-semibold text-white/70" style={cupIn('rise-in', 640, 360)}>
            No chips this week. Next cup opens {weekday(nextOpen)} {hm(nextOpen)}.
          </div>
        )}

        {phase === 'live' && currentState && road && (
          <CupMyMatch state={currentState} steps={road} me={currentPlayer} byId={byId} names={names} delay={640} onPlay={onPlay} />
        )}

        {rounds && (
          <div className="relative isolate grid gap-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-4 -bottom-6 top-1/3 z-[-1]"
              style={{ background: 'radial-gradient(ellipse 90% 45% at 50% 100%, rgba(11,122,62,.20), rgba(11,122,62,0) 70%)' }}
            />
            {rounds}
          </div>
        )}
      </React.Fragment>

      <Reveal at={1000} motion={motion}>{(base) => <CupHowItWorks now={now} delay={base} />}</Reveal>
      {cabinet.length > 0 && (
        <Reveal at={1080} motion={motion}>{(base) => <CupCabinet cabinet={cabinet} byId={byId} delay={base} onSelectPlayer={onSelectPlayer} />}</Reveal>
      )}
      {past.length > 0 && (
        <Reveal at={1160} motion={motion}>{(base) => <CupPastCups past={past} byId={byId} delay={base} onOpen={setOpenWeek} />}</Reveal>
      )}

      {openCup && (
        <Sheet title={`Week of ${dayMonth(openCup.cup.opensAt)}`} onClose={() => setOpenWeek(null)}>
          <CupFinalCard
            state={openCup.state}
            tournament={openCup.cup}
            byId={byId}
            names={cupNames(openCup.cup.field ?? [], byId)}
            meId={currentPlayer.id}
            now={now}
            seen={new Set()}
            force={false}
            motion={false}
            base={0}
            hold={false}
            onSelectPlayer={(player) => {
              setOpenWeek(null);
              onSelectPlayer(player);
            }}
          />
          <CupStandings
            state={openCup.state}
            byId={byId}
            names={cupNames(openCup.cup.field ?? [], byId)}
            meId={currentPlayer.id}
            base={120}
            motion={motion}
            onSelectPlayer={(player) => {
              setOpenWeek(null);
              onSelectPlayer(player);
            }}
          />
        </Sheet>
      )}
    </div>
  );
};
