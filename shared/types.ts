export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface PokerCard {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type RoomPhase = 'lobby' | 'playing' | 'match_over';

export type HandPhase =
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'all_in_runout'
  | 'hand_over';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface EvaluatedHand {
  category: HandCategory;
  tiebreakers: number[];
  shortLabelDe: string;
  labelDe: string;
  bestFiveIds: string[];
}

export type PlayerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

export interface TableConfig {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface PotInfo {
  label: string;
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PotWinnerResult {
  potLabel: string;
  amount: number;
  winnerIds: string[];
  winningHandLabel: string | null;
  bestFiveIds: string[];
}

export interface RevealedPlayerHand {
  cards: PokerCard[];
  evaluated: EvaluatedHand | null;
}

export interface HandSummary {
  handNumber: number;
  wonByFold: boolean;
  totalPot: number;
  potResults: PotWinnerResult[];
  revealedHands: Record<string, RevealedPlayerHand>;
  winnerIds: string[];
  winningCardIds: string[];
}

export interface MatchStanding {
  id: string;
  name: string;
  chips: number;
  isBot: boolean;
  eliminated: boolean;
}

export interface MatchSummary {
  winnerId: string;
  winnerName: string;
  handsPlayed: number;
  totalChips: number;
  standings: MatchStanding[];
}

export interface PublicPokerPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  chips: number;
  streetBet: number;
  totalBetInHand: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  eliminated: boolean;
  hasCards: boolean;
  lastActionLabel: string | null;
  readyForNextHand: boolean;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

export interface ClientRoomState {
  roomCode: string;
  phase: RoomPhase;
  myPlayerId: string;
  hostId: string;
  config: TableConfig;
  players: PublicPokerPlayer[];
  myHoleCards: PokerCard[];
  myEvaluatedHand: EvaluatedHand | null;
  revealedCardsByPlayer: Record<string, PokerCard[]>;
  countdownSeconds: number | null;
  handNumber: number;
  handPhase: HandPhase | null;
  dealerPlayerId: string | null;
  smallBlindPlayerId: string | null;
  bigBlindPlayerId: string | null;
  currentPlayerId: string | null;
  communityCards: PokerCard[];
  potTotal: number;
  pots: PotInfo[];
  currentBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canBetOrRaise: boolean;
  handSummary: HandSummary | null;
  matchSummary: MatchSummary | null;
  lastEvent: GameEvent | null;
  eventLog: GameEvent[];
}

export interface SessionCredentials {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface RoomActionResponse {
  ok: boolean;
  error?: string;
  credentials?: SessionCredentials;
}
