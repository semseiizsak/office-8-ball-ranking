/**
 * Sponsors: each player can wear one of the group's restaurants, the way they
 * pick a ball. The logo shows on their profile, their cards and fight posters,
 * and the brand colour runs through their cards. Logos are the files as
 * supplied, never retyped as text.
 */

export type SponsorId = 'simons' | 'travis' | 'smashy' | 'buddys';

export interface Sponsor {
  id: SponsorId;
  name: string;
  logo: string;
  /** Main brand colour, and a second one where the brand has two. */
  c: string;
  c2?: string;
  /** Travis' Tenders never takes rounded corners. */
  sharp?: boolean;
}

export const SPONSORS: Record<SponsorId, Sponsor> = {
  simons: { id: 'simons', name: "Simon's Burger", logo: '/sponsors/simons.png', c: '#0EA650' },
  travis: { id: 'travis', name: "Travis' Tenders", logo: '/sponsors/travis.png', c: '#007450', c2: '#CC1040', sharp: true },
  smashy: { id: 'smashy', name: 'Smashy', logo: '/sponsors/smashy.png', c: '#1450A0' },
  buddys: { id: 'buddys', name: "Buddy's", logo: '/sponsors/buddys.png', c: '#E41C30' },
};

export const SPONSOR_IDS = Object.keys(SPONSORS) as SponsorId[];

export const sponsorOf = (player: { sponsor?: string } | null | undefined): Sponsor | null =>
  player?.sponsor && player.sponsor in SPONSORS ? SPONSORS[player.sponsor as SponsorId] : null;
