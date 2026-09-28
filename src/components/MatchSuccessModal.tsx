import React from 'react';
import { ArrowDownRight, ArrowUpRight, Crown, Flame, Minus, Swords, Trophy } from 'lucide-react';
import { MatchRecord } from '../types';
import { MatchRecap, RankMove } from '../utils/recap';

interface MatchSuccessModalProps {
  result: {
    match: MatchRecord;
    winnerName: string;
    loserName: string;
    eloDelta: number;
    bountyCollected: number;
    winnerNewElo: number;
    loserNewElo: number;
    isUpset: boolean;
    crownChangedHands: boolean;
    recap?: MatchRecap;
  } | null;
  onClose: () => void;
  onViewLeaderboard: () => void;
}

const first = (name: string) => name.split(' ')[0];

const joinNames = (names: string[]): string =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** One line for where somebody ended up on the ladder, and who they went past. */
const RankLine: React.FC<{ move: RankMove; tone: 'up' | 'down' }> = ({ move, tone }) => {
  const climbed = move.before !== null && move.after < move.before;
  const dropped = move.before !== null && move.after > move.before;
  const colour = climbed ? 'text-[#4edea3]' : dropped ? 'text-[#ffb4ab]' : 'text-[#bbcabf]';
  const Icon = climbed ? ArrowUpRight : dropped ? ArrowDownRight : Minus;
  return (
    <span className={`flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs font-bold ${colour}`}>
      <Icon className="h-3.5 w-3.5 stroke-[3]" />
      {move.before === null ? (
        <>Enters at #{move.after}</>
      ) : climbed || dropped ? (
        <>#{move.before} → #{move.after}</>
      ) : (
        <>Holds #{move.after}</>
      )}
      {tone === 'up' && move.passed.length > 0 && (
        <span className="font-['Space_Grotesk'] font-normal text-[#bbcabf]">· past {joinNames(move.passed)}</span>
      )}
      {tone === 'down' && move.passedBy.length > 0 && (
        <span className="font-['Space_Grotesk'] font-normal text-[#bbcabf]">· {joinNames(move.passedBy)} went by</span>
      )}
    </span>
  );
};

/**
 * The one screen every player is certain to see, so it carries what the result
 * actually changed: the places moved, who was passed, the head-to-head, whose
 * calls came in, any title taken. Two numbers and a badge was a receipt.
 */
export const MatchSuccessModal: React.FC<MatchSuccessModalProps> = ({
  result,
  onClose,
  onViewLeaderboard,
}) => {
  if (!result) return null;
  const recap = result.recap;
  const winnerFirst = first(result.winnerName);
  const loserFirst = first(result.loserName);
  const endedRun = recap && recap.loser.streakBefore >= 3 ? recap.loser.streakBefore : 0;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="anim-pop relative flex max-h-[92vh] w-full max-w-sm flex-col rounded-2xl border border-[#10b981]/50 bg-gradient-to-b from-[#1c2026] to-[#10141a] shadow-[0_0_32px_rgba(16,185,129,0.25)]">
        <div className="overflow-y-auto p-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 animate-bounce items-center justify-center rounded-full border border-[#10b981] bg-[#10b981]/20 text-[#4edea3] shadow-[0_0_20px_rgba(16,185,129,0.4)]">
            <Trophy className="h-7 w-7" />
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
            {result.isUpset && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#ffb95f]/40 bg-[#ffb95f]/20 px-2.5 py-1 font-['JetBrains_Mono'] text-xs font-bold text-[#ffb95f]">
                <Flame className="h-3.5 w-3.5 fill-[#ffb95f]" />
                UPSET
              </span>
            )}
            {result.bountyCollected > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/20 px-2.5 py-1 font-['JetBrains_Mono'] text-xs font-bold text-[#f59e0b]">
                <Crown className="h-3.5 w-3.5 fill-[#f59e0b]" />
                +{result.bountyCollected} BOUNTY
              </span>
            )}
            {result.crownChangedHands && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#10b981]/40 bg-[#10b981]/20 px-2.5 py-1 font-['JetBrains_Mono'] text-xs font-bold text-[#4edea3]">
                NEW #1
              </span>
            )}
          </div>

          <h2 className="font-['Chivo'] text-2xl font-black tracking-tight text-white">
            {winnerFirst} takes it
          </h2>
          <p className="mt-1 font-['Space_Grotesk'] text-sm text-[#bbcabf]">
            <span className="font-bold text-white">{result.winnerName}</span> beat{' '}
            <span className="text-[#86948a]">{result.loserName}</span>
          </p>

          {/* What moved */}
          <div className="my-4 space-y-2 rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate font-['Space_Grotesk'] text-xs font-medium text-white">{result.winnerName}</span>
                {recap && <RankLine move={recap.winner.rank} tone="up" />}
              </div>
              <div className="shrink-0 text-right">
                <span className="font-['JetBrains_Mono'] text-base font-black text-[#4edea3]">+{result.eloDelta + result.bountyCollected}</span>
                <span className="ml-1 font-['JetBrains_Mono'] text-xs text-[#bbcabf]">({result.winnerNewElo})</span>
              </div>
            </div>
            <div className="border-t border-[#30363d]/60" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate font-['Space_Grotesk'] text-xs font-medium text-[#86948a]">{result.loserName}</span>
                {recap && <RankLine move={recap.loser.rank} tone="down" />}
              </div>
              <div className="shrink-0 text-right">
                <span className="font-['JetBrains_Mono'] text-base font-black text-[#ffb4ab]">-{result.eloDelta + result.bountyCollected}</span>
                <span className="ml-1 font-['JetBrains_Mono'] text-xs text-[#86948a]">({result.loserNewElo})</span>
              </div>
            </div>
          </div>

          {recap && (
            <div className="space-y-2 text-left">
              {(recap.winner.streak >= 2 || endedRun > 0) && (
                <div className="flex items-center gap-2 rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2.5">
                  <Flame className={`h-4 w-4 shrink-0 ${recap.winner.streak >= 3 ? 'fill-[#ffb95f] text-[#ffb95f]' : 'text-[#86948a]'}`} />
                  <span className="font-['Space_Grotesk'] text-xs text-[#bbcabf]">
                    {recap.winner.streak >= 2 && (
                      <span className="font-bold text-white">{winnerFirst} is on {recap.winner.streak} in a row. </span>
                    )}
                    {endedRun > 0 && <>Ended {loserFirst}'s {endedRun}-match run.</>}
                  </span>
                </div>
              )}

              {recap.rivalry && recap.rivalry.meetings > 1 && (
                <div className="flex items-start gap-2 rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2.5">
                  <Swords className="mt-0.5 h-4 w-4 shrink-0 text-[#ffb95f]" />
                  <span className="font-['Space_Grotesk'] text-xs text-[#bbcabf]">
                    <span className="font-['JetBrains_Mono'] font-bold text-white">
                      {recap.rivalry.wins}–{recap.rivalry.losses}
                    </span>{' '}
                    {winnerFirst} in the head-to-head
                    {recap.rivalry.runHolderId === recap.winner.id && recap.rivalry.runLength >= 2 && (
                      <> · has taken the last {recap.rivalry.runLength}</>
                    )}
                    .
                  </span>
                </div>
              )}

              {recap.calls && (recap.calls.right.length + recap.calls.wrong.length > 0) && (
                <div className="rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2.5 font-['Space_Grotesk'] text-xs text-[#bbcabf]">
                  {recap.calls.right.length > 0 && (
                    <div>
                      <span className="font-bold text-[#4edea3]">Called it:</span> {joinNames(recap.calls.right)}
                    </div>
                  )}
                  {recap.calls.wrong.length > 0 && (
                    <div className={recap.calls.right.length > 0 ? 'mt-1' : ''}>
                      <span className="font-bold text-[#ffb4ab]">Got it wrong:</span> {joinNames(recap.calls.wrong)}
                    </div>
                  )}
                </div>
              )}

              {recap.titlesWon.length > 0 && (
                <div className="rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2.5">
                  <span className="font-['JetBrains_Mono'] text-[10px] font-extrabold uppercase tracking-widest text-[#f59e0b]">
                    New title{recap.titlesWon.length > 1 ? 's' : ''}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {recap.titlesWon.map((title) => (
                      <span key={title.key} className="inline-flex items-center gap-1 rounded-lg border border-[#3c4a42] bg-[#1c2026] px-2 py-1 font-['Space_Grotesk'] text-[11px] text-white">
                        <span>{title.emoji}</span>
                        <span className="font-bold">{title.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-[#30363d] p-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-[#10b981] px-4 py-3 font-['Chivo'] text-sm font-bold tracking-wide text-[#002113] shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all hover:bg-[#4edea3] active:scale-[0.98]"
          >
            Done
          </button>
          <button
            onClick={() => {
              onClose();
              onViewLeaderboard();
            }}
            className="w-full rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-2.5 font-['Chivo'] text-xs font-semibold tracking-wide text-white transition-all hover:bg-[#21262d]"
          >
            See the ladder
          </button>
        </div>
      </div>
    </div>
  );
};
