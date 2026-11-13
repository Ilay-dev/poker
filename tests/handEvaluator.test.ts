import { describe, expect, it } from 'vitest';
import {
  compareEvaluatedHands,
  evaluateBestHand,
  evaluateFiveCards,
} from '../shared/handEvaluator.js';
import type { PokerCard, Rank, Suit } from '../shared/types.js';

function c(rank: Rank, suit: Suit): PokerCard {
  return { id: `${suit}-${rank}`, suit, rank };
}

describe('Texas Hold’em Hand Evaluator', () => {
  it('recognizes all 10 standard poker hand categories in correct hierarchy', () => {
    const royal = evaluateFiveCards([
      c(14, 'spades'),
      c(13, 'spades'),
      c(12, 'spades'),
      c(11, 'spades'),
      c(10, 'spades'),
    ]);
    const straightFlush = evaluateFiveCards([
      c(9, 'hearts'),
      c(8, 'hearts'),
      c(7, 'hearts'),
      c(6, 'hearts'),
      c(5, 'hearts'),
    ]);
    const quads = evaluateFiveCards([
      c(13, 'spades'),
      c(13, 'hearts'),
      c(13, 'diamonds'),
      c(13, 'clubs'),
      c(4, 'spades'),
    ]);
    const fullHouse = evaluateFiveCards([
      c(12, 'spades'),
      c(12, 'hearts'),
      c(12, 'diamonds'),
      c(7, 'clubs'),
      c(7, 'spades'),
    ]);
    const flush = evaluateFiveCards([
      c(14, 'clubs'),
      c(11, 'clubs'),
      c(9, 'clubs'),
      c(5, 'clubs'),
      c(2, 'clubs'),
    ]);
    const straight = evaluateFiveCards([
      c(10, 'spades'),
      c(9, 'hearts'),
      c(8, 'diamonds'),
      c(7, 'clubs'),
      c(6, 'spades'),
    ]);
    const trips = evaluateFiveCards([
      c(8, 'spades'),
      c(8, 'hearts'),
      c(8, 'diamonds'),
      c(14, 'clubs'),
      c(3, 'spades'),
    ]);
    const twoPair = evaluateFiveCards([
      c(11, 'spades'),
      c(11, 'hearts'),
      c(5, 'diamonds'),
      c(5, 'clubs'),
      c(13, 'spades'),
    ]);
    const onePair = evaluateFiveCards([
      c(14, 'spades'),
      c(14, 'hearts'),
      c(10, 'diamonds'),
      c(6, 'clubs'),
      c(2, 'spades'),
    ]);
    const highCard = evaluateFiveCards([
      c(14, 'spades'),
      c(12, 'hearts'),
      c(9, 'diamonds'),
      c(6, 'clubs'),
      c(3, 'spades'),
    ]);

    const ordered = [
      royal,
      straightFlush,
      quads,
      fullHouse,
      flush,
      straight,
      trips,
      twoPair,
      onePair,
      highCard,
    ];

    expect(ordered.map((h) => h.category)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareEvaluatedHands(ordered[i], ordered[i + 1])).toBeGreaterThan(0);
    }
  });

  it('handles Ace-low wheel straight (A-2-3-4-5) properly below 6-high straight', () => {
    const wheel = evaluateFiveCards([
      c(14, 'spades'),
      c(2, 'hearts'),
      c(3, 'diamonds'),
      c(4, 'clubs'),
      c(5, 'spades'),
    ]);
    const sixHigh = evaluateFiveCards([
      c(6, 'spades'),
      c(2, 'hearts'),
      c(3, 'diamonds'),
      c(4, 'clubs'),
      c(5, 'hearts'),
    ]);

    expect(wheel.category).toBe(4);
    expect(wheel.tiebreakers).toEqual([5]);
    expect(compareEvaluatedHands(sixHigh, wheel)).toBeGreaterThan(0);
  });

  it('picks the best 5 out of 7 cards and resolves kickers accurately', () => {
    const board = [
      c(14, 'hearts'),
      c(14, 'diamonds'),
      c(10, 'clubs'),
      c(7, 'spades'),
      c(2, 'hearts'),
    ];

    const playerWithKing = evaluateBestHand([c(13, 'spades'), c(4, 'clubs'), ...board])!;
    const playerWithQueen = evaluateBestHand([c(12, 'spades'), c(9, 'clubs'), ...board])!;

    expect(playerWithKing.category).toBe(1);
    expect(playerWithQueen.category).toBe(1);
    expect(compareEvaluatedHands(playerWithKing, playerWithQueen)).toBeGreaterThan(0);

    // Split pot when board plays (counterfeited hole kickers)
    const highBoard = [
      c(14, 'spades'),
      c(13, 'hearts'),
      c(12, 'diamonds'),
      c(11, 'clubs'),
      c(10, 'spades'),
    ];
    const p1 = evaluateBestHand([c(2, 'clubs'), c(3, 'diamonds'), ...highBoard])!;
    const p2 = evaluateBestHand([c(4, 'hearts'), c(5, 'clubs'), ...highBoard])!;
    expect(compareEvaluatedHands(p1, p2)).toBe(0);
  });
});

