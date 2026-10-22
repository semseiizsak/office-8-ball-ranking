import React, { useRef } from 'react';
import { Player } from '../../types';
import { Card, CardType, Rarity, ThemedType } from '../../utils/cards';
import { ballColor, playerBall } from '../../utils/balls';
import { sponsorOf } from '../../utils/sponsors';
import { useGyroTilt } from '../../utils/gyro';
import { usePrevSeason } from './CardHistory';

export type CardSize = 'full' | 'medium' | 'mini';

/** How hard a full-size card leans with the phone or pointer. Common and uncommon stay put. */
const TILT_STRENGTH: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0.55, epic: 0.75, legendary: 1.3, mythic: 1.3 };

/** What the special editions are called, printed above the name. */
const THEME_FLAG: Record<ThemedType, string> = {
  giant: 'Giant slayer',
  onfire: 'On fire',
  ironman: 'Iron man',
  grinder: 'Grinder',
  dynasty: 'Dynasty',
  oracle: 'Oracle',
  jackpot: 'Jackpot',
  kingslayer: 'Kingslayer',
  underdog: 'Underdog',
  sniper: 'Hot hand',
  sweep: 'Clean sweep',
  highroller: 'High roller',
};
const SPECIAL_FLAG: Record<Exclude<CardType, 'player'>, string> = {
  crown: 'Crown',
  cup: 'Weekly cup champion',
  season: 'Season champion',
  totw: 'Team of the week',
  clown: 'Clown',
  moment: 'Moment',
  rivalry: 'Rivalry',
  ...THEME_FLAG,
};

/** The colour each rarity glows in, for the pack reveal and the album. */
export const RARITY_GLOW: Record<Rarity, string> = {
  common: '#A8622C',
  uncommon: '#C9CCD1',
  rare: '#2B5FC7',
  epic: '#F2B705',
  legendary: '#F2B705',
  mythic: '#F2B705',
};

/** A rarer print of the same player is a stronger card: the rating adds a step per rarity, up to 99. */
const RATING_BONUS: Record<Rarity, number> = { common: 0, uncommon: 2, rare: 4, epic: 6, legendary: 8, mythic: 10 };
export const ratingOf = (card: Pick<Card, 'rarity' | 'stats'>) => Math.min(99, card.stats.ovr + RATING_BONUS[card.rarity]);

const first = (player: Pick<Player, 'name'> | null | undefined) => (player?.name ?? '?').split(' ')[0];
const seasonLabel = (season: string) => (/^season/i.test(season) ? season : `Season ${season || 1}`);
const seasonShort = (season: string) => `S${season.match(/\d+/)?.[0] ?? '1'}`;

const SPARKS = [
  { x: 14, y: 18, d: 0 },
  { x: 76, y: 14, d: 0.5 },
  { x: 60, y: 44, d: 1 },
  { x: 22, y: 52, d: 0.3 },
  { x: 82, y: 62, d: 1.3 },
  { x: 40, y: 30, d: 0.8 },
  { x: 12, y: 78, d: 0.6 },
  { x: 70, y: 84, d: 0.2 },
];

const WIDTH: Record<CardSize, number> = { full: 300, medium: 150, mini: 0 };

/**
 * A player card: a photo in a frame, the name, and how the player finished the
 * season before. The frame shape and the light on it tell the rarity: common and
 * uncommon stand still, rare and up lean with the pointer or the phone.
 */
export const PlayerCard: React.FC<{
  card: Pick<Card, 'type' | 'rarity' | 'stats' | 'serial' | 'season' | 'seasonId' | 'note' | 'photo' | 'photoId'>;
  player: Pick<Player, 'id' | 'name' | 'avatarUrl' | 'ball' | 'sponsor'> | null | undefined;
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
  const prev = usePrevSeason(card.seasonId, player?.id);
  const sponsor = sponsorOf(player);
  const special = card.type !== 'player';
  const strength = TILT_STRENGTH[card.rarity];
  const tilt = size === 'full' && strength > 0;
  const pointerActive = useRef(false);
  useGyroTilt(ref, { enabled: tilt, strength, glare: true, pointerActive });
  const name = card.type === 'rivalry' ? `${first(player)} vs ${first(other)}` : first(player);
  const initial = (player?.name ?? '?').charAt(0);
  const flag = special ? SPECIAL_FLAG[card.type as Exclude<CardType, 'player'>] : '';
  const shine = card.rarity === 'legendary' || card.rarity === 'mythic';

  // Tilt and shine follow the pointer; everything eases back when it leaves.
  const move = (event: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
    pointerActive.current = true;
    el.classList.add('live');
    el.style.setProperty('--ry', `${(px - 0.5) * 22 * strength}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * 18 * strength}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--o', '1');
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    pointerActive.current = false;
    el.classList.remove('live');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--o', '0');
  };

  const style = {
    ['--c' as string]: ballColor(n).c,
    width: width ?? (WIDTH[size] || '100%'),
  } as React.CSSProperties;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${name}, ${flag || card.rarity}, ${ratingOf(card)} overall${prev ? `, last season ${prev.winPct}% wins, rank ${prev.rank}, ${prev.cups} cups` : ''}`}
      className={`pc pc-${card.rarity} pc-${size}${tilt ? ' pc-tiltable' : ''} ${className}`}
      style={style}
      onPointerMove={tilt ? move : undefined}
      onPointerLeave={tilt ? leave : undefined}
    >
      <div className="pc-in">
        <div className="pc-fr">
          <div className="pc-ph" style={photo ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(8,8,10,.92)), url("${photo}")` } : undefined}>
            {!photo && <span className="pc-mono">{initial}</span>}
            <span className="pc-hl" />
            <span className="pc-gl" />
            {shine && <span className="pc-sw" />}
            {card.rarity === 'mythic' && (
              <span className="pc-sparks" aria-hidden="true">
                {SPARKS.map((spark, i) => (
                  <i key={i} style={{ left: `${spark.x}%`, top: `${spark.y}%`, animationDelay: `${spark.d}s` }} />
                ))}
              </span>
            )}
            {sponsor && size !== 'mini' && (
              <span className={`pc-sp-patch${sponsor.sharp ? ' sharp' : ''}`}>
                <img src={sponsor.logo} alt={sponsor.name} draggable={false} />
              </span>
            )}
            <div className="pc-top">
              <span className="pc-ball">{n}</span>
              <span>{seasonShort(card.season)}</span>
            </div>
            <div className="pc-ovr">
              <b>{ratingOf(card)}</b>
              <span>OVR</span>
            </div>
            {prev && <span className="pc-rank">#{prev.rank}</span>}
            <div className="pc-bot">
              {flag && <div className="pc-flag">{flag}</div>}
              <div className="pc-name">{name}</div>
              {prev ? (
                <div className="pc-st">
                  <div>
                    <b>{prev.winPct}%</b>
                    <span>Winrate</span>
                  </div>
                  <div>
                    <b>#{prev.rank}</b>
                    <span>Place</span>
                  </div>
                  <div>
                    <b>{prev.cups}</b>
                    <span>Cups</span>
                  </div>
                </div>
              ) : (
                <div className="pc-rk">
                  <b>Rookie</b>
                  <span>{seasonLabel(card.season)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
