import { evaluateBestHand } from '../../shared/handEvaluator.js';
import {
  DEFAULT_STARTING_STACK,
  type InternalPokerGame,
  type InternalPokerPlayer,
  type PokerActionResult,
  buildMatchSummary,
  computePots,
  createTableConfig,
  decideBotAction,
  forceFoldDisconnectedPlayer,
  getPlayerActionConstraints,
  getPotTotal,
  performPokerAction,
  pushEvent,
  refundUncalledBet,
  secureRandomInt,
  startHand,
  stepAllInRunout,
} from '../../shared/gameEngine.js';
import type {
  ClientRoomState,
  MatchSummary,
  PlayerActionType,
  PokerCard,
  PublicPokerPlayer,
  RoomActionResponse,
  RoomPhase,
  SessionCredentials,
  TableConfig,
} from '../../shared/types.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Nova (Bot)', 'Kairo (Bot)', 'Vega (Bot)', 'Echo (Bot)', 'Atlas (Bot)', 'Lyra (Bot)'];

export interface BrowserPokerRoom {
  code: string;
  phase: RoomPhase;
  config: TableConfig;
  hostId: string;
  players: InternalPokerPlayer[];
  leftTableIds: Set<string>;
  handNumber: number;
  lastDealerIndex: number | null;
  countdownSeconds: number | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  runoutTimer: ReturnType<typeof setTimeout> | null;
  game: InternalPokerGame | null;
  matchSummary: MatchSummary | null;
}

export type PeerSendFn = (peerId: string, state: ClientRoomState) => void;
export type PeerKickFn = (peerId: string, reason: string) => void;

export function generateBrowserRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_ALPHABET[secureRandomInt(0, ROOM_ALPHABET.length)];
  }
  return code;
}

export class BrowserHostManager {
  public readonly room: BrowserPokerRoom;
  private onBroadcast: PeerSendFn;
  private onKicked: PeerKickFn;

  constructor(
    roomCode: string,
    hostName: string,
    initialStartingStack: number = DEFAULT_STARTING_STACK,
    onBroadcast: PeerSendFn,
    onKicked: PeerKickFn
  ) {
    this.onBroadcast = onBroadcast;
    this.onKicked = onKicked;

    const config = createTableConfig(initialStartingStack);
    const hostId = globalThis.crypto.randomUUID();
    const host: InternalPokerPlayer = {
      id: hostId,
      name: this.sanitizeName(hostName),
      isHost: true,
      isBot: false,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      reconnectToken: globalThis.crypto.randomUUID(),
      socketId: 'HOST_LOCAL',
      chips: config.startingStack,
      holeCards: [],
      streetBet: 0,
      totalBetInHand: 0,
      inHand: false,
      folded: false,
      allIn: false,
      lastActionLabel: null,
      readyForNextHand: false,
    };

    this.room = {
      code: roomCode,
      phase: 'lobby',
      config,
      hostId,
      players: [host],
      leftTableIds: new Set<string>(),
      handNumber: 0,
      lastDealerIndex: null,
      countdownSeconds: null,
      countdownTimer: null,
      botTimer: null,
      runoutTimer: null,
      game: null,
      matchSummary: null,
    };
  }

  public getHostPlayerId(): string {
    return this.room.hostId;
  }

  public destroy(): void {
    this.clearCountdown();
    this.clearBotTimer();
    this.clearRunoutTimer();
  }

  private sanitizeName(rawName: string): string {
    const cleaned = rawName.trim().replace(/\s+/g, ' ').slice(0, 20);
    return cleaned || 'Spieler';
  }

  private uniqueName(baseName: string): string {
    const existing = new Set(this.room.players.map((p) => p.name.toLowerCase()));
    if (!existing.has(baseName.toLowerCase())) return baseName;
    for (let i = 2; i <= 20; i++) {
      const candidate = `${baseName.slice(0, 16)} (${i})`;
      if (!existing.has(candidate.toLowerCase())) return candidate;
    }
    return `${baseName.slice(0, 14)}-${secureRandomInt(10, 99)}`;
  }

  private clearCountdown(): void {
    if (this.room.countdownTimer) {
      clearInterval(this.room.countdownTimer);
      this.room.countdownTimer = null;
    }
    this.room.countdownSeconds = null;
  }

  private clearBotTimer(): void {
    if (this.room.botTimer) {
      clearTimeout(this.room.botTimer);
      this.room.botTimer = null;
    }
  }

  private clearRunoutTimer(): void {
    if (this.room.runoutTimer) {
      clearTimeout(this.room.runoutTimer);
      this.room.runoutTimer = null;
    }
  }

  public broadcast(): void {
    for (const player of this.room.players) {
      if (player.socketId && player.connected && !this.room.leftTableIds.has(player.id)) {
        this.onBroadcast(player.socketId, this.serializeForPlayer(player.id));
      }
    }
  }

  public serializeForPlayer(playerId: string): ClientRoomState {
    const me = this.room.players.find((p) => p.id === playerId);
    const game = this.room.game;

    const visiblePlayers = this.room.players.filter(
      (p) => !this.room.leftTableIds.has(p.id) || (game !== null && p.totalBetInHand > 0)
    );

    const publicPlayers: PublicPokerPlayer[] = visiblePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isBot: p.isBot,
      isReady: p.isReady,
      connected: p.connected,
      disconnectedAt: p.disconnectedAt,
      chips: p.chips,
      streetBet: p.streetBet,
      totalBetInHand: p.totalBetInHand,
      inHand: p.inHand,
      folded: p.folded,
      allIn: p.allIn,
      eliminated:
        this.room.phase === 'lobby'
          ? false
          : p.chips <= 0 && !p.inHand,
      hasCards: p.inHand && !p.folded && p.holeCards.length === 2,
      lastActionLabel: p.lastActionLabel,
      readyForNextHand: p.readyForNextHand,
    }));

    const currentPlayer =
      game && game.currentPlayerIndex >= 0 ? this.room.players[game.currentPlayerIndex] ?? null : null;
    const dealerPlayer =
      game && game.dealerIndex >= 0 ? this.room.players[game.dealerIndex] ?? null : null;
    const sbPlayer =
      game && game.smallBlindIndex >= 0 ? this.room.players[game.smallBlindIndex] ?? null : null;
    const bbPlayer =
      game && game.bigBlindIndex >= 0 ? this.room.players[game.bigBlindIndex] ?? null : null;

    const myHoleCards = me && me.inHand ? [...me.holeCards] : [];
    const myEvaluatedHand =
      game && me && me.inHand && !me.folded && myHoleCards.length === 2
        ? evaluateBestHand([...myHoleCards, ...game.communityCards])
        : null;

    const revealedCardsByPlayer: Record<string, PokerCard[]> = {};
    if (game) {
      if (game.handPhase === 'all_in_runout') {
        for (const p of this.room.players) {
          if (p.inHand && !p.folded && p.holeCards.length === 2) {
            revealedCardsByPlayer[p.id] = [...p.holeCards];
          }
        }
      } else if (game.handPhase === 'hand_over' && game.handSummary && !game.handSummary.wonByFold) {
        for (const [id, entry] of Object.entries(game.handSummary.revealedHands)) {
          revealedCardsByPlayer[id] = [...entry.cards];
        }
      }
    }

    const isMyTurn =
      this.room.phase === 'playing' &&
      game !== null &&
      game.handPhase !== 'hand_over' &&
      game.handPhase !== 'all_in_runout' &&
      currentPlayer?.id === playerId;

    const constraints =
      isMyTurn && game && me
        ? getPlayerActionConstraints(game, this.room.players, me)
        : {
            toCall: 0,
            canCheck: false,
            canCall: false,
            canBetOrRaise: false,
            minRaiseTo: 0,
            maxRaiseTo: 0,
          };

    const potTotal = game ? getPotTotal(this.room.players) : 0;
    const pots = game ? computePots(this.room.players) : [];

    return {
      roomCode: this.room.code,
      phase: this.room.phase,
      myPlayerId: playerId,
      hostId: this.room.hostId,
      config: { ...this.room.config },
      players: publicPlayers,
      myHoleCards,
      myEvaluatedHand,
      revealedCardsByPlayer,
      countdownSeconds: this.room.countdownSeconds,
      handNumber: game?.handNumber ?? this.room.handNumber,
      handPhase: game?.handPhase ?? null,
      dealerPlayerId: dealerPlayer?.id ?? null,
      smallBlindPlayerId: sbPlayer?.id ?? null,
      bigBlindPlayerId: bbPlayer?.id ?? null,
      currentPlayerId: currentPlayer?.id ?? null,
      communityCards: game ? [...game.communityCards] : [],
      potTotal,
      pots,
      currentBet: game?.currentBet ?? 0,
      minRaiseTo: constraints.minRaiseTo,
      maxRaiseTo: constraints.maxRaiseTo,
      toCall: constraints.toCall,
      canCheck: constraints.canCheck,
      canCall: constraints.canCall,
      canBetOrRaise: constraints.canBetOrRaise,
      handSummary: game?.handSummary ?? null,
      matchSummary: this.room.matchSummary,
      lastEvent: game?.eventLog[0] ?? null,
      eventLog: game?.eventLog ?? [],
    };
  }

  private findPlayerByPeer(peerId: string): InternalPokerPlayer | undefined {
    return this.room.players.find((p) => p.socketId === peerId);
  }

  public joinGuest(peerId: string, rawName: string): RoomActionResponse {
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'In diesem Room läuft bereits ein Spiel.' };
    }
    if (this.room.players.length >= 10) {
      return { ok: false, error: 'Dieser Room ist voll (maximal 10 Spieler).' };
    }

    const existing = this.findPlayerByPeer(peerId);
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      this.broadcast();
      return {
        ok: true,
        credentials: {
          roomCode: this.room.code,
          playerId: existing.id,
          reconnectToken: existing.reconnectToken,
        },
      };
    }

    const playerId = globalThis.crypto.randomUUID();
    const reconnectToken = globalThis.crypto.randomUUID();
    const name = this.uniqueName(this.sanitizeName(rawName));

    const player: InternalPokerPlayer = {
      id: playerId,
      name,
      isHost: false,
      isBot: false,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      reconnectToken,
      socketId: peerId,
      chips: this.room.config.startingStack,
      holeCards: [],
      streetBet: 0,
      totalBetInHand: 0,
      inHand: false,
      folded: false,
      allIn: false,
      lastActionLabel: null,
      readyForNextHand: false,
    };

    this.room.players.push(player);
    this.clearCountdown();
    this.broadcast();

    return {
      ok: true,
      credentials: { roomCode: this.room.code, playerId, reconnectToken },
    };
  }

  public rejoinGuest(peerId: string, creds: SessionCredentials): RoomActionResponse {
    if (creds.roomCode.trim().toUpperCase() !== this.room.code) {
      return { ok: false, error: 'Falscher Room-Code.' };
    }
    const player = this.room.players.find(
      (p) =>
        p.id === creds.playerId &&
        p.reconnectToken === creds.reconnectToken &&
        !this.room.leftTableIds.has(p.id)
    );
    if (!player) {
      return { ok: false, error: 'Sitzung abgelaufen.' };
    }
    player.socketId = peerId;
    player.connected = true;
    player.disconnectedAt = null;
    this.broadcast();
    return { ok: true, credentials: creds };
  }

  public handlePeerDisconnect(peerId: string): void {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return;

    if (this.room.phase === 'lobby') {
      this.removePlayerInternal(player.id, `${player.name} hat die Lobby verlassen.`);
      return;
    }

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.broadcast();
  }

  public leaveGuest(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return { ok: true };
    this.removePlayerInternal(player.id, `${player.name} hat den Tisch verlassen.`);
    return { ok: true };
  }

  private pruneLeftPlayers(): void {
    if (this.room.leftTableIds.size === 0) return;
    this.room.players = this.room.players.filter((p) => !this.room.leftTableIds.has(p.id));
    this.room.leftTableIds.clear();
  }

  private removePlayerInternal(playerId: string, reasonMessage: string): void {
    const idx = this.room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const player = this.room.players[idx];

    if (this.room.phase === 'lobby') {
      this.room.players.splice(idx, 1);
      this.clearCountdown();
      this.evaluateAutoStart();
      this.broadcast();
      return;
    }

    if (this.room.phase === 'match_over') {
      this.room.players.splice(idx, 1);
      if (this.room.players.length < 2) {
        this.resetToLobbyState();
      } else {
        this.evaluateAutoStart();
      }
      this.broadcast();
      return;
    }

    // Playing phase
    const game = this.room.game;
    if (!game) return;

    if (game.handPhase === 'hand_over') {
      this.room.players.splice(idx, 1);
      if (this.room.lastDealerIndex !== null && idx <= this.room.lastDealerIndex) {
        this.room.lastDealerIndex = Math.max(0, this.room.lastDealerIndex - 1);
      }
      const activeAtTable = this.room.players.filter((p) => p.chips > 0);
      if (this.room.players.length < 2) {
        this.resetToLobbyState();
      } else if (activeAtTable.length <= 1) {
        this.enterMatchOver();
      } else {
        this.checkNextHandReadySkip();
      }
      this.broadcast();
      return;
    }

    // Active hand: keep pot contributions intact until hand finishes
    this.room.leftTableIds.add(player.id);
    player.connected = false;
    player.socketId = null;

    if (player.inHand && !player.folded) {
      const current = this.room.players[game.currentPlayerIndex];
      if (current?.id === player.id) {
        const res = performPokerAction(game, this.room.players, player.id, 'fold');
        if (res.ok) {
          pushEvent(game, reasonMessage);
          this.handlePostActionFlow(res);
          return;
        }
      } else {
        player.folded = true;
        player.lastActionLabel = 'Verlassen';
        pushEvent(game, reasonMessage);

        const nonFolded = this.room.players.filter((p) => p.inHand && !p.folded);
        if (nonFolded.length <= 1) {
          const fallbackRes = performPokerActionSafeAwardFold(game, this.room.players);
          this.handlePostActionFlow(fallbackRes);
          return;
        }
      }
    }

    pushEvent(game, reasonMessage);
    this.broadcast();
  }

  public toggleReady(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return { ok: false, error: 'Nicht im Room.' };
    if (this.room.phase === 'playing') {
      return { ok: false, error: 'Während des Spiels nicht verfügbar.' };
    }
    player.isReady = !player.isReady;
    this.evaluateAutoStart();
    this.broadcast();
    return { ok: true };
  }

  public setTableConfig(
    peerId: string,
    startingStack: number,
    smallBlind?: number
  ): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host kann das Startgeld ändern.' };
    }
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'Nur in der Lobby möglich.' };
    }
    this.room.config = createTableConfig(startingStack, smallBlind);
    for (const p of this.room.players) {
      p.chips = this.room.config.startingStack;
      p.isReady = p.isBot;
    }
    this.clearCountdown();
    this.broadcast();
    return { ok: true };
  }

  public addBot(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host kann Bots hinzufügen.' };
    }
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'Bots können nur in der Lobby hinzugefügt werden.' };
    }
    if (this.room.players.length >= 10) {
      return { ok: false, error: 'Maximal 10 Spieler.' };
    }

    const usedNames = new Set(this.room.players.map((p) => p.name));
    const botName =
      BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot ${this.room.players.length + 1}`;

    const bot: InternalPokerPlayer = {
      id: `bot-${globalThis.crypto.randomUUID()}`,
      name: botName,
      isHost: false,
      isBot: true,
      isReady: true,
      connected: true,
      disconnectedAt: null,
      reconnectToken: globalThis.crypto.randomUUID(),
      socketId: null,
      chips: this.room.config.startingStack,
      holeCards: [],
      streetBet: 0,
      totalBetInHand: 0,
      inHand: false,
      folded: false,
      allIn: false,
      lastActionLabel: null,
      readyForNextHand: true,
    };

    this.room.players.push(bot);
    this.evaluateAutoStart();
    this.broadcast();
    return { ok: true };
  }

  public removePlayerByHost(peerId: string, targetPlayerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host darf Spieler entfernen.' };
    }
    if (targetPlayerId === player.id) {
      return { ok: false, error: 'Du kannst dich nicht selbst entfernen.' };
    }
    const target = this.room.players.find((p) => p.id === targetPlayerId);
    if (!target) return { ok: false, error: 'Spieler nicht gefunden.' };
    if (target.socketId) {
      this.onKicked(target.socketId, 'Du wurdest vom Host aus dem Room entfernt.');
    }
    this.removePlayerInternal(target.id, `${target.name} wurde vom Host entfernt.`);
    return { ok: true };
  }

  public skipDisconnectedTurn(peerId: string, targetPlayerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host darf überspringen.' };
    }
    if (this.room.phase !== 'playing' || !this.room.game) {
      return { ok: false, error: 'Keine aktive Hand.' };
    }
    const target = this.room.players.find((p) => p.id === targetPlayerId);
    if (!target || target.connected || target.isBot) {
      return { ok: false, error: 'Spieler ist verbunden.' };
    }
    const res = forceFoldDisconnectedPlayer(this.room.game, this.room.players, target.id);
    if (!res.ok) return res;
    this.handlePostActionFlow(res);
    return { ok: true };
  }

  public returnToLobby(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host kann in die Lobby zurückkehren.' };
    }
    if (this.room.phase === 'lobby') {
      return { ok: false, error: 'Du bist bereits in der Lobby.' };
    }
    this.resetToLobbyState();
    this.broadcast();
    return { ok: true };
  }

  private resetToLobbyState(): void {
    this.clearCountdown();
    this.clearBotTimer();
    this.clearRunoutTimer();
    this.pruneLeftPlayers();
    this.room.phase = 'lobby';
    this.room.game = null;
    this.room.matchSummary = null;
    this.room.handNumber = 0;
    this.room.lastDealerIndex = null;
    for (const p of this.room.players) {
      p.chips = this.room.config.startingStack;
      p.holeCards = [];
      p.streetBet = 0;
      p.totalBetInHand = 0;
      p.inHand = false;
      p.folded = false;
      p.allIn = false;
      p.lastActionLabel = null;
      p.isReady = p.isBot;
      p.readyForNextHand = false;
    }
  }

  private evaluateAutoStart(): void {
    if (this.room.phase !== 'lobby' && this.room.phase !== 'match_over') return;

    const allReady =
      this.room.players.length >= 2 &&
      this.room.players.every((p) => p.isReady && (p.isBot || p.connected));

    if (!allReady) {
      this.clearCountdown();
      return;
    }
    if (this.room.countdownTimer) return;

    this.room.countdownSeconds = 2;
    this.room.countdownTimer = setInterval(() => {
      const stillReady =
        this.room.players.length >= 2 &&
        this.room.players.every((p) => p.isReady && (p.isBot || p.connected));
      if (!stillReady) {
        this.clearCountdown();
        this.broadcast();
        return;
      }
      if (this.room.countdownSeconds !== null && this.room.countdownSeconds > 1) {
        this.room.countdownSeconds -= 1;
        this.broadcast();
      } else {
        this.clearCountdown();
        this.launchMatch();
      }
    }, 1000);
  }

  private launchMatch(): void {
    this.clearBotTimer();
    this.clearRunoutTimer();
    this.pruneLeftPlayers();
    this.room.phase = 'playing';
    this.room.matchSummary = null;
    this.room.handNumber = 0;
    this.room.lastDealerIndex = null;

    for (const p of this.room.players) {
      p.chips = this.room.config.startingStack;
      p.isReady = p.isBot;
    }

    this.startNextHandInternal();
  }

  private startNextHandInternal(): void {
    this.clearCountdown();
    this.clearBotTimer();
    this.clearRunoutTimer();
    this.pruneLeftPlayers();

    if (this.room.players.length < 2) {
      this.resetToLobbyState();
      this.broadcast();
      return;
    }

    const playersWithChips = this.room.players.filter((p) => p.chips > 0);
    if (playersWithChips.length <= 1) {
      this.enterMatchOver();
      this.broadcast();
      return;
    }

    this.room.handNumber += 1;
    const prevLog = this.room.game?.eventLog ?? [];
    const game = startHand(
      this.room.players,
      this.room.handNumber,
      this.room.config,
      this.room.lastDealerIndex,
      prevLog
    );
    this.room.game = game;
    this.room.lastDealerIndex = game.dealerIndex;

    if (game.handPhase === 'all_in_runout') {
      this.broadcast();
      this.scheduleRunoutStep();
      return;
    }

    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }

  private handlePostActionFlow(res: PokerActionResult): void {
    const game = this.room.game;
    if (!game) return;

    if (res.handEnded) {
      this.onHandEnded();
      return;
    }

    if (res.enteredRunout || game.handPhase === 'all_in_runout') {
      this.broadcast();
      this.scheduleRunoutStep();
      return;
    }

    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }

  private scheduleRunoutStep(): void {
    this.clearRunoutTimer();
    const game = this.room.game;
    if (!game || game.handPhase !== 'all_in_runout') return;

    this.room.runoutTimer = setTimeout(() => {
      if (!this.room.game || this.room.game.handPhase !== 'all_in_runout') return;
      const { done } = stepAllInRunout(this.room.game, this.room.players);
      if (done) {
        this.onHandEnded();
      } else {
        this.broadcast();
        this.scheduleRunoutStep();
      }
    }, 900);
  }

  private onHandEnded(): void {
    this.clearBotTimer();
    this.clearRunoutTimer();

    const remainingPlayers = this.room.players.filter(
      (p) => !this.room.leftTableIds.has(p.id)
    );
    const playersWithChips = remainingPlayers.filter((p) => p.chips > 0);

    if (playersWithChips.length <= 1) {
      this.enterMatchOver();
      this.broadcast();
      return;
    }

    // Start 6-second auto-advance countdown to next hand
    for (const p of this.room.players) {
      p.readyForNextHand = p.isBot || !p.connected || p.chips <= 0 || this.room.leftTableIds.has(p.id);
    }

    this.clearCountdown();
    this.room.countdownSeconds = 6;
    this.room.countdownTimer = setInterval(() => {
      if (this.room.phase !== 'playing' || this.room.game?.handPhase !== 'hand_over') {
        this.clearCountdown();
        return;
      }
      if (this.room.countdownSeconds !== null && this.room.countdownSeconds > 1) {
        this.room.countdownSeconds -= 1;
        this.broadcast();
      } else {
        this.clearCountdown();
        this.startNextHandInternal();
      }
    }, 1000);

    this.broadcast();
  }

  private enterMatchOver(): void {
    this.clearCountdown();
    this.clearBotTimer();
    this.clearRunoutTimer();
    this.pruneLeftPlayers();

    this.room.phase = 'match_over';
    this.room.matchSummary = buildMatchSummary(this.room.players, this.room.handNumber);
    for (const p of this.room.players) {
      p.isReady = p.isBot;
    }
  }

  private checkNextHandReadySkip(): void {
    const activeHumans = this.room.players.filter(
      (p) => !p.isBot && p.connected && !this.room.leftTableIds.has(p.id) && p.chips > 0
    );
    if (activeHumans.length > 0 && activeHumans.every((p) => p.readyForNextHand)) {
      this.clearCountdown();
      this.startNextHandInternal();
    }
  }

  public readyForNextHand(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return { ok: false, error: 'Nicht im Room.' };
    if (this.room.phase !== 'playing' || this.room.game?.handPhase !== 'hand_over') {
      return { ok: false, error: 'Aktuell nicht möglich.' };
    }
    player.readyForNextHand = !player.readyForNextHand;

    const activeHumans = this.room.players.filter(
      (p) => !p.isBot && p.connected && !this.room.leftTableIds.has(p.id) && p.chips > 0
    );
    if (activeHumans.length > 0 && activeHumans.every((p) => p.readyForNextHand)) {
      this.clearCountdown();
      this.startNextHandInternal();
      return { ok: true };
    }

    this.broadcast();
    return { ok: true };
  }

  public handleAction(
    peerId: string,
    action: string,
    payload?: Record<string, unknown>
  ): RoomActionResponse {
    switch (action) {
      case 'room:toggle_ready':
        return this.toggleReady(peerId);
      case 'room:set_config': {
        const startingStack =
          typeof payload?.startingStack === 'number'
            ? payload.startingStack
            : this.room.config.startingStack;
        const smallBlind =
          typeof payload?.smallBlind === 'number' ? payload.smallBlind : undefined;
        return this.setTableConfig(peerId, startingStack, smallBlind);
      }
      case 'room:add_bot':
        return this.addBot(peerId);
      case 'room:remove_player':
        return this.removePlayerByHost(
          peerId,
          typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : ''
        );
      case 'room:skip_disconnected':
        return this.skipDisconnectedTurn(
          peerId,
          typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : ''
        );
      case 'room:next_round':
        return this.returnToLobby(peerId);
      case 'room:leave':
        return this.leaveGuest(peerId);
      case 'game:ready_next_hand':
        return this.readyForNextHand(peerId);
      case 'game:action': {
        const player = this.findPlayerByPeer(peerId);
        if (!player || this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Keine aktive Hand.' };
        }
        const act = payload?.actionType as PlayerActionType;
        const targetStreetBet =
          typeof payload?.targetStreetBet === 'number' ? payload.targetStreetBet : undefined;

        const res = performPokerAction(
          this.room.game,
          this.room.players,
          player.id,
          act,
          targetStreetBet
        );
        if (!res.ok) return res;
        this.handlePostActionFlow(res);
        return res;
      }
      default:
        return { ok: false, error: 'Unbekannte Aktion.' };
    }
  }

  private scheduleBotTurnIfNeeded(): void {
    this.clearBotTimer();
    const game = this.room.game;
    if (
      this.room.phase !== 'playing' ||
      !game ||
      game.handPhase === 'hand_over' ||
      game.handPhase === 'all_in_runout'
    ) {
      return;
    }

    const current =
      game.currentPlayerIndex >= 0 ? this.room.players[game.currentPlayerIndex] : null;
    if (!current || !current.isBot) return;

    this.room.botTimer = setTimeout(() => {
      this.executeBotStep();
    }, 850);
  }

  private executeBotStep(): void {
    const game = this.room.game;
    if (
      this.room.phase !== 'playing' ||
      !game ||
      game.handPhase === 'hand_over' ||
      game.handPhase === 'all_in_runout'
    ) {
      return;
    }

    const bot = this.room.players[game.currentPlayerIndex];
    if (!bot || !bot.isBot) return;

    const decision = decideBotAction(game, this.room.players, bot);
    const res = performPokerAction(
      game,
      this.room.players,
      bot.id,
      decision.action,
      decision.targetStreetBet
    );

    if (!res.ok) {
      // Safe fallback
      const constraints = getPlayerActionConstraints(game, this.room.players, bot);
      const fallback = performPokerAction(
        game,
        this.room.players,
        bot.id,
        constraints.canCheck ? 'check' : 'fold'
      );
      this.handlePostActionFlow(fallback);
      return;
    }

    this.handlePostActionFlow(res);
  }
}

function performPokerActionSafeAwardFold(
  game: InternalPokerGame,
  players: InternalPokerPlayer[]
): PokerActionResult {
  refundUncalledBet(players, game);
  const survivor = players.find((p) => p.inHand && !p.folded);
  if (!survivor) {
    return { ok: true, handEnded: true };
  }
  const totalPot = getPotTotal(players);
  survivor.chips += totalPot;
  for (const p of players) p.streetBet = 0;
  game.handPhase = 'hand_over';
  game.currentPlayerIndex = -1;
  game.handSummary = {
    handNumber: game.handNumber,
    wonByFold: true,
    totalPot,
    potResults: [
      {
        potLabel: 'Main Pot',
        amount: totalPot,
        winnerIds: [survivor.id],
        winningHandLabel: null,
        bestFiveIds: [],
      },
    ],
    revealedHands: {},
    winnerIds: [survivor.id],
    winningCardIds: [],
  };
  return { ok: true, handEnded: true };
}
