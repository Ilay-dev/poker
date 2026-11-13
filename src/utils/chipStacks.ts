export type ChipTone = 'ivory' | 'crimson' | 'slate' | 'obsidian';

export interface ChipStackColumn {
  denomination: number;
  count: number;
  visualCount: number;
  tone: ChipTone;
  label: string;
}

const MAX_VISUAL_CHIPS_PER_STACK = 9;

interface DenomSpec {
  value: number;
  tone: ChipTone;
  label: string;
}

const DENOM_LADDER: DenomSpec[] = [
  { value: 1, tone: 'ivory', label: '1' },
  { value: 5, tone: 'crimson', label: '5' },
  { value: 25, tone: 'slate', label: '25' },
  { value: 100, tone: 'obsidian', label: '100' },
  { value: 500, tone: 'ivory', label: '500' },
  { value: 1000, tone: 'crimson', label: '1K' },
  { value: 5000, tone: 'slate', label: '5K' },
  { value: 25000, tone: 'obsidian', label: '25K' },
  { value: 100000, tone: 'ivory', label: '100K' },
];

/**
 * Picks a 4-denomination window aligned with the table scale and ensures the smallest
 * selected denomination divides `chips` cleanly when non-integer remainders occur.
 */
function selectDenomWindow(chips: number, startingStack: number): DenomSpec[] {
  const ref = Math.max(chips, startingStack, 100);
  const maxTopDenom = Math.max(100, Math.floor(ref * 0.6));

  let topIdx = 3; // Default top = 100 -> window [100, 25, 5, 1]
  for (let i = 3; i < DENOM_LADDER.length; i++) {
    if (DENOM_LADDER[i].value <= maxTopDenom) {
      topIdx = i;
    }
  }

  // Step the window down if the smallest denomination in this window does not divide `chips`
  while (topIdx > 3 && chips % DENOM_LADDER[topIdx - 3].value !== 0) {
    topIdx -= 1;
  }

  return [
    DENOM_LADDER[topIdx],
    DENOM_LADDER[topIdx - 1],
    DENOM_LADDER[topIdx - 2],
    DENOM_LADDER[topIdx - 3],
  ];
}

/**
 * Breaks a player's chip balance down into realistic poker chip stacks
 * ordered from highest denomination (left) to lowest denomination (right).
 */
export function pickPokerStacks(chips: number, startingStack: number): ChipStackColumn[] {
  const cleanChips = Math.max(0, Math.floor(chips));
  if (cleanChips === 0) return [];

  const window = selectDenomWindow(cleanChips, startingStack);
  const counts = [0, 0, 0, 0];

  let remaining = cleanChips;
  for (let i = 0; i < 4; i++) {
    counts[i] = Math.floor(remaining / window[i].value);
    remaining %= window[i].value;
  }

  // Cascade one chip from larger stacks down into smaller denominations so stacks stay balanced
  const minDesired = [0, 3, 4, 4];
  for (let i = 0; i < 3; i++) {
    if (counts[i] >= 2 && counts[i + 1] < minDesired[i + 1]) {
      const ratio = Math.floor(window[i].value / window[i + 1].value);
      if (ratio > 1) {
        counts[i] -= 1;
        counts[i + 1] += ratio;
      }
    }
  }

  const columns: ChipStackColumn[] = [];
  for (let i = 0; i < 4; i++) {
    if (counts[i] > 0) {
      columns.push({
        denomination: window[i].value,
        count: counts[i],
        visualCount: Math.min(MAX_VISUAL_CHIPS_PER_STACK, counts[i]),
        tone: window[i].tone,
        label: window[i].label,
      });
    }
  }

  return columns;
}
