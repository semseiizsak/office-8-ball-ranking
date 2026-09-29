import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Player } from '../../types';
import { Card, Pack, RARITIES } from '../../utils/cards';
import { BallBurst } from '../ui';
import { PlayerCard, RARITY_GLOW } from './PlayerCard';

type Phase = 'shake' | 'tear' | 'cards' | 'summary' | 'error';

const rank = (card: Card) => RARITIES.indexOf(card.rarity);
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Opening a pack, full screen. The pack shakes and tears, three cards drop
 * face down, and each flips on a tap with a glow in its rarity colour. An
 * epic or better gets a bigger reveal; a legendary or mythic a gold burst.
 */
export const PackOpening: React.FC<{
  pack: Pack;
  players: Player[];
  onOpen: (packId: string) => Promise<Card[]>;
  onClose: () => void;
}> = ({ pack, players, onOpen, onClose }) => {
  const motion = !reduced();
  const [phase, setPhase] = useState<Phase>('shake');
  const [cards, setCards] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false]);
  const [error, setError] = useState('');
  const byId = new Map(players.map((player) => [player.id, player]));

  // Shake, then tear: the pack is opened for real the moment it tears.
  useEffect(() => {
    let alive = true;
    const tear = window.setTimeout(
      () => {
        if (!alive) return;
        setPhase('tear');
        const started = Date.now();
        onOpen(pack.id)
          .then((opened) => {
            const wait = Math.max(0, (motion ? 640 : 0) - (Date.now() - started));
            window.setTimeout(() => {
              if (!alive) return;
              setCards(opened);
              setPhase('cards');
            }, wait);
          })
          .catch((reason: unknown) => {
            if (!alive) return;
            setError(reason instanceof Error ? reason.message : 'The pack would not open.');
            setPhase('error');
          });
      },
      motion ? 950 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(tear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = (index: number) => {
    if (flipped[index]) return;
    const next = flipped.map((value, i) => value || i === index);
    setFlipped(next);
    if (next.every(Boolean)) window.setTimeout(() => setPhase('summary'), motion ? 1400 : 0);
  };

  const revealed = cards.filter((_, index) => flipped[index]);
  const best = revealed.reduce<Card | null>((top, card) => (!top || rank(card) > rank(top) ? card : top), null);
  const big = !!best && rank(best) >= RARITIES.indexOf('legendary');
  const headline =
    phase === 'summary' || big ? (best?.rarity === 'mythic' ? 'Mythic!' : big ? 'Legendary!' : best && rank(best) >= 3 ? 'Epic pull' : 'Your cards') : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Opening a pack"
      className="anim-fade fixed inset-0 z-[70] flex items-center justify-center overflow-clip bg-black px-4 text-center"
    >
      {big && motion && <span className="po-burst" />}
      {big && motion && <BallBurst key={best?.id} />}
      <div className="relative z-10 grid w-full max-w-md grid-cols-[minmax(0,1fr)] justify-items-center gap-5">
        {(phase === 'shake' || phase === 'tear') && (
          <>
            <h1 className="text-[32px]">{pack.kind === 'champion' ? 'Champion pack' : pack.kind === 'earned' ? 'Earned pack' : 'Weekly pack'}</h1>
            <div className={`relative h-[260px] w-[180px] ${phase === 'shake' && motion ? 'po-shake' : ''}`}>
              <div className={`pk ${pack.kind} absolute inset-x-0 top-0 h-[44px] rounded-b-none ${phase === 'tear' && motion ? 'po-tear-top' : ''}`} />
              <div className={`pk ${pack.kind} absolute inset-x-0 bottom-0 top-[46px] rounded-t-none ${phase === 'tear' && motion ? 'po-tear-body' : ''}`}>
                <span className="relative z-10 font-display text-[64px] font-extrabold text-bg">8</span>
              </div>
            </div>
            <p className="font-semibold text-white/70">{phase === 'shake' ? 'Three cards inside.' : 'Tearing it open.'}</p>
          </>
        )}

        {(phase === 'cards' || phase === 'summary') && (
          <>
            <h1 className="min-h-[34px] text-[32px]">{headline ?? 'Tap to flip'}</h1>
            <div className="flex w-full justify-center gap-2.5" style={{ perspective: 1000 }}>
              {cards.map((card, index) => {
                const on = flipped[index];
                const bigReveal = on && rank(card) >= 3;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => flip(index)}
                    aria-label={on ? `${byId.get(card.playerId)?.name ?? 'Card'}, ${card.rarity}` : `Flip card ${index + 1}`}
                    className={`relative aspect-[320/458] w-[calc((100%-20px)/3)] max-w-[130px] ${motion ? 'po-drop' : ''}`}
                    style={{ animationDelay: `${index * 160}ms` }}
                  >
                    <span className={`absolute inset-0 block ${bigReveal && motion ? 'po-big' : ''}`} style={{ perspective: 1000 }}>
                      <span className="po-flip absolute inset-0 block" style={{ transform: on ? 'rotateY(180deg)' : 'none' }}>
                        <span className="po-face po-back">
                          <span className="font-display text-2xl font-extrabold text-white/25">8</span>
                        </span>
                        <span className="po-face" style={{ transform: 'rotateY(180deg)' }}>
                          {on && motion && (
                            <span
                              className="po-flash"
                              style={{
                                background: `radial-gradient(closest-side, ${RARITY_GLOW[card.rarity]}, transparent)`,
                              }}
                            />
                          )}
                          <PlayerCard
                            card={card}
                            player={byId.get(card.playerId)}
                            other={card.otherId ? byId.get(card.otherId) : null}
                            size="medium"
                            width={undefined}
                            className="!w-full"
                          />
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {phase === 'summary' ? (
              <div className="anim-rise grid w-full justify-items-center gap-3">
                <p className="font-semibold text-white/70">
                  {cards.map((card) => `${byId.get(card.playerId)?.name.split(' ')[0] ?? 'Someone'} ${card.rarity}`).join(', ')}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="press h-12 rounded-full bg-white px-7 text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg"
                >
                  Add to collection
                </button>
              </div>
            ) : (
              <p className="font-semibold text-white/70">{flipped.filter(Boolean).length} of 3 flipped</p>
            )}
          </>
        )}

        {phase === 'error' && (
          <div className="grid justify-items-center gap-3">
            <h1 className="text-[32px]">Not this one</h1>
            <p className="font-semibold text-white/70">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="press h-12 rounded-full bg-white px-7 text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
