import React, { useEffect, useMemo, useState } from 'react';
import { HelpCircle, History } from 'lucide-react';
import { MatchRecord, Player } from '../types';
import { CUP_MIN_PLAYERS, CupRecord, CupState, Tournament, allGames, resolveCup, weekTournament } from '../utils/tournament';
import { addSeen, cupIn, cupNames, cupPhase, dayMonth, hm, myRoad, readSeen, usePrefersReducedMotion, weekday } from '../utils/cupView';
import { CupBracket, CupRounds } from './cup/CupBracket';
import { CupChampionHero } from './cup/CupChampionHero';
import { CupCabinet, CupHowItWorks, CupPastCups } from './cup/CupLower';
import { CupMyMatch } from './cup/CupMyMatch';
import { CupSeats } from './cup/CupSeats';
import { CupCountdown, CupReigning, CupStage, CupStakeBanner } from './cup/CupStage';
import { PlayerAvatar, Sheet } from './ui';

/** The stage headline per round: short enough to sit on one line at poster size. */
const HEADLINE: Record<string, string> = { 'Play-in': 'Play-in', 'Round of 16': 'Last 16', 'Quarter-final': 'Quarters', 'Semi-final': 'Semis', Final: 'The final' };

/**
 * Everything about the weekly cup in one tab, laid out like a championship
 * poster: the stage with this week's headline, then sign-ups or the knockout
 * (your game, then the bracket from the play-in down to the final), then how
 * it works, the trophy cabinet and every past cup. The top of the page enters
 * on one timeline, and tapping the crest runs it again.
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
  onClaimWalkover?: (gameKey: string) => Promise<void>;
  onSelectPlayer: (player: Player) => void;
}> = ({ tournaments, current, currentState, records, matches, players, currentPlayer, now, onJoin, onPlay, onClaimWalkover, onSelectPlayer }) => {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const motion = !usePrefersReducedMotion();
  const [replayKey, setReplayKey] = useState(0);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [panel, setPanel] = useState<'rules' | 'history' | null>(null);
  const [historyTab, setHistoryTab] = useState<'cabinet' | 'past'>('cabinet');
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
  const road = currentState ? myRoad(currentState, currentPlayer.id) : null;
  const tone = phase === 'off' || phase === 'unfinished' ? 'silver' : 'gold';
  // The round being played: its earliest open game sets the countdown.
  const open = currentState ? allGames(currentState).filter((game) => !game.winnerId && game.label === currentState.current) : [];
  const roundClose = open.length ? Math.min(...open.map((game) => game.deadline)) : 0;
  const n = current?.field?.length ?? 0;

  const title =
    phase === 'weekend' ? 'Next cup'
    : phase === 'before' || phase === 'open' ? 'Sign up'
    : phase === 'drawing' ? 'The draw'
    : phase === 'off' ? 'No cup'
    : phase === 'champion' ? 'Champion'
    : phase === 'unfinished' ? 'No winner'
    : HEADLINE[currentState!.current] ?? currentState!.current;

  const subline =
    phase === 'weekend' ? `Opens ${weekday(nextOpen)} ${hm(nextOpen)}`
    : phase === 'drawing' ? 'Seeding the field by Elo'
    : phase === 'off' ? `Only ${current!.entrants.length} signed up. It takes ${CUP_MIN_PLAYERS}.`
    : phase === 'unfinished' ? `The final was not played by ${weekday(current!.deadline)} ${hm(current!.deadline)}`
    : phase === 'live' ? `Week of ${dayMonth(current!.opensAt)}. ${n} players`
    : `Week of ${dayMonth(current!.opensAt)}`;

  const countdown =
    phase === 'weekend' ? { to: nextOpen, caption: 'Everyone who signs up plays' }
    : phase === 'before' ? { to: current!.opensAt, caption: `Sign ups open at ${hm(current!.opensAt)}` }
    : phase === 'open' ? { to: current!.closesAt, caption: `Sign ups close at ${hm(current!.closesAt)}` }
    : phase === 'off' ? { to: nextOpen, caption: `Next cup opens ${weekday(nextOpen)} ${hm(nextOpen)}` }
    : phase === 'live' && roundClose ? { to: roundClose, caption: `${currentState!.current === 'Final' ? 'The final' : `The ${currentState!.current.toLowerCase()}`} closes ${weekday(roundClose)} ${hm(roundClose)}` }
    : null;
  const stake = phase !== 'off' && phase !== 'unfinished' && phase !== 'champion';

  const championId = currentState?.champion ?? null;
  const openCup = openWeek ? past.find((entry) => entry.cup.week === openWeek) : null;
  const saw = (keys: string[]) => week && addSeen(week, keys);
  const showBracket = current && currentState && (phase === 'live' || phase === 'champion' || phase === 'unfinished');

  return (
    <div className="-mx-3 grid gap-4 overflow-x-clip px-4 pb-28">
      <React.Fragment key={replayKey}>
        <CupStage
          title={title}
          subline={subline}
          tone={tone}
          strong={phase === 'champion'}
          drawing={phase === 'drawing'}
          onReplay={() => setReplayKey((key) => key + 1)}
          corner={
            <>
              {(cabinet.length > 0 || past.length > 0) && (
                <button type="button" onClick={() => setPanel('history')} aria-label="Cup history" className="press grid h-10 w-10 place-items-center rounded-full bg-surface-alt">
                  <History className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </button>
              )}
              <button type="button" onClick={() => setPanel('rules')} aria-label="How the cup works" className="press grid h-10 w-10 place-items-center rounded-full bg-surface-alt">
                <HelpCircle className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </button>
            </>
          }
        >
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
            No coins this week. Next cup opens {weekday(nextOpen)} {hm(nextOpen)}.
          </div>
        )}

        {phase === 'live' && currentState && road && (
          <CupMyMatch state={currentState} steps={road} me={currentPlayer} byId={byId} names={names} delay={640} onPlay={onPlay} onClaimWalkover={onClaimWalkover} />
        )}

        {showBracket && (
          <section className="cup-in relative isolate -mx-4 grid gap-3 px-4 pb-2 pt-1" style={cupIn('rise-in', 760, 360)}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[-1]"
              style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.06) 1px, rgba(0,0,0,0) 1.3px)', backgroundSize: '10px 10px' }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -bottom-6 top-1/2 z-[-1]"
              style={{ background: 'radial-gradient(ellipse 90% 45% at 50% 100%, rgba(11,122,62,.20), rgba(11,122,62,0) 70%)' }}
            />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl">The bracket</h2>
              <span className="text-[13px] font-extrabold tabular-nums">{n} players</span>
            </div>
            <CupRounds state={currentState!} delay={820} motion={motion} />
            <CupBracket
              state={currentState!}
              byId={byId}
              names={names}
              meId={currentPlayer.id}
              seen={seen}
              force={replayKey > 0}
              motion={motion}
              base={900}
              silver={phase === 'unfinished'}
              onSelectPlayer={onSelectPlayer}
              onSeen={saw}
            />
          </section>
        )}
      </React.Fragment>

      {panel === 'rules' && (
        <Sheet title="How it works" onClose={() => setPanel(null)}>
          <div className="pb-2">
            <CupHowItWorks now={now} delay={0} />
          </div>
        </Sheet>
      )}

      {panel === 'history' && (
        <Sheet title="Cup history" onClose={() => setPanel(null)}>
          <div className="grid gap-3 pb-2">
            {cabinet.length > 0 && past.length > 0 && (
              <div role="tablist" aria-label="Cup history" className="grid grid-cols-2 rounded-full bg-surface p-[3px]">
                {(['cabinet', 'past'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={historyTab === value}
                    onClick={() => setHistoryTab(value)}
                    className={`press h-9 rounded-full text-xs font-extrabold uppercase tracking-[0.08em] transition-colors ${historyTab === value ? 'bg-white text-bg' : 'text-white'}`}
                  >
                    {value === 'cabinet' ? 'Trophy cabinet' : 'Past cups'}
                  </button>
                ))}
              </div>
            )}
            {cabinet.length > 0 && (historyTab === 'cabinet' || past.length === 0) && (
              <CupCabinet cabinet={cabinet} byId={byId} delay={0} onSelectPlayer={(player) => { setPanel(null); onSelectPlayer(player); }} />
            )}
            {past.length > 0 && (historyTab === 'past' || cabinet.length === 0) && <CupPastCups past={past} byId={byId} delay={0} onOpen={setOpenWeek} />}
          </div>
        </Sheet>
      )}

      {openCup && (
        <Sheet z={60} title={`Week of ${dayMonth(openCup.cup.opensAt)}`} onClose={() => setOpenWeek(null)}>
          <CupBracket
            state={openCup.state}
            byId={byId}
            names={cupNames(openCup.cup.field ?? [], byId)}
            meId={currentPlayer.id}
            seen={new Set()}
            force={false}
            motion={false}
            base={0}
            silver={!openCup.state.champion}
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
