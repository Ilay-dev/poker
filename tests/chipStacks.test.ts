import { describe, expect, it } from 'vitest';
import { pickPokerStacks } from '../src/utils/chipStacks.ts';

describe('pickPokerStacks', () => {
  it('returns an empty list for zero or negative balances', () => {
    expect(pickPokerStacks(0, 1000)).toEqual([]);
    expect(pickPokerStacks(-50, 1000)).toEqual([]);
  });

  it('produces exact total value with multiple balanced stacks for a standard starting stack', () => {
    const stacks = pickPokerStacks(1000, 1000);
    const total = stacks.reduce((sum, s) => sum + s.count * s.denomination, 0);
    expect(total).toBe(1000);
    expect(stacks.length).toBeGreaterThanOrEqual(3);
    expect(stacks.every((s) => s.visualCount >= 1 && s.visualCount <= 9)).toBe(true);
  });

  it('handles non-divisible chip counts without losing remainder value', () => {
    const stacks = pickPokerStacks(1003, 1000);
    const total = stacks.reduce((sum, s) => sum + s.count * s.denomination, 0);
    expect(total).toBe(1003);
  });

  it('scales cleanly up to high-roller stacks and caps visual chip height per stack', () => {
    const stacks = pickPokerStacks(1250000, 100000);
    const total = stacks.reduce((sum, s) => sum + s.count * s.denomination, 0);
    expect(total).toBe(1250000);
    expect(stacks.every((s) => s.visualCount <= 9)).toBe(true);
  });

  it('assigns distinct adjacent tones across every stack column', () => {
    const stacks = pickPokerStacks(2450, 1000);
    for (let i = 1; i < stacks.length; i++) {
      expect(stacks[i].tone).not.toBe(stacks[i - 1].tone);
    }
  });
});
