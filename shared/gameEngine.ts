import { compareEvaluatedHands, evaluateBestHand } from './handEvaluator.js';
import type {
  EvaluatedHand,
  GameEvent,
  HandPhase,
  HandSummary,
  MatchStanding,
  MatchSummary,
  PlayerActionType,
  PokerCard,
  PotInfo,
  PotWinnerResult,
  Rank,
  RevealedPlayerHand,
  Suit,
  TableConfig,
} from './types.js';

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export const MIN_STARTING_STACK = 100;
export const MAX_STARTING_STACK = 1_000_000;
export const DEFAULT_STARTING_STACK = 1000;

export interface InternalPokerPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  reconnectToken: string;
  socketId: string | null;
  chips: number;
  holeCards: PokerCard[];
  streetBet: number;
  totalBetInHand: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  lastActionLabel: string | null;
  readyForNextHand: boolean;
}

export interface InternalPokerGame {
  handNumber: number;
  handPhase: HandPhase;
  deck: PokerCard[];
  communityCards: PokerCard[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayerIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaiseIncrement: number;
  actedThisStreet: Set<string>;
  actedAtFullBet: Set<string>;
  handSummary: HandSummary | null;
  eventLog: GameEvent[];
}

export interface PlayerActionConstraints {
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canBetOrRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface PokerActionResult {
  ok: boolean;
  error?: string;
  handEnded?: boolean;
  enteredRunout?: boolean;
  streetAdvanced?: boolean;
}

export function secureRandomInt(min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return min;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    const maxValid = Math.floor(0xffffffff / range) * range;
    let rand = 0;
    do {
      cryptoObj.getRandomValues(buf);
      rand = buf[0];
    } while (rand >= maxValid);
    return min + (rand % range);
  }
  return min + Math.floor(Math.random() * range);
}

export function clampStartingStack(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_STARTING_STACK;
  const rounded = Math.round(raw);
  return Math.max(MIN_STARTING_STACK, Math.min(MAX_STARTING_STACK, rounded));
}

export function deriveBlindsFromStack(startingStack: number): {
  smallBlind: number;
  bigBlind: number;
} {
  const cleanStack = clampStartingStack(startingStack);
  const smallBlind = Math.max(1, Math.round(cleanStack / 100));
  return {
    smallBlind,
    bigBlind: smallBlind * 2,
  };
}

export function createTableConfig(
  startingStack: number,
  customSmallBlind?: number
): TableConfig {
  const cleanStack = clampStartingStack(startingStack);
  if (
    typeof customSmallBlind === 'number' &&
    Number.isFinite(customSmallBlind) &&
    customSmallBlind >= 1 &&
    customSmallBlind * 2 <= cleanStack
  ) {
    const sb = Math.round(customSmallBlind);
    return {
      startingStack: cleanStack,
      smallBlind: sb,
      bigBlind: sb * 2,
    };
  }
  const derived = deriveBlindsFromStack(cleanStack);
  return {
    startingStack: cleanStack,
    smallBlind: derived.smallBlind,
    bigBlind: derived.bigBlind,
  };
}

export function createStandardDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
      });
    }
  }
  return deck;
}

export function shuffleCards<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function formatChipsDe(amount: number): string {
  return `${Math.round(amount).toLocaleString('de-DE')} $`;
}

export function pushEvent(game: InternalPokerGame, message: string): void {
  const evt: GameEvent = {
    id: `${Date.now()}-${secureRandomInt(1000, 9999)}`,
    message,
    timestamp: Date.now(),
  };
  game.eventLog.unshift(evt);
  if (game.eventLog.length > 30) {
    game.eventLog.length = 30;
  }
}

export function findNextIndexMatching(
  players: readonly InternalPokerPlayer[],
  fromIndex: number,
  predicate: (player: InternalPokerPlayer, index: number) => boolean
): number {
  const n = players.length;
  if (n === 0) return -1;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIndex + offset) % n;
    if (predicate(players[idx], idx)) {
      return idx;
    }
  }
  return -1;
}

export function getPotTotal(players: readonly InternalPokerPlayer[]): number {
  let sum = 0;
  for (const p of players) {
    sum += p.totalBetInHand;
  }
  return sum;
}

export function computePots(players: readonly InternalPokerPlayer[]): PotInfo[] {
  const contributors = players.filter((p) => p.totalBetInHand > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((p) => p.totalBetInHand))].sort((a, b) => a - b);
  const rawPots: { amount: number; eligiblePlayerIds: string[] }[] = [];

  let prevLevel = 0;
  for (const level of levels) {
    const sliceHeight = level - prevLevel;
    if (sliceHeight <= 0) continue;

    let sliceAmount = 0;
    const eligiblePlayerIds: string[] = [];

    for (const p of contributors) {
      if (p.totalBetInHand > prevLevel) {
        sliceAmount += Math.min(p.totalBetInHand, level) - prevLevel;
      }
      if (p.inHand && !p.folded && p.totalBetInHand >= level) {
        eligiblePlayerIds.push(p.id);
      }
    }

    if (sliceAmount > 0) {
      if (eligiblePlayerIds.length === 0 && rawPots.length > 0) {
        rawPots[rawPots.length - 1].amount += sliceAmount;
      } else {
        const last = rawPots[rawPots.length - 1];
        if (
          last &&
          last.eligiblePlayerIds.length === eligiblePlayerIds.length &&
          last.eligiblePlayerIds.every((id, i) => id === eligiblePlayerIds[i])
        ) {
          last.amount += sliceAmount;
        } else {
          rawPots.push({ amount: sliceAmount, eligiblePlayerIds });
        }
      }
    }

    prevLevel = level;
  }

  return rawPots.map((pot, idx) => ({
    label: idx === 0 ? 'Main Pot' : `Side Pot ${idx}`,
    amount: pot.amount,
    eligiblePlayerIds: pot.eligiblePlayerIds,
  }));
}

export function refundUncalledBet(
  players: InternalPokerPlayer[],
  game: InternalPokerGame
): number {
  const contenders = players.filter((p) => p.inHand);
  if (contenders.length < 2) return 0;

  const sorted = [...contenders].sort((a, b) => b.totalBetInHand - a.totalBetInHand);
  const leader = sorted[0];
  const secondHighest = sorted[1];

  if (leader.totalBetInHand > secondHighest.totalBetInHand) {
    const refund = leader.totalBetInHand - secondHighest.totalBetInHand;
    leader.chips += refund;
    leader.totalBetInHand -= refund;
    leader.streetBet = Math.max(0, leader.streetBet - refund);
    if (leader.chips > 0 && leader.allIn) {
      leader.allIn = false;
    }
    if (game.currentBet > leader.streetBet) {
      game.currentBet = leader.streetBet;
    }
    return refund;
  }

  return 0;
}

export function getPlayerActionConstraints(
  game: InternalPokerGame,
  players: readonly InternalPokerPlayer[],
  player: InternalPokerPlayer
): PlayerActionConstraints {
  const nonFoldedOthers = players.filter((p) => p.id !== player.id && p.inHand && !p.folded);
  const allOthersAllIn =
    nonFoldedOthers.length > 0 && nonFoldedOthers.every((p) => p.allIn);

  const maxOtherStreetCap =
    nonFoldedOthers.length > 0
      ? Math.max(...nonFoldedOthers.map((p) => p.streetBet + p.chips))
      : game.currentBet;

  const effectiveTargetBet = allOthersAllIn
    ? Math.min(game.currentBet, maxOtherStreetCap)
    : game.currentBet;

  const rawToCall = Math.max(0, effectiveTargetBet - player.streetBet);
  const toCall = Math.min(player.chips, rawToCall);

  const canCheck = toCall === 0;
  const canCall = toCall > 0;
  const maxRaiseTo = player.streetBet + player.chips;

  const hasChipsBeyondCall = player.chips > toCall;
  const canReopen = !game.actedAtFullBet.has(player.id);
  const canBetOrRaise = !allOthersAllIn && hasChipsBeyondCall && canReopen;

  const minFullRaiseTarget =
    game.currentBet === 0
      ? game.bigBlind
      : game.currentBet + Math.max(game.minRaiseIncrement, game.bigBlind);
  const minRaiseTo = Math.min(maxRaiseTo, minFullRaiseTarget);

  return {
    toCall,
    canCheck,
    canCall,
    canBetOrRaise,
    minRaiseTo,
    maxRaiseTo,
  };
}

export function startHand(
  players: InternalPokerPlayer[],
  handNumber: number,
  config: TableConfig,
  prevDealerIndex: number | null,
  prevEventLog: GameEvent[] = []
): InternalPokerGame {
  const activeIndices = players
    .map((p, idx) => (p.chips > 0 ? idx : -1))
    .filter((idx) => idx !== -1);

  if (activeIndices.length < 2) {
    throw new Error('Mindestens 2 Spieler mit Chips benötigt.');
  }

  for (const p of players) {
    p.holeCards = [];
    p.streetBet = 0;
    p.totalBetInHand = 0;
    p.folded = false;
    p.allIn = false;
    p.lastActionLabel = null;
    p.readyForNextHand = p.isBot;
    p.inHand = p.chips > 0;
  }

  const dealerIndex =
    prevDealerIndex === null
      ? activeIndices[0]
      : findNextIndexMatching(players, prevDealerIndex, (p) => p.inHand);

  const isHeadsUp = activeIndices.length === 2;
  const smallBlindIndex = isHeadsUp
    ? dealerIndex
    : findNextIndexMatching(players, dealerIndex, (p) => p.inHand);
  const bigBlindIndex = findNextIndexMatching(players, smallBlindIndex, (p) => p.inHand);
  const firstToAct = isHeadsUp
    ? smallBlindIndex
    : findNextIndexMatching(players, bigBlindIndex, (p) => p.inHand);

  const deck = shuffleCards(createStandardDeck());

  // Deal 2 hole cards clockwise starting left of dealer (SB in multiway, non-dealer in heads-up)
  const firstDealIndex = findNextIndexMatching(players, dealerIndex, (p) => p.inHand);
  for (let round = 0; round < 2; round++) {
    let idx = firstDealIndex;
    for (let count = 0; count < activeIndices.length; count++) {
      const card = deck.pop();
      if (card) players[idx].holeCards.push(card);
      idx = findNextIndexMatching(players, idx, (p) => p.inHand);
    }
  }

  const sbPlayer = players[smallBlindIndex];
  const sbPosted = Math.min(config.smallBlind, sbPlayer.chips);
  sbPlayer.chips -= sbPosted;
  sbPlayer.streetBet = sbPosted;
  sbPlayer.totalBetInHand = sbPosted;
  if (sbPlayer.chips === 0) sbPlayer.allIn = true;
  sbPlayer.lastActionLabel = sbPlayer.allIn ? `All-In ${sbPosted}` : `SB ${sbPosted}`;

  const bbPlayer = players[bigBlindIndex];
  const bbPosted = Math.min(config.bigBlind, bbPlayer.chips);
  bbPlayer.chips -= bbPosted;
  bbPlayer.streetBet = bbPosted;
  bbPlayer.totalBetInHand = bbPosted;
  if (bbPlayer.chips === 0) bbPlayer.allIn = true;
  bbPlayer.lastActionLabel = bbPlayer.allIn ? `All-In ${bbPosted}` : `BB ${bbPosted}`;

  const game: InternalPokerGame = {
    handNumber,
    handPhase: 'preflop',
    deck,
    communityCards: [],
    dealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    currentPlayerIndex: firstToAct,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    currentBet: Math.max(config.bigBlind, sbPosted, bbPosted),
    minRaiseIncrement: config.bigBlind,
    actedThisStreet: new Set<string>(),
    actedAtFullBet: new Set<string>(),
    handSummary: null,
    eventLog: prevEventLog.slice(0, 15),
  };

  pushEvent(
    game,
    `Hand #${handNumber} — Blinds ${formatChipsDe(config.smallBlind)} / ${formatChipsDe(config.bigBlind)}`
  );

  // Edge case: if blinds themselves put everyone (or all but one already ahead) all-in
  const nonFolded = players.filter((p) => p.inHand && !p.folded);
  const canActPlayers = nonFolded.filter((p) => !p.allIn);
  const maxAllInBet = Math.max(0, ...nonFolded.filter((p) => p.allIn).map((p) => p.streetBet));
  const immediateAllIn =
    canActPlayers.length === 0 ||
    (canActPlayers.length === 1 && canActPlayers[0].streetBet >= maxAllInBet);

  if (immediateAllIn) {
    refundUncalledBet(players, game);
    for (const p of players) p.streetBet = 0;
    game.currentBet = 0;
    game.currentPlayerIndex = -1;
    game.handPhase = 'all_in_runout';
    pushEvent(game, 'All-In durch Blinds — Karten werden aufgedeckt.');
  }

  return game;
}

function drawNextBoardCard(game: InternalPokerGame): void {
  const card = game.deck.pop();
  if (card) {
    game.communityCards.push(card);
  }
}

export function dealCommunityForNextStreet(game: InternalPokerGame): boolean {
  if (game.communityCards.length === 0) {
    // Burn 1 card then deal Flop (3)
    game.deck.pop();
    drawNextBoardCard(game);
    drawNextBoardCard(game);
    drawNextBoardCard(game);
    game.handPhase = 'flop';
    pushEvent(game, 'Flop aufgedeckt.');
    return true;
  }
  if (game.communityCards.length === 3) {
    // Burn 1 card then deal Turn (1)
    game.deck.pop();
    drawNextBoardCard(game);
    game.handPhase = 'turn';
    pushEvent(game, 'Turn aufgedeckt.');
    return true;
  }
  if (game.communityCards.length === 4) {
    // Burn 1 card then deal River (1)
    game.deck.pop();
    drawNextBoardCard(game);
    game.handPhase = 'river';
    pushEvent(game, 'River aufgedeckt.');
    return true;
  }
  return false;
}

export function stepAllInRunout(
  game: InternalPokerGame,
  players: InternalPokerPlayer[]
): { done: boolean } {
  if (game.communityCards.length < 5) {
    dealCommunityForNextStreet(game);
    if (game.communityCards.length < 5) {
      game.handPhase = 'all_in_runout';
      return { done: false };
    }
  }
  resolveShowdown(game, players);
  return { done: true };
}

export function finishHandImmediateRunout(
  game: InternalPokerGame,
  players: InternalPokerPlayer[]
): void {
  while (game.communityCards.length < 5) {
    dealCommunityForNextStreet(game);
  }
  resolveShowdown(game, players);
}

function awardPotByFold(game: InternalPokerGame, players: InternalPokerPlayer[]): void {
  refundUncalledBet(players, game);
  const nonFolded = players.filter((p) => p.inHand && !p.folded);
  const winner = nonFolded[0];
  const totalPot = getPotTotal(players);

  if (winner) {
    winner.chips += totalPot;
    pushEvent(game, `${winner.name} gewinnt ${formatChipsDe(totalPot)} (alle gepasst).`);
  }

  for (const p of players) {
    p.streetBet = 0;
  }

  game.handPhase = 'hand_over';
  game.currentPlayerIndex = -1;
  game.handSummary = {
    handNumber: game.handNumber,
    wonByFold: true,
    totalPot,
    potResults: winner
      ? [
          {
            potLabel: 'Main Pot',
            amount: totalPot,
            winnerIds: [winner.id],
            winningHandLabel: null,
            bestFiveIds: [],
          },
        ]
      : [],
    revealedHands: {},
    winnerIds: winner ? [winner.id] : [],
    winningCardIds: [],
  };
}

export function resolveShowdown(
  game: InternalPokerGame,
  players: InternalPokerPlayer[]
): void {
  refundUncalledBet(players, game);
  const pots = computePots(players);
  const totalPot = getPotTotal(players);

  const nonFolded = players.filter((p) => p.inHand && !p.folded);
  const revealedHands: Record<string, RevealedPlayerHand> = {};

  for (const p of nonFolded) {
    const evaluated = evaluateBestHand([...p.holeCards, ...game.communityCards]);
    revealedHands[p.id] = {
      cards: [...p.holeCards],
      evaluated,
    };
  }

  // Clockwise player order starting left of the dealer for odd-chip rule
  const clockwiseOrderIds: string[] = [];
  for (let offset = 1; offset <= players.length; offset++) {
    const idx = (game.dealerIndex + offset) % players.length;
    clockwiseOrderIds.push(players[idx].id);
  }

  const potResults: PotWinnerResult[] = [];
  const allWinnerIds = new Set<string>();
  const allWinningCardIds = new Set<string>();

  for (const pot of pots) {
    const eligible = pot.eligiblePlayerIds
      .map((id) => ({
        player: players.find((p) => p.id === id),
        evalHand: revealedHands[id]?.evaluated ?? null,
      }))
      .filter((entry): entry is { player: InternalPokerPlayer; evalHand: EvaluatedHand } =>
        Boolean(entry.player && entry.evalHand)
      );

    if (eligible.length === 0) continue;

    let bestEval = eligible[0].evalHand;
    let winners = [eligible[0]];

    for (let i = 1; i < eligible.length; i++) {
      const cmp = compareEvaluatedHands(eligible[i].evalHand, bestEval);
      if (cmp > 0) {
        bestEval = eligible[i].evalHand;
        winners = [eligible[i]];
      } else if (cmp === 0) {
        winners.push(eligible[i]);
      }
    }

    // Sort winners clockwise left of dealer for odd chip distribution
    winners.sort(
      (a, b) =>
        clockwiseOrderIds.indexOf(a.player.id) - clockwiseOrderIds.indexOf(b.player.id)
    );

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;

    winners.forEach((w, idx) => {
      const payout = share + (idx < remainder ? 1 : 0);
      w.player.chips += payout;
      allWinnerIds.add(w.player.id);
      for (const cid of w.evalHand.bestFiveIds) {
        allWinningCardIds.add(cid);
      }
    });

    potResults.push({
      potLabel: pot.label,
      amount: pot.amount,
      winnerIds: winners.map((w) => w.player.id),
      winningHandLabel: bestEval.labelDe,
      bestFiveIds: bestEval.bestFiveIds,
    });
  }

  for (const p of players) {
    p.streetBet = 0;
  }

  game.handPhase = 'hand_over';
  game.currentPlayerIndex = -1;

  if (potResults.length > 0) {
    const main = potResults[0];
    const winnerNames = main.winnerIds
      .map((id) => players.find((p) => p.id === id)?.name ?? 'Spieler')
      .join(' & ');
    const handSuffix = main.winningHandLabel ? ` mit ${main.winningHandLabel}` : '';
    pushEvent(
      game,
      `${winnerNames} ${main.winnerIds.length > 1 ? 'teilen' : 'gewinnt'} ${formatChipsDe(totalPot)}${handSuffix}.`
    );
  }

  game.handSummary = {
    handNumber: game.handNumber,
    wonByFold: false,
    totalPot,
    potResults,
    revealedHands,
    winnerIds: [...allWinnerIds],
    winningCardIds: [...allWinningCardIds],
  };
}

function evaluatePostActionState(
  game: InternalPokerGame,
  players: InternalPokerPlayer[]
): { handEnded: boolean; enteredRunout: boolean; streetAdvanced: boolean } {
  const nonFolded = players.filter((p) => p.inHand && !p.folded);

  if (nonFolded.length <= 1) {
    awardPotByFold(game, players);
    return { handEnded: true, enteredRunout: false, streetAdvanced: false };
  }

  const canActPlayers = nonFolded.filter((p) => !p.allIn);

  // Check if nobody left can act, or only 1 player has chips left and already covers/matches all all-ins
  if (canActPlayers.length === 0) {
    refundUncalledBet(players, game);
    for (const p of players) p.streetBet = 0;
    game.currentBet = 0;
    game.currentPlayerIndex = -1;
    return { handEnded: false, enteredRunout: true, streetAdvanced: false };
  }

  if (canActPlayers.length === 1) {
    const soleActive = canActPlayers[0];
    const maxAllInStreetBet = Math.max(
      ...nonFolded.filter((p) => p.allIn).map((p) => p.streetBet)
    );
    if (soleActive.streetBet >= maxAllInStreetBet) {
      refundUncalledBet(players, game);
      for (const p of players) p.streetBet = 0;
      game.currentBet = 0;
      game.currentPlayerIndex = -1;
      return { handEnded: false, enteredRunout: true, streetAdvanced: false };
    }
  }

  // Check if current betting round is complete
  const roundComplete = canActPlayers.every(
    (p) => game.actedThisStreet.has(p.id) && p.streetBet === game.currentBet
  );

  if (!roundComplete) {
    const nextIdx = findNextIndexMatching(
      players,
      game.currentPlayerIndex,
      (p) => p.inHand && !p.folded && !p.allIn
    );
    game.currentPlayerIndex = nextIdx;
    return { handEnded: false, enteredRunout: false, streetAdvanced: false };
  }

  // Current street finished -> reset street bets and advance street or showdown
  for (const p of players) {
    p.streetBet = 0;
    if (p.inHand && !p.folded && !p.allIn) {
      p.lastActionLabel = null;
    }
  }
  game.currentBet = 0;
  game.minRaiseIncrement = game.bigBlind;
  game.actedThisStreet.clear();
  game.actedAtFullBet.clear();

  if (game.communityCards.length >= 5) {
    resolveShowdown(game, players);
    return { handEnded: true, enteredRunout: false, streetAdvanced: false };
  }

  dealCommunityForNextStreet(game);
  game.currentPlayerIndex = findNextIndexMatching(
    players,
    game.dealerIndex,
    (p) => p.inHand && !p.folded && !p.allIn
  );
  return { handEnded: false, enteredRunout: false, streetAdvanced: true };
}

export function performPokerAction(
  game: InternalPokerGame,
  players: InternalPokerPlayer[],
  playerId: string,
  action: PlayerActionType,
  targetStreetBet?: number
): PokerActionResult {
  if (game.handPhase === 'hand_over' || game.handPhase === 'all_in_runout') {
    return { ok: false, error: 'Aktuell ist keine Setzrunde aktiv.' };
  }

  const current = players[game.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    return { ok: false, error: 'Du bist nicht am Zug.' };
  }

  if (!current.inHand || current.folded || current.allIn) {
    return { ok: false, error: 'Du kannst in dieser Hand nicht mehr handeln.' };
  }

  const constraints = getPlayerActionConstraints(game, players, current);

  switch (action) {
    case 'fold': {
      current.folded = true;
      current.lastActionLabel = 'Fold';
      pushEvent(game, `${current.name} passt (Fold).`);
      break;
    }

    case 'check': {
      if (!constraints.canCheck) {
        return {
          ok: false,
          error: `Check nicht möglich — mindestens ${formatChipsDe(constraints.toCall)} mitgehen.`,
        };
      }
      game.actedThisStreet.add(current.id);
      game.actedAtFullBet.add(current.id);
      current.lastActionLabel = 'Check';
      pushEvent(game, `${current.name} checkt.`);
      break;
    }

    case 'call': {
      if (!constraints.canCall) {
        return { ok: false, error: 'Kein Einsatz zum Mitgehen vorhanden.' };
      }
      const paid = constraints.toCall;
      current.chips -= paid;
      current.streetBet += paid;
      current.totalBetInHand += paid;
      if (current.chips === 0) {
        current.allIn = true;
        current.lastActionLabel = `All-In ${current.streetBet}`;
        pushEvent(game, `${current.name} geht All-In (${formatChipsDe(current.streetBet)}).`);
      } else {
        current.lastActionLabel = `Call ${current.streetBet}`;
        pushEvent(game, `${current.name} geht mit (${formatChipsDe(paid)}).`);
      }
      game.actedThisStreet.add(current.id);
      game.actedAtFullBet.add(current.id);
      break;
    }

    case 'all_in': {
      if (current.chips <= 0) {
        return { ok: false, error: 'Keine Chips mehr verfügbar.' };
      }
      const newStreetBet = current.streetBet + current.chips;
      if (newStreetBet <= game.currentBet || !constraints.canBetOrRaise) {
        // Call-all-in (doesn't exceed currentBet or can't reopen)
        const paid = Math.min(current.chips, constraints.toCall);
        if (newStreetBet > game.currentBet && !constraints.canBetOrRaise) {
          return {
            ok: false,
            error: 'Nach unvollständigem All-In kannst du nur mitgehen oder passen.',
          };
        }
        current.chips -= paid;
        current.streetBet += paid;
        current.totalBetInHand += paid;
        current.allIn = current.chips === 0;
        current.lastActionLabel = `All-In ${current.streetBet}`;
        game.actedThisStreet.add(current.id);
        game.actedAtFullBet.add(current.id);
        pushEvent(game, `${current.name} geht All-In (${formatChipsDe(current.streetBet)}).`);
        break;
      }

      const prevBet = game.currentBet;
      const raiseDelta = newStreetBet - prevBet;
      const isFullRaise =
        prevBet === 0
          ? newStreetBet >= game.bigBlind
          : raiseDelta >= game.minRaiseIncrement;

      current.totalBetInHand += current.chips;
      current.streetBet = newStreetBet;
      current.chips = 0;
      current.allIn = true;
      current.lastActionLabel = `All-In ${newStreetBet}`;

      game.currentBet = newStreetBet;
      game.actedThisStreet.add(current.id);

      if (isFullRaise) {
        game.minRaiseIncrement = prevBet === 0 ? newStreetBet : raiseDelta;
        game.actedAtFullBet = new Set([current.id]);
      } else {
        // Incomplete all-in raise does NOT reopen action for players who already acted
        game.actedAtFullBet.add(current.id);
      }

      pushEvent(game, `${current.name} geht All-In (${formatChipsDe(newStreetBet)})!`);
      break;
    }

    case 'bet':
    case 'raise': {
      if (!constraints.canBetOrRaise) {
        return { ok: false, error: 'Erhöhen ist aktuell nicht möglich.' };
      }
      if (typeof targetStreetBet !== 'number' || !Number.isFinite(targetStreetBet)) {
        return { ok: false, error: 'Ungültiger Einsatzbetrag.' };
      }

      const cleanTarget = Math.round(targetStreetBet);
      if (cleanTarget > constraints.maxRaiseTo) {
        return { ok: false, error: 'Nicht genügend Chips.' };
      }

      const isAllIn = cleanTarget === constraints.maxRaiseTo;
      if (cleanTarget < constraints.minRaiseTo && !isAllIn) {
        return {
          ok: false,
          error: `Mindesterhöhung beträgt ${formatChipsDe(constraints.minRaiseTo)}.`,
        };
      }
      if (cleanTarget <= game.currentBet) {
        return { ok: false, error: 'Erhöhung muss über dem aktuellen Einsatz liegen.' };
      }

      const paid = cleanTarget - current.streetBet;
      if (paid <= 0 || paid > current.chips) {
        return { ok: false, error: 'Ungültiger Einsatz.' };
      }

      const prevBet = game.currentBet;
      const raiseDelta = cleanTarget - prevBet;
      const isFullRaise =
        prevBet === 0
          ? cleanTarget >= game.bigBlind
          : raiseDelta >= game.minRaiseIncrement;

      current.chips -= paid;
      current.streetBet = cleanTarget;
      current.totalBetInHand += paid;
      if (current.chips === 0) {
        current.allIn = true;
        current.lastActionLabel = `All-In ${cleanTarget}`;
      } else {
        current.lastActionLabel =
          prevBet === 0 ? `Bet ${cleanTarget}` : `Raise ${cleanTarget}`;
      }

      game.currentBet = cleanTarget;
      game.actedThisStreet.add(current.id);

      if (isFullRaise) {
        game.minRaiseIncrement = prevBet === 0 ? cleanTarget : raiseDelta;
        game.actedAtFullBet = new Set([current.id]);
      } else {
        game.actedAtFullBet.add(current.id);
      }

      if (current.allIn) {
        pushEvent(game, `${current.name} geht All-In (${formatChipsDe(cleanTarget)})!`);
      } else if (prevBet === 0) {
        pushEvent(game, `${current.name} setzt ${formatChipsDe(cleanTarget)}.`);
      } else {
        pushEvent(game, `${current.name} erhöht auf ${formatChipsDe(cleanTarget)}.`);
      }
      break;
    }

    default:
      return { ok: false, error: 'Unbekannte Aktion.' };
  }

  const nextState = evaluatePostActionState(game, players);
  if (nextState.enteredRunout) {
    game.handPhase = 'all_in_runout';
    pushEvent(game, 'Alle verbleibenden Spieler All-In — Board wird aufgedeckt.');
  }

  return {
    ok: true,
    handEnded: nextState.handEnded,
    enteredRunout: nextState.enteredRunout,
    streetAdvanced: nextState.streetAdvanced,
  };
}

export function forceFoldDisconnectedPlayer(
  game: InternalPokerGame,
  players: InternalPokerPlayer[],
  targetPlayerId: string
): PokerActionResult {
  const target = players.find((p) => p.id === targetPlayerId);
  if (!target) {
    return { ok: false, error: 'Spieler nicht gefunden.' };
  }
  if (!target.inHand || target.folded || target.allIn) {
    return { ok: false, error: 'Spieler ist in dieser Hand nicht aktiv.' };
  }
  const current = players[game.currentPlayerIndex];
  if (current?.id !== target.id) {
    return { ok: false, error: 'Dieser Spieler ist nicht am Zug.' };
  }

  const constraints = getPlayerActionConstraints(game, players, target);
  if (constraints.canCheck) {
    return performPokerAction(game, players, target.id, 'check');
  }
  return performPokerAction(game, players, target.id, 'fold');
}

export function buildMatchSummary(
  players: readonly InternalPokerPlayer[],
  handsPlayed: number
): MatchSummary | null {
  const withChips = players.filter((p) => p.chips > 0);
  if (withChips.length !== 1) return null;

  const winner = withChips[0];
  const standings: MatchStanding[] = [...players]
    .sort((a, b) => b.chips - a.chips)
    .map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      isBot: p.isBot,
      eliminated: p.chips <= 0,
    }));

  return {
    winnerId: winner.id,
    winnerName: winner.name,
    handsPlayed,
    totalChips: winner.chips,
    standings,
  };
}

function estimatePreflopStrength(cards: readonly PokerCard[]): number {
  if (cards.length < 2) return 30;
  const [a, b] = [...cards].sort((x, y) => y.rank - x.rank);
  const high = a.rank;
  const low = b.rank;
  const suited = a.suit === b.suit;
  const gap = high - low;

  if (high === low) {
    // Pocket pairs: 22 ~ 54 -> AA ~ 96
    return Math.min(97, 50 + high * 3.2);
  }

  let score = high * 2.4 + low * 1.3; // e.g. AK = 51.8, 72 = 19.4
  if (suited) score += 6;
  if (gap === 1) score += 4;
  else if (gap === 2) score += 2;
  if (high >= 13 && low >= 10) score += 10;
  else if (high === 14) score += 8;

  return Math.max(15, Math.min(92, Math.round(score)));
}

function hasFlushOrStraightDraw(cards: readonly PokerCard[]): boolean {
  if (cards.length < 4 || cards.length >= 7) return false;
  const suitCounts = new Map<Suit, number>();
  for (const c of cards) {
    suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  }
  for (const count of suitCounts.values()) {
    if (count === 4) return true;
  }

  const uniqueRanks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
  for (let i = 0; i <= uniqueRanks.length - 4; i++) {
    if (uniqueRanks[i + 3] - uniqueRanks[i] <= 4) {
      return true;
    }
  }
  return false;
}

function estimatePostflopStrength(
  holeCards: readonly PokerCard[],
  communityCards: readonly PokerCard[]
): number {
  const combined = [...holeCards, ...communityCards];
  const best = evaluateBestHand(combined);
  if (!best) return 30;

  let base = 25;
  switch (best.category) {
    case 9:
      base = 100;
      break;
    case 8:
      base = 99;
      break;
    case 7:
      base = 97;
      break;
    case 6:
      base = 94;
      break;
    case 5:
      base = 88;
      break;
    case 4:
      base = 84;
      break;
    case 3:
      base = 79;
      break;
    case 2:
      base = 70;
      break;
    case 1: {
      const pairRank = best.tiebreakers[0] ?? 7;
      const holeMatchesPair = holeCards.some((c) => c.rank === pairRank);
      const maxBoard = Math.max(...communityCards.map((c) => c.rank));
      if (holeMatchesPair && pairRank >= maxBoard) base = 64;
      else if (holeMatchesPair) base = 54;
      else base = 38;
      break;
    }
    default: {
      const highHole = Math.max(...holeCards.map((c) => c.rank));
      base = highHole >= 13 ? 34 : 24;
      break;
    }
  }

  if (best.category < 4 && hasFlushOrStraightDraw(combined)) {
    base = Math.min(82, base + 14);
  }

  return base;
}

export function decideBotAction(
  game: InternalPokerGame,
  players: readonly InternalPokerPlayer[],
  bot: InternalPokerPlayer
): { action: PlayerActionType; targetStreetBet?: number } {
  const constraints = getPlayerActionConstraints(game, players, bot);
  const potTotal = Math.max(game.bigBlind * 2, getPotTotal(players));

  const rawStrength =
    game.communityCards.length === 0
      ? estimatePreflopStrength(bot.holeCards)
      : estimatePostflopStrength(bot.holeCards, game.communityCards);

  // Subtle jitter so bot play feels organic
  const jitter = secureRandomInt(-8, 9);
  const strength = Math.max(0, Math.min(100, rawStrength + jitter));

  const pickSizing = (fractionOfPot: number): number => {
    const potAfterCall = potTotal + constraints.toCall;
    const rawTarget =
      game.currentBet === 0
        ? Math.round(potTotal * fractionOfPot)
        : Math.round(game.currentBet + potAfterCall * fractionOfPot);
    const rounded = Math.max(
      constraints.minRaiseTo,
      Math.min(constraints.maxRaiseTo, rawTarget)
    );
    // Snap cleanly to whole chips
    return rounded;
  };

  if (constraints.canCheck) {
    if (constraints.canBetOrRaise) {
      if (strength >= 76 && secureRandomInt(0, 100) < 72) {
        const target =
          game.currentBet === 0
            ? pickSizing(0.6)
            : Math.min(constraints.maxRaiseTo, Math.max(constraints.minRaiseTo, game.bigBlind * 3));
        return {
          action: game.currentBet === 0 ? 'bet' : 'raise',
          targetStreetBet: target,
        };
      }
      if (strength >= 56 && secureRandomInt(0, 100) < 35) {
        return {
          action: game.currentBet === 0 ? 'bet' : 'raise',
          targetStreetBet: pickSizing(0.45),
        };
      }
      if (strength < 35 && secureRandomInt(0, 100) < 10) {
        return {
          action: game.currentBet === 0 ? 'bet' : 'raise',
          targetStreetBet: pickSizing(0.4),
        };
      }
    }
    return { action: 'check' };
  }

  // Facing a bet/raise
  const callShareOfPot = constraints.toCall / Math.max(1, potTotal + constraints.toCall);
  const callShareOfStack = constraints.toCall / Math.max(1, bot.chips);

  if (strength >= 80 && constraints.canBetOrRaise && secureRandomInt(0, 100) < 55) {
    const target = pickSizing(0.7);
    if (target >= constraints.maxRaiseTo) {
      return { action: 'all_in' };
    }
    return { action: 'raise', targetStreetBet: target };
  }

  if (strength >= 72) {
    return { action: 'call' };
  }

  if (strength >= 54) {
    if (callShareOfPot <= 0.42 || constraints.toCall <= game.bigBlind * 2.5) {
      return { action: 'call' };
    }
    if (callShareOfStack <= 0.25) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  if (strength >= 38) {
    if (
      (callShareOfPot <= 0.22 && callShareOfStack <= 0.2) ||
      constraints.toCall <= game.bigBlind
    ) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  if (constraints.toCall <= game.smallBlind && secureRandomInt(0, 100) < 35) {
    return { action: 'call' };
  }

  return { action: 'fold' };
}
