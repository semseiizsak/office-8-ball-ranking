import { Rarity, ThemedType, TYPE_LABEL } from './cards';

/**
 * What unlocking something pays out. Most achievement tiers and badges give
 * a card pack, better the harder it was: tiers 1 and 2 a standard pack, 3 a
 * rare pack, 4 an epic pack, the 8-ball tier a legendary pack; badges a
 * standard pack, secret ones a rare pack. A handful of special achievements
 * give a themed card instead, which exists nowhere else.
 */

export type Reward =
  | { kind: 'pack'; minRarity?: Rarity; label: string }
  | { kind: 'card'; type: ThemedType; label: string };

const PACKS: Record<string, Reward> = {
  standard: { kind: 'pack', label: 'Card pack' },
  rare: { kind: 'pack', minRarity: 'rare', label: 'Rare pack' },
  epic: { kind: 'pack', minRarity: 'epic', label: 'Epic pack' },
  legendary: { kind: 'pack', minRarity: 'legendary', label: 'Legendary pack' },
};

/** Unlock key (badge id, or t:achievement:tier) to its themed card. */
export const THEMED: Record<string, ThemedType> = {
  't:upsets:3': 'giant',
  't:streak:3': 'onfire',
  't:matches:4': 'ironman',
  't:dstreak:3': 'grinder',
  't:cups:3': 'dynasty',
  't:calls:3': 'oracle',
  jackpot1: 'jackpot',
  regicide: 'kingslayer',
  nobeliever: 'underdog',
  hothand: 'sniper',
  sweep: 'sweep',
};

export function rewardFor(key: string, secret = false): Reward {
  const themed = THEMED[key];
  if (themed) return { kind: 'card', type: themed, label: `${TYPE_LABEL[themed]} card` };
  if (key.startsWith('t:')) {
    const tier = Number(key.split(':')[2]);
    return tier >= 5 ? PACKS.legendary : tier === 4 ? PACKS.epic : tier === 3 ? PACKS.rare : PACKS.standard;
  }
  return secret ? PACKS.rare : PACKS.standard;
}
