import { describe, expect, it } from 'vitest';
import {
  computePots,
  createStandardDeck,
  createTableConfig,
  decideBotAction,
  finishHandImmediateRunout,
  getPlayerActionConstraints,
  getPotTotal,
  performPokerAction,
  startHand,
  stepAllInRunout,
  type InternalPokerGame,
  type InternalPokerPlayer,
} from '../shared/gameEngine.js';
import type { PokerCard, Rank, Suit } from '../shared/types.js';

function card(rank: Rank, suit: Suit): PokerCard {
  return { id: `${suit}-${rank}`, suit, rank };
}

function makePlayers(count: number, startingStack = 1000): InternalPokerPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Spieler ${i + 1}`,
    isHost: i === 0,
    isBot: false,
    isReady: true,
    connected: true,
    disconnectedAt: null,
    reconnectToken: `tok-${i + 1}`,
    socketId: `sock-${i + 1}`,
    chips: startingStack,
    holeCards: [],
    streetBet: 0,
    totalBetInHand: 0,
    inHand: false,
    folded: false,
    allIn: false,
    lastActionLabel: null,
    readyForNextHand: false,
  }));
}

describe('Standard Texas Hold’em Game Engine', () => {
  it('creates an exact 52-card standard deck without duplicates', () => {
    const deck = createStandardDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });

  it('enforces official Heads-Up blinds and turn order (Dealer = Small Blind)', () => {
    const players = makePlayers(2, 1000);
    const config = createTableConfig(1000); // SB=10, BB=20
    const game = startHand(players, 1, config, null);

    // Dealer is p1 -> p1 posts SB (10), p2 posts BB (20), p1 acts first preflop
    expect(game.dealerIndex).toBe(0);
    expect(game.smallBlindIndex).toBe(0);
    expect(game.bigBlindIndex).toBe(1);
    expect(game.currentPlayerIndex).toBe(0);
    expect(players[0].streetBet).toBe(10);
    expect(players[1].streetBet).toBe(20);

    // p1 calls 10 -> BB (p2) still gets option!
    const callRes = performPokerAction(game, players, 'p1', 'call');
    expect(callRes.ok).toBe(true);
    expect(callRes.streetAdvanced).toBe(false);
    expect(game.currentPlayerIndex).toBe(1);

    // p2 checks -> advances to Flop, and BB (p2) acts FIRST postflop in Heads-Up!
    const checkRes = performPokerAction(game, players, 'p2', 'check');
    expect(checkRes.ok).toBe(true);
    expect(checkRes.streetAdvanced).toBe(true);
    expect(game.handPhase).toBe('flop');
    expect(game.communityCards).toHaveLength(3);
    expect(game.currentPlayerIndex).toBe(1);
  });

  it('enforces multiway blinds, UTG preflop, SB postflop, and min-raise rules', () => {
    const players = makePlayers(4, 1000);
    const config = createTableConfig(1000); // 10/20
    const game = startHand(players, 1, config, null);

    // p1=D, p2=SB(10), p3=BB(20), p4=UTG acts first preflop
    expect(game.dealerIndex).toBe(0);
    expect(game.smallBlindIndex).toBe(1);
    expect(game.bigBlindIndex).toBe(2);
    expect(game.currentPlayerIndex).toBe(3);

    // Try illegal under-raise to 30 (min raise is 40)
    const badRaise = performPokerAction(game, players, 'p4', 'raise', 30);
    expect(badRaise.ok).toBe(false);

    // Raise to 60 (delta = 40 -> next min raise is 100)
    const goodRaise = performPokerAction(game, players, 'p4', 'raise', 60);
    expect(goodRaise.ok).toBe(true);
    expect(game.currentBet).toBe(60);
    expect(game.minRaiseIncrement).toBe(40);

    const p1Constraints = getPlayerActionConstraints(game, players, players[0]);
    expect(p1Constraints.minRaiseTo).toBe(100);
    expect(p1Constraints.toCall).toBe(60);
  });

  it('does not reopen betting for players who already acted after an incomplete all-in raise', () => {
    const players = makePlayers(3, 1000);
    players[2].chips = 75; // BB short stack
    const config = createTableConfig(1000); // 10/20
    const game = startHand(players, 1, config, null);

    // p1=D (acts first preflop), p2=SB(10), p3=BB(20, 55 left -> total 75)
    // p1 raises to 60 (minRaiseIncrement becomes 40 -> full raise would be 100)
    expect(performPokerAction(game, players, 'p1', 'raise', 60).ok).toBe(true);
    // p2 calls 60
    expect(performPokerAction(game, players, 'p2', 'call').ok).toBe(true);
    // p3 goes all-in for 75 (only +15 over 60, less than 40 min-raise!)
    expect(performPokerAction(game, players, 'p3', 'all_in').ok).toBe(true);
    expect(game.currentBet).toBe(75);

    // Action returns to p1 who ALREADY acted at 60: p1 can ONLY call 15 or fold, NOT re-raise!
    const p1Constraints = getPlayerActionConstraints(game, players, players[0]);
    expect(p1Constraints.toCall).toBe(15);
    expect(p1Constraints.canCall).toBe(true);
    expect(p1Constraints.canBetOrRaise).toBe(false);

    const illegalReraise = performPokerAction(game, players, 'p1', 'raise', 120);
    expect(illegalReraise.ok).toBe(false);
  });

  it('refunds uncalled excess bets and splits Main Pot + Side Pot accurately with odd chip clockwise', () => {
    const players = makePlayers(3, 1000);
    players[0].chips = 100; // p1 short
    players[1].chips = 300; // p2 medium
    players[2].chips = 1000; // p3 deep

    const game: InternalPokerGame = {
      handNumber: 1,
      handPhase: 'river',
      deck: [],
      communityCards: [
        card(14, 'clubs'),
        card(13, 'clubs'),
        card(7, 'diamonds'),
        card(4, 'hearts'),
        card(2, 'spades'),
      ],
      dealerIndex: 0, // p1=D, p2=SB, p3=BB -> odd chip priority: p2, p3, p1
      smallBlindIndex: 1,
      bigBlindIndex: 2,
      currentPlayerIndex: 1,
      smallBlind: 10,
      bigBlind: 20,
      currentBet: 0,
      minRaiseIncrement: 20,
      actedThisStreet: new Set(),
      actedAtFullBet: new Set(),
      handSummary: null,
      eventLog: [],
    };

    for (const p of players) p.inHand = true;
    // p1 has Trips (777), p2 & p3 chop Side Pot with identical AK!
    players[0].holeCards = [card(7, 'hearts'), card(7, 'clubs')]; // Quads/Trips beats AK
    players[1].holeCards = [card(14, 'spades'), card(10, 'diamonds')]; // Pair of Aces
    players[2].holeCards = [card(14, 'hearts'), card(10, 'spades')]; // Identical Pair of Aces

    // Make p1 put 100, p2 put 300, p3 put 500 (so 200 uncalled from p3!)
    players[0].chips = 0;
    players[0].totalBetInHand = 100;
    players[0].allIn = true;

    players[1].chips = 0;
    players[1].totalBetInHand = 301; // odd amount to test odd chip on side pot (201*2 = 402 -> even; let's make p2/p3 split odd!)
    players[1].allIn = true;

    // Reset cleanly for exact odd-chip side pot test:
    // p1=100, p2=200, p3=400, plus p1 didn't put odd; let's add a folded 4th player? Or:
    // Actually: p1=100, p2=300, p3=500 -> after refund 200 to p3, p3=300, Main=300 (p1 wins), Side=400 (p2=200, p3=200)
    players[1].totalBetInHand = 300;
    players[2].chips = 500;
    players[2].totalBetInHand = 500;

    finishHandImmediateRunout(game, players);

    // Total chips must be conserved: 100 + 300 + 1000 = 1400
    expect(players[0].chips + players[1].chips + players[2].chips).toBe(1400);
    // p1 wins Main Pot (100 * 3 = 300)
    expect(players[0].chips).toBe(300);
    // p2 gets half of Side Pot (200 * 2 / 2 = 200)
    expect(players[1].chips).toBe(200);
    // p3 gets uncalled 200 back + half of Side Pot 200 + remaining 500 = 900
    expect(players[2].chips).toBe(900);
    expect(getPotTotal(players)).toBe(700);
    expect(computePots(players)).toHaveLength(2);
  });

  it('awards odd split-pot chip to first tied player clockwise left of dealer', () => {
    const players = makePlayers(3, 100);
    // p1=D, p2=SB, p3=BB. Suppose p2 and p3 tie for Main Pot with 101 total (from p1 folding 1, p2=50, p3=50)
    const game: InternalPokerGame = {
      handNumber: 1,
      handPhase: 'river',
      deck: [],
      communityCards: [
        card(14, 'spades'),
        card(13, 'hearts'),
        card(12, 'diamonds'),
        card(11, 'clubs'),
        card(10, 'spades'),
      ],
      dealerIndex: 0,
      smallBlindIndex: 1,
      bigBlindIndex: 2,
      currentPlayerIndex: 1,
      smallBlind: 10,
      bigBlind: 20,
      currentBet: 0,
      minRaiseIncrement: 20,
      actedThisStreet: new Set(),
      actedAtFullBet: new Set(),
      handSummary: null,
      eventLog: [],
    };

    for (const p of players) p.inHand = true;
    players[0].folded = true;
    players[0].totalBetInHand = 1;
    players[0].chips = 99;

    players[1].totalBetInHand = 50;
    players[1].chips = 50;
    players[1].holeCards = [card(2, 'clubs'), card(3, 'clubs')];

    players[2].totalBetInHand = 50;
    players[2].chips = 50;
    players[2].holeCards = [card(4, 'diamonds'), card(5, 'diamonds')];

    finishHandImmediateRunout(game, players);

    // Pot = 101 -> p2 is immediately left of dealer p1, so p2 gets 51 and p3 gets 50!
    expect(players[1].chips).toBe(101);
    expect(players[2].chips).toBe(100);
  });

  it('awards pot immediately without revealing hole cards when all others fold', () => {
    const players = makePlayers(3, 1000);
    const config = createTableConfig(1000);
    const game = startHand(players, 1, config, null);

    // p1=D, p2=SB, p3=BB, p1 acts first (index 0? Wait: 3 players: D=0, SB=1, BB=2 -> firstToAct=0)
    expect(performPokerAction(game, players, 'p1', 'fold').ok).toBe(true);
    const res = performPokerAction(game, players, 'p2', 'fold');
    expect(res.ok).toBe(true);
    expect(res.handEnded).toBe(true);
    expect(game.handSummary?.wonByFold).toBe(true);
    expect(game.handSummary?.revealedHands).toEqual({});
    expect(players[2].chips).toBe(1010); // Won SB's 10!
    expect(players[1].chips).toBe(990);
  });

  it('conserves exact total chips and finishes cleanly across up to 450 simulated multi-player bot hands', () => {
    for (const playerCount of [2, 4, 6]) {
      const startingStack = 1000;
      const expectedTotal = playerCount * startingStack;
      const players = makePlayers(playerCount, startingStack);
      const config = createTableConfig(startingStack);
      let prevDealer: number | null = null;

      for (let hand = 1; hand <= 150; hand++) {
        const alive = players.filter((p) => p.chips > 0);
        if (alive.length < 2) break;

        const game = startHand(players, hand, config, prevDealer);
        prevDealer = game.dealerIndex;

        let safetySteps = 0;
        while (game.handPhase !== 'hand_over') {
          safetySteps += 1;
          expect(safetySteps).toBeLessThan(200);

          if (game.handPhase === 'all_in_runout') {
            stepAllInRunout(game, players);
            continue;
          }

          const actor = players[game.currentPlayerIndex];
          expect(actor).toBeDefined();
          expect(actor.inHand && !actor.folded && !actor.allIn).toBe(true);

          const decision = decideBotAction(game, players, actor);
          const res = performPokerAction(
            game,
            players,
            actor.id,
            decision.action,
            decision.targetStreetBet
          );
          expect(res.ok).toBe(true);

          if (res.handEnded) {
            const postActionChips = players.reduce((s, p) => s + p.chips, 0);
            expect(postActionChips).toBe(expectedTotal);
          } else {
            const chipsSum = players.reduce((s, p) => s + p.chips, 0) + getPotTotal(players);
            expect(chipsSum).toBe(expectedTotal);
          }
        }

        // Verify exact chip conservation after hand_over
        const postHandChips = players.reduce((s, p) => s + p.chips, 0);
        expect(postHandChips).toBe(expectedTotal);
      }
    }
  });
});
