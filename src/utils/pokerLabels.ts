import type { HandPhase, PokerCard, Rank, Suit } from '../../shared/types.ts';

export const SUIT_META: Record<
  Suit,
  {
    symbol: string;
    labelDe: string;
    isRed: boolean;
    hex: string;
    border: string;
    glow: string;
    tint: string;
    text: string;
  }
> = {
  spades: {
    symbol: '♠',
    labelDe: 'Pik',
    isRed: false,
    hex: '#E4E4E7',
    border: 'rgba(255, 255, 255, 0.24)',
    glow: 'rgba(255, 255, 255, 0.08)',
    tint: 'rgba(255, 255, 255, 0.04)',
    text: '#F4F4F5',
  },
  clubs: {
    symbol: '♣',
    labelDe: 'Kreuz',
    isRed: false,
    hex: '#E4E4E7',
    border: 'rgba(255, 255, 255, 0.24)',
    glow: 'rgba(255, 255, 255, 0.08)',
    tint: 'rgba(255, 255, 255, 0.04)',
    text: '#F4F4F5',
  },
  hearts: {
    symbol: '♥',
    labelDe: 'Herz',
    isRed: true,
    hex: '#EF4444',
    border: 'rgba(239, 68, 68, 0.45)',
    glow: 'rgba(239, 68, 68, 0.14)',
    tint: 'rgba(239, 68, 68, 0.08)',
    text: '#F87171',
  },
  diamonds: {
    symbol: '♦',
    labelDe: 'Karo',
    isRed: true,
    hex: '#EF4444',
    border: 'rgba(239, 68, 68, 0.45)',
    glow: 'rgba(239, 68, 68, 0.14)',
    tint: 'rgba(239, 68, 68, 0.08)',
    text: '#F87171',
  },
};

export function getRankLabel(rank: Rank): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'D';
    case 11:
      return 'B';
    default:
      return String(rank);
  }
}

export function getRankDisplayLabel(rank: Rank): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    default:
      return String(rank);
  }
}

export function getCardDescriptionDe(card: PokerCard): string {
  const rankName = (() => {
    switch (card.rank) {
      case 14:
        return 'Ass';
      case 13:
        return 'König';
      case 12:
        return 'Dame';
      case 11:
        return 'Bube';
      default:
        return String(card.rank);
    }
  })();
  return `${SUIT_META[card.suit].labelDe} ${rankName}`;
}

export function formatMoney(amount: number): string {
  return `${Math.round(amount).toLocaleString('de-DE')} $`;
}

export function getHandPhaseLabelDe(phase: HandPhase | null): string {
  switch (phase) {
    case 'preflop':
      return 'Preflop';
    case 'flop':
      return 'Flop';
    case 'turn':
      return 'Turn';
    case 'river':
      return 'River';
    case 'all_in_runout':
      return 'All-In Runout';
    case 'hand_over':
      return 'Showdown';
    default:
      return '';
  }
}

export const STARTING_STACK_PRESETS = [500, 1000, 2500, 5000, 10000] as const;

export const HAND_RANKINGS_GUIDE = [
  { rank: '1', name: 'Royal Flush', example: 'A K Q J 10 gleiche Farbe' },
  { rank: '2', name: 'Straight Flush', example: '5 aufeinanderfolgende gleicher Farbe' },
  { rank: '3', name: 'Vierling', example: '4 Karten gleichen Werts' },
  { rank: '4', name: 'Full House', example: 'Drilling + Paar' },
  { rank: '5', name: 'Flush', example: '5 Karten derselben Farbe' },
  { rank: '6', name: 'Straße', example: '5 aufeinanderfolgende Werte' },
  { rank: '7', name: 'Drilling', example: '3 Karten gleichen Werts' },
  { rank: '8', name: 'Zwei Paare', example: '2 verschiedene Paare' },
  { rank: '9', name: 'Paar', example: '2 Karten gleichen Werts' },
  { rank: '10', name: 'High Card', example: 'Höchste Einzelkarte zählt' },
] as const;

