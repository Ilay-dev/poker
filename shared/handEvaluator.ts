import type { EvaluatedHand, HandCategory, PokerCard } from './types.js';

function rankSingularDe(rank: number): string {
  switch (rank) {
    case 14:
      return 'Ass';
    case 13:
      return 'König';
    case 12:
      return 'Dame';
    case 11:
      return 'Bube';
    default:
      return String(rank);
  }
}

function rankPluralDe(rank: number): string {
  switch (rank) {
    case 14:
      return 'Asse';
    case 13:
      return 'Könige';
    case 12:
      return 'Damen';
    case 11:
      return 'Buben';
    default:
      return `${rank}er`;
  }
}

export function compareEvaluatedHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) {
    return a.category - b.category;
  }
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function evaluateFiveCards(cards: readonly PokerCard[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error(`Expected 5 cards, received ${cards.length}`);
  }

  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  const countMap = new Map<number, number>();
  for (const r of ranks) {
    countMap.set(r, (countMap.get(r) ?? 0) + 1);
  }

  const groups = [...countMap.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  let straightHigh: number | null = null;
  if (groups.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      straightHigh = ranks[0];
    } else if (
      ranks[0] === 14 &&
      ranks[1] === 5 &&
      ranks[2] === 4 &&
      ranks[3] === 3 &&
      ranks[4] === 2
    ) {
      straightHigh = 5;
    }
  }

  const bestFiveIds = sorted.map((c) => c.id);

  let category: HandCategory;
  let tiebreakers: number[];
  let shortLabelDe: string;
  let labelDe: string;

  if (isFlush && straightHigh !== null) {
    if (straightHigh === 14) {
      category = 9;
      tiebreakers = [14];
      shortLabelDe = 'Royal Flush';
      labelDe = 'Royal Flush';
    } else {
      category = 8;
      tiebreakers = [straightHigh];
      shortLabelDe = 'Straight Flush';
      labelDe = `Straight Flush (${rankSingularDe(straightHigh)} hoch)`;
    }
  } else if (groups[0][1] === 4) {
    category = 7;
    const quad = groups[0][0];
    const kicker = groups[1][0];
    tiebreakers = [quad, kicker];
    shortLabelDe = 'Vierling';
    labelDe = `Vierling (${rankPluralDe(quad)})`;
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    const trips = groups[0][0];
    const pair = groups[1][0];
    tiebreakers = [trips, pair];
    shortLabelDe = 'Full House';
    labelDe = `Full House (${rankPluralDe(trips)} über ${rankPluralDe(pair)})`;
  } else if (isFlush) {
    category = 5;
    tiebreakers = ranks;
    shortLabelDe = 'Flush';
    labelDe = `Flush (${rankSingularDe(ranks[0])} hoch)`;
  } else if (straightHigh !== null) {
    category = 4;
    tiebreakers = [straightHigh];
    shortLabelDe = 'Straße';
    labelDe = `Straße (${rankSingularDe(straightHigh)} hoch)`;
  } else if (groups[0][1] === 3) {
    category = 3;
    const trips = groups[0][0];
    tiebreakers = [trips, groups[1][0], groups[2][0]];
    shortLabelDe = 'Drilling';
    labelDe = `Drilling (${rankPluralDe(trips)})`;
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    const highPair = groups[0][0];
    const lowPair = groups[1][0];
    const kicker = groups[2][0];
    tiebreakers = [highPair, lowPair, kicker];
    shortLabelDe = 'Zwei Paare';
    labelDe = `Zwei Paare (${rankPluralDe(highPair)} & ${rankPluralDe(lowPair)})`;
  } else if (groups[0][1] === 2) {
    category = 1;
    const pair = groups[0][0];
    tiebreakers = [pair, groups[1][0], groups[2][0], groups[3][0]];
    shortLabelDe = 'Paar';
    labelDe = `Paar (${rankPluralDe(pair)})`;
  } else {
    category = 0;
    tiebreakers = ranks;
    shortLabelDe = 'High Card';
    labelDe = `High Card (${rankSingularDe(ranks[0])})`;
  }

  return {
    category,
    tiebreakers,
    shortLabelDe,
    labelDe,
    bestFiveIds,
  };
}

export function evaluateBestHand(cards: readonly PokerCard[]): EvaluatedHand | null {
  if (cards.length < 2) return null;

  if (cards.length < 5) {
    // Preflop live helper for 2 hole cards
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    if (sorted[0].rank === sorted[1].rank) {
      return {
        category: 1,
        tiebreakers: [sorted[0].rank],
        shortLabelDe: 'Pocket Paar',
        labelDe: `Pocket ${rankPluralDe(sorted[0].rank)}`,
        bestFiveIds: sorted.map((c) => c.id),
      };
    }
    return {
      category: 0,
      tiebreakers: sorted.map((c) => c.rank),
      shortLabelDe: 'High Card',
      labelDe: `High Card (${rankSingularDe(sorted[0].rank)})`,
      bestFiveIds: [sorted[0].id],
    };
  }

  let best: EvaluatedHand | null = null;
  const n = cards.length;

  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const candidate = evaluateFiveCards([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best || compareEvaluatedHands(candidate, best) > 0) {
              best = candidate;
            }
          }
        }
      }
    }
  }

  return best;
}

