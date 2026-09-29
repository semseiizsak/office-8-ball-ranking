import React, { useRef } from 'react';
import { Crown, Laugh, Star, Swords, Trophy, Zap } from 'lucide-react';
import { Player } from '../../types';
import { Card, CardType, Rarity } from '../../utils/cards';
import { ballColor, playerBall } from '../../utils/balls';

export type CardSize = 'full' | 'medium' | 'mini';

/** The short printed under the OVR. */
export const POSITION: Record<Rarity, string> = { common: 'COM', uncommon: 'UNC', rare: 'RAR', epic: 'EPC', legendary: 'LEG', mythic: 'ICON' };
const SPECIAL_POSITION: Record<Exclude<CardType, 'player'>, string> = { crown: 'KING', cup: 'CUP', totw: 'TOTW', clown: 'CLN', moment: 'BRK', rivalry: 'VS' };
const SPECIAL_FLAG: Record<Exclude<CardType, 'player'>, string> = { crown: 'Crown', cup: 'Cup', totw: 'TOTW', clown: 'Clown', moment: 'Moment', rivalry: 'Rivalry' };
const SPECIAL_ICON = { crown: Crown, cup: Trophy, totw: Star, clown: Laugh, moment: Zap, rivalry: Swords };

/** The colour each rarity glows in, for the pack reveal and the album. */
export const RARITY_GLOW: Record<Rarity, string> = {
  common: '#A8622C',
  uncommon: '#C9CCD1',
  rare: '#F2B705',
  epic: '#F2B705',
  legendary: '#B400FF',
  mythic: '#F2B705',
};

export const positionOf = (card: Pick<Card, 'type' | 'rarity'>) => (card.type === 'player' ? POSITION[card.rarity] : SPECIAL_POSITION[card.type]);
const first = (player: Pick<Player, 'name'> | null | undefined) => (player?.name ?? '?').split(' ')[0];
const seasonLabel = (season: string) => (/^season/i.test(season) ? season : `Season ${season || 1}`);

const WIDTH: Record<CardSize, number> = { full: 300, medium: 150, mini: 0 };

/**
 * A player card: the classic FIFA shield. Laid out on a 320 wide grid and
 * scaled with the card, so text lines up the same at every size. Full art
 * (legendary and mythic) tilts and moves its foil under the pointer.
 */
export const PlayerCard: React.FC<{
  card: Pick<Card, 'type' | 'rarity' | 'stats' | 'serial' | 'season' | 'note' | 'photo' | 'photoId'>;
  player: Pick<Player, 'id' | 'name' | 'avatarUrl' | 'ball'> | null | undefined;
  /** The second player on a rivalry card. */
  other?: Pick<Player, 'id' | 'name' | 'ball'> | null;
  size?: CardSize;
  /** Overrides the width in px; a mini fills its column when left out. */
  width?: number;
  className?: string;
}> = ({ card, player, other, size = 'full', width, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const n = playerBall(player);
  // The photo printed when the card was pulled; only cards from before photos were stored fall back to today's.
  const photo = card.photo ?? (card.photoId ? '' : player?.avatarUrl || '');
  const special = card.type !== 'player';
  const fullArt = !special && (card.rarity === 'legendary' || card.rarity === 'mythic');
  const tilt = fullArt && size === 'full';
  const glows = !special && ['rare', 'epic', 'legendary', 'mythic'].includes(card.rarity);
  const Icon = special ? SPECIAL_ICON[card.type as Exclude<CardType, 'player'>] : null;
  const name = card.type === 'rivalry' ? `${first(player)} vs ${first(other)}` : first(player);
  const initial = (player?.name ?? '?').charAt(0);

  // Tilt, foil and glare follow the pointer; everything eases back when it leaves.
  const move = (event: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
    el.classList.add('live');
    el.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * 18}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--o', '1');
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('live');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--o', '0');
  };

  // What sits in the middle on the cards that are not full art.
  let center: React.ReactNode = null;
  if (!fullArt) {
    const withPhoto = (big = false) =>
      photo ? (
        <span className={`pc-center${big ? ' big' : ''}`} style={{ backgroundImage: `url("${photo}")` }} />
      ) : (
        <span className={`pc-center${big ? ' big' : ''}`}>{initial}</span>
      );
    if (card.type === 'player') {
      if (card.rarity === 'common') center = <span className="pc-center">{initial}</span>;
      else if (card.rarity === 'uncommon') center = <span className="pc-center">{n}</span>;
      else center = withPhoto(card.rarity === 'epic');
    } else if (card.type === 'crown' || card.type === 'cup') center = withPhoto(true);
    else if (card.type === 'clown') center = <span className="pc-center">🤡</span>;
    else if (card.type === 'moment') center = <span className="pc-center">8</span>;
    else if (card.type === 'rivalry') center = <span className="pc-center">VS</span>;
    else center = withPhoto();
  }

  const style = {
    ['--c' as string]: ballColor(n).c,
    ['--c2' as string]: ballColor(playerBall(other)).c,
    ['--photo' as string]: photo ? `url("${photo}")` : 'none',
    width: width ?? (WIDTH[size] || '100%'),
  } as React.CSSProperties;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${name}, ${special ? SPECIAL_FLAG[card.type as Exclude<CardType, 'player'>] : card.rarity}, ${card.stats.ovr} overall`}
      className={`pc pc-${card.rarity} pc-t-${card.type} pc-${size}${tilt ? ' pc-tiltable' : ''}${glows && size !== 'mini' ? ' pc-glow' : ''} ${className}`}
      style={style}
      onPointerMove={tilt ? move : undefined}
      onPointerLeave={tilt ? leave : undefined}
    >
      <div className="pc-in">
        <div className="pc-sh pc-bg">{card.rarity === 'mythic' && !special && <span className="pc-spin" />}</div>
        {fullArt && (
          <>
            <div className="pc-sh pc-inset pc-art" />
            {!photo && <div className="pc-mono">{initial}</div>}
            {card.rarity === 'legendary' && <div className="pc-sh pc-inset pc-foil" />}
            <div className="pc-sh pc-inset pc-sweep" />
            <div className="pc-sh pc-inset pc-glare" />
          </>
        )}
        {!fullArt && ['common', 'uncommon', 'rare'].includes(card.rarity) && !special && <div className="pc-sh pc-sweep" />}
        <div className="pc-text">
          {center}
          <div className="pc-corner">
            <div className="pc-ovr">{card.stats.ovr}</div>
            <div className="pc-pos">{positionOf(card)}</div>
            <div className="pc-rule" />
            <div className="pc-ball">{n}</div>
          </div>
          <div className="pc-crest">
            {Icon ? (
              <span className="pc-icon">
                <Icon strokeWidth={2.5} />
              </span>
            ) : (
              <span className="pc-gem" />
            )}
            <span className="pc-flag">{special ? SPECIAL_FLAG[card.type as Exclude<CardType, 'player'>] : card.rarity === 'mythic' ? '1 of 1' : card.rarity}</span>
          </div>
          <div className="pc-bottom">
            <div className="pc-name">{name}</div>
            {card.note && special && <div className="pc-note">{card.note}</div>}
            <div className="pc-line" />
            <div className="pc-stats">
              {(['WIN', 'CLU', 'FRM', 'BRK', 'CAL', 'GRT'] as const).map((key) => (
                <span key={key}>
                  <b>{card.stats[key]}</b>
                  {key}
                </span>
              ))}
            </div>
            <div className="pc-foot">
              <span>{seasonLabel(card.season)}</span>
              <span>{card.rarity === 'mythic' && !special ? '1 of 1' : `No ${String(card.serial).padStart(2, '0')}`}</span>
            </div>
          </div>
          {size === 'mini' && <div className="pc-mini-pos">{positionOf(card)}</div>}
        </div>
        {fullArt && (
          <div className="pc-glints" aria-hidden="true">
            <i style={{ left: '13.75%', top: '42.8%', animationDelay: '.3s' }} />
            <i style={{ right: '12.5%', top: '32.75%', animationDelay: '1.3s' }} />
            {card.rarity === 'mythic' && <i style={{ right: '21.9%', top: '46.7%', animationDelay: '2.1s' }} />}
          </div>
        )}
      </div>
    </div>
  );
};
