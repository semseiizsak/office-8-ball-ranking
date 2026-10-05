import React, { useRef } from 'react';
import { Crown, Laugh, Star, Swords, Trophy, Zap } from 'lucide-react';
import { Player } from '../../types';
import { Card, CardType, Rarity, ThemedType } from '../../utils/cards';
import { ballColor, playerBall } from '../../utils/balls';
import { sponsorOf } from '../../utils/sponsors';
import { useGyroTilt } from '../../utils/gyro';

export type CardSize = 'full' | 'medium' | 'mini';

/** How hard a full-size card leans with the phone or pointer: commons barely rock, full art swings all the way. */
const TILT_STRENGTH: Record<Rarity, number> = { common: 0.35, uncommon: 0.45, rare: 0.6, epic: 0.75, legendary: 1, mythic: 1 };

/** The short printed under the OVR. */
export const POSITION: Record<Rarity, string> = { common: 'COM', uncommon: 'UNC', rare: 'RAR', epic: 'EPC', legendary: 'LEG', mythic: 'ICON' };
/** Themed cards, one per special achievement: rim colour, emoji and short. */
const THEME: Record<ThemedType, { c: string; e: string; pos: string; flag: string }> = {
  giant: { c: '#C8102E', e: '🗡️', pos: 'GNT', flag: 'Giant slayer' },
  onfire: { c: '#F26B1D', e: '🔥', pos: 'HOT', flag: 'On fire' },
  ironman: { c: '#C9CCD1', e: '🦾', pos: 'IRN', flag: 'Iron man' },
  grinder: { c: '#0B7A3E', e: '⏱️', pos: 'DLY', flag: 'Grinder' },
  dynasty: { c: '#F2B705', e: '🏆', pos: 'DYN', flag: 'Dynasty' },
  oracle: { c: '#5B2A86', e: '🔮', pos: 'ORC', flag: 'Oracle' },
  jackpot: { c: '#F2B705', e: '💎', pos: 'JKP', flag: 'Jackpot' },
  kingslayer: { c: '#C8102E', e: '⚔️', pos: 'KSL', flag: 'Kingslayer' },
  underdog: { c: '#1F4FA8', e: '🙈', pos: 'UDG', flag: 'Underdog' },
  sniper: { c: '#0B7A3E', e: '🎯', pos: 'SNP', flag: 'Hot hand' },
  sweep: { c: '#FFFFFF', e: '🧹', pos: 'SWP', flag: 'Clean sweep' },
  highroller: { c: '#F2B705', e: '🪙', pos: 'HRL', flag: 'High roller' },
};
const themed = (type: CardType): type is ThemedType => type in THEME;
const SPECIAL_POSITION: Record<Exclude<CardType, 'player'>, string> = {
  crown: 'KING', cup: 'CUP', season: 'CHAMP', totw: 'TOTW', clown: 'CLN', moment: 'BRK', rivalry: 'VS',
  ...(Object.fromEntries(Object.entries(THEME).map(([k, v]) => [k, v.pos])) as Record<ThemedType, string>),
};
const SPECIAL_FLAG: Record<Exclude<CardType, 'player'>, string> = {
  crown: 'Crown', cup: 'Cup', season: 'Champion', totw: 'TOTW', clown: 'Clown', moment: 'Moment', rivalry: 'Rivalry',
  ...(Object.fromEntries(Object.entries(THEME).map(([k, v]) => [k, v.flag])) as Record<ThemedType, string>),
};
const SPECIAL_ICON: Record<Exclude<CardType, 'player'>, typeof Star> = {
  crown: Crown, cup: Trophy, season: Crown, totw: Star, clown: Laugh, moment: Zap, rivalry: Swords,
  ...(Object.fromEntries(Object.keys(THEME).map((k) => [k, Star])) as Record<ThemedType, typeof Star>),
};

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
/** The cup champion's laurel: two gold branches of pointed leaves framing the photo. */
const LAUREL_LEAVES = Array.from({ length: 11 }, (_, i) => {
  const a = ((106 + i * 6.6) * Math.PI) / 180;
  return {
    x: 130 + 122 * Math.cos(a),
    y: 8 + 122 * Math.sin(a),
    // Along the branch, towards its tip.
    tangent: (Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI,
    size: 1.15 - i * 0.04,
  };
});
const LEAF = 'M0 0 Q 7 -5 15 0 Q 7 5 0 0 Z';
const Laurel = () => (
  <svg className="pc-laurel" viewBox="0 0 260 140" aria-hidden="true">
    {[1, -1].map((side) => (
      <g key={side} transform={side === -1 ? 'translate(260 0) scale(-1 1)' : undefined} fill="#F2B705" stroke="#0A0A0A" strokeWidth="0.7">
        <path d="M 122 132 A 122 122 0 0 1 12 18" fill="none" stroke="#F2B705" strokeWidth="2" strokeLinecap="round" />
        {LAUREL_LEAVES.map((leaf, i) =>
          [-42, 42].map((turn) => (
            <path key={`${i}${turn}`} d={LEAF} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.tangent + turn}) scale(${leaf.size})`} />
          ))
        )}
        <path d={LEAF} transform={`translate(12 18) rotate(${LAUREL_LEAVES[10].tangent + 4}) scale(1)`} />
      </g>
    ))}
  </svg>
);

const seasonLabel = (season: string) => (/^season/i.test(season) ? season : `Season ${season || 1}`);

const WIDTH: Record<CardSize, number> = { full: 300, medium: 150, mini: 0 };

/**
 * A player card: the classic FIFA shield. Laid out on a 320 wide grid and
 * scaled with the card, so text lines up the same at every size. Full art
 * (legendary and mythic) tilts and moves its foil under the pointer.
 */
export const PlayerCard: React.FC<{
  card: Pick<Card, 'type' | 'rarity' | 'stats' | 'serial' | 'season' | 'note' | 'photo' | 'photoId'>;
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
  const special = card.type !== 'player';
  const sponsor = sponsorOf(player);
  const cup = card.type === 'cup';
  const champ = card.type === 'season';
  // The cup and season champions' cards are 1 of 1s, full art like the top rarities.
  const fullArt = cup || champ || (!special && (card.rarity === 'legendary' || card.rarity === 'mythic'));
  // Cup cards carry the week of the season; the first ones only had the date.
  const cupWeek = cup ? (/^Week \d+$/.test(card.note ?? '') ? card.note : card.note?.match(/week of (\S+)/)?.[1] ?? '') : '';
  const tilt = size === 'full';
  const strength = fullArt ? 1 : special ? 0.6 : TILT_STRENGTH[card.rarity];
  const pointerActive = useRef(false);
  useGyroTilt(ref, { enabled: tilt, strength, glare: fullArt, pointerActive });
  const glows = cup || champ || (!special && ['rare', 'epic', 'legendary', 'mythic'].includes(card.rarity));
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
    else if (themed(card.type)) center = <span className="pc-center pc-emoji">{THEME[card.type].e}</span>;
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
      className={`pc pc-${card.rarity} pc-t-${card.type}${themed(card.type) ? ' pc-themed' : ''} pc-${size}${tilt ? ' pc-tiltable' : ''}${glows && size !== 'mini' ? ' pc-glow' : ''} ${className}`}
      style={themed(card.type) ? { ...style, ['--th' as string]: THEME[card.type].c } : style}
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
            {(cup || champ) && <Laurel />}
            <div className="pc-sh pc-inset pc-sweep" />
            <div className="pc-sh pc-inset pc-glare" />
          </>
        )}
        {!fullArt && ['common', 'uncommon', 'rare'].includes(card.rarity) && !special && <div className="pc-sh pc-sweep" />}
        {sponsor && (
          <div
            className={`pc-sh pc-sponsor${fullArt ? ' on-art' : ''}`}
            style={{ ['--sp' as string]: sponsor.c, ['--sp2' as string]: sponsor.c2 ?? sponsor.c }}
          />
        )}
        <div className="pc-text">
          {center}
          {sponsor && size !== 'mini' && (
            <span className={`pc-sp-patch${sponsor.sharp ? ' sharp' : ''}`}>
              <img src={sponsor.logo} alt={sponsor.name} draggable={false} />
            </span>
          )}
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
            <span className="pc-flag">{cup || champ ? '1 of 1' : special ? SPECIAL_FLAG[card.type as Exclude<CardType, 'player'>] : card.rarity === 'mythic' ? '1 of 1' : card.rarity}</span>
          </div>
          <div className="pc-bottom">
            <div className="pc-name">{name}</div>
            {champ ? <div className="pc-note">Season champion</div> : cup ? <div className="pc-note">Weekly cup champion</div> : card.note && special && <div className="pc-note">{card.note}</div>}
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
              {champ ? (
                <span>No 1</span>
              ) : cup ? (
                cupWeek && <span>{cupWeek}</span>
              ) : (
                <span>{card.rarity === 'mythic' && !special ? '1 of 1' : `No ${String(card.serial).padStart(2, '0')}`}</span>
              )}
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
