import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  HelpCircle,
  LogOut,
  SkipForward,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  ClientRoomState,
  PlayerActionType,
  RoomActionResponse,
} from '../../shared/types.ts';
import {
  formatMoney,
  getHandPhaseLabelDe,
  HAND_RANKINGS_GUIDE,
} from '../utils/pokerLabels.ts';
import { MatchOverModal } from './MatchOverModal.tsx';
import { PokerCard } from './PokerCard.tsx';
import { PokerCardBack } from './PokerCardBack.tsx';

interface GameTableProps {
  room: ClientRoomState;
  connected: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onPerformAction: (
    actionType: PlayerActionType,
    targetStreetBet?: number
  ) => Promise<RoomActionResponse>;
  onReadyNextHand: () => void;
  onSkipDisconnected: (targetPlayerId: string) => void;
  onToggleReady: () => void;
  onReturnToLobby: () => void;
  onLeave: () => void;
  onPlayCardSound: () => void;
  onPlayChipSound: () => void;
  onPlayCheckSound: () => void;
  onPlayTurnSound: () => void;
  onPlayRejectSound: () => void;
  onPlayWinSound: () => void;
}

export function GameTable({
  room,
  connected,
  soundEnabled,
  onToggleSound,
  onPerformAction,
  onReadyNextHand,
  onSkipDisconnected,
  onToggleReady,
  onReturnToLobby,
  onLeave,
  onPlayCardSound,
  onPlayChipSound,
  onPlayCheckSound,
  onPlayTurnSound,
  onPlayRejectSound,
  onPlayWinSound,
}: GameTableProps) {
  const [showRules, setShowRules] = useState(false);
  const [betAmount, setBetAmount] = useState<number>(room.minRaiseTo || room.config.bigBlind);
  const [submitting, setSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const me = room.players.find((p) => p.id === room.myPlayerId);
  const isHost = room.hostId === room.myPlayerId;
  const isMyTurn =
    room.phase === 'playing' &&
    room.handPhase !== 'hand_over' &&
    room.handPhase !== 'all_in_runout' &&
    room.currentPlayerId === room.myPlayerId;

  // Keep bet slider synchronized cleanly when turn or street changes
  useEffect(() => {
    if (isMyTurn && room.canBetOrRaise) {
      setBetAmount(room.minRaiseTo);
    }
  }, [isMyTurn, room.canBetOrRaise, room.minRaiseTo, room.handNumber, room.handPhase, room.currentBet]);

  useEffect(() => {
    if (!actionNotice) return;
    const t = setTimeout(() => setActionNotice(null), 2200);
    return () => clearTimeout(t);
  }, [actionNotice]);

  // Subtle sound cues on state transitions
  const prevTurnRef = useRef<string | null>(null);
  const prevBoardLenRef = useRef<number>(room.communityCards.length);
  const prevHandPhaseRef = useRef(room.handPhase);
  const prevPhaseRef = useRef(room.phase);

  useEffect(() => {
    if (
      (room.handPhase === 'hand_over' && prevHandPhaseRef.current !== 'hand_over') ||
      (room.phase === 'match_over' && prevPhaseRef.current !== 'match_over')
    ) {
      onPlayWinSound();
    }
    prevHandPhaseRef.current = room.handPhase;
    prevPhaseRef.current = room.phase;
  }, [room.handPhase, room.phase, onPlayWinSound]);

  useEffect(() => {
    if (isMyTurn && prevTurnRef.current !== room.myPlayerId) {
      onPlayTurnSound();
    }
    prevTurnRef.current = isMyTurn ? room.myPlayerId : room.currentPlayerId;
  }, [isMyTurn, room.myPlayerId, room.currentPlayerId, onPlayTurnSound]);

  useEffect(() => {
    if (room.communityCards.length > prevBoardLenRef.current) {
      onPlayCardSound();
    }
    prevBoardLenRef.current = room.communityCards.length;
  }, [room.communityCards.length, onPlayCardSound]);

  // Order opponents clockwise starting after me
  const opponents = useMemo(() => {
    const myIdx = room.players.findIndex((p) => p.id === room.myPlayerId);
    if (myIdx === -1) return room.players;
    const ordered = [];
    for (let i = 1; i < room.players.length; i++) {
      ordered.push(room.players[(myIdx + i) % room.players.length]);
    }
    return ordered;
  }, [room.players, room.myPlayerId]);

  const currentPlayer = room.players.find((p) => p.id === room.currentPlayerId);
  const clampedBet = Math.max(
    room.minRaiseTo,
    Math.min(room.maxRaiseTo, Math.round(betAmount || room.minRaiseTo))
  );

  const runAction = async (actionType: PlayerActionType, targetStreetBet?: number) => {
    if (submitting || !isMyTurn) return;
    setSubmitting(true);
    const res = await onPerformAction(actionType, targetStreetBet);
    setSubmitting(false);

    if (!res.ok) {
      setActionNotice(res.error ?? 'Aktion nicht möglich.');
      onPlayRejectSound();
      return;
    }

    if (actionType === 'check') {
      onPlayCheckSound();
    } else if (actionType === 'fold') {
      onPlayCardSound();
    } else {
      onPlayChipSound();
    }
  };

  const quickSizingButtons = useMemo(() => {
    if (!room.canBetOrRaise) return [];
    const potAfterCall = room.potTotal + room.toCall;
    const halfPotRaw =
      room.currentBet === 0
        ? Math.round(room.potTotal * 0.5)
        : Math.round(room.currentBet + potAfterCall * 0.5);
    const potRaw =
      room.currentBet === 0 ? room.potTotal : Math.round(room.currentBet + potAfterCall);

    const clamp = (val: number) =>
      Math.max(room.minRaiseTo, Math.min(room.maxRaiseTo, val));

    return [
      { label: 'Min', amount: room.minRaiseTo },
      { label: '½ Pot', amount: clamp(halfPotRaw) },
      { label: 'Pot', amount: clamp(potRaw) },
      { label: 'All-In', amount: room.maxRaiseTo },
    ];
  }, [room.canBetOrRaise, room.potTotal, room.toCall, room.currentBet, room.minRaiseTo, room.maxRaiseTo]);

  const winningCardSet = useMemo(
    () => new Set(room.handSummary?.winningCardIds ?? []),
    [room.handSummary]
  );
  const winnerSet = useMemo(
    () => new Set(room.handSummary?.winnerIds ?? []),
    [room.handSummary]
  );
  const isShowdownHighlightActive =
    room.handPhase === 'hand_over' &&
    room.handSummary !== null &&
    !room.handSummary.wonByFold &&
    winningCardSet.size > 0;

  const readyHumanCount = room.players.filter(
    (p) => !p.isBot && p.connected && p.chips > 0 && p.readyForNextHand
  ).length;
  const totalActiveHumans = room.players.filter(
    (p) => !p.isBot && p.connected && p.chips > 0
  ).length;

  const myCallIsAllIn = Boolean(me && room.canCall && room.toCall >= me.chips);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between overflow-x-hidden relative">
      {/* Top Bar */}
      <header className="border-b border-white/[0.08] px-4 py-3 sm:px-6 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="font-bold tracking-[-0.03em] text-base">POKER</span>
            <span className="text-zinc-700">|</span>
            <span className="font-mono-code text-xs text-zinc-400">
              {room.roomCode}
            </span>
            <span className="hidden sm:inline text-xs text-zinc-600">•</span>
            <span className="hidden sm:inline text-xs text-zinc-400">
              Hand #{room.handNumber}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] font-mono-code text-zinc-400">
              Blinds {room.config.smallBlind}/{room.config.bigBlind}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 px-2 py-1 rounded-md border border-white/10"
              title={connected ? 'Verbunden' : 'Verbindung unterbrochen'}
            >
              {connected ? (
                <Wifi className="w-3 h-3 text-white" />
              ) : (
                <WifiOff className="w-3 h-3 text-zinc-500" />
              )}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </span>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Ton aus' : 'Ton an'}
              className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowRules((v) => !v)}
              title="Handwertungen & Regeln"
              className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onLeave}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg px-2.5 py-1.5 hover:border-white/25 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Verlassen</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hand Rankings Drawer */}
      {showRules && (
        <div className="border-b border-white/10 bg-[#08080A] px-4 py-3.5 text-xs text-zinc-300 z-20">
          <div className="max-w-5xl mx-auto space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">
                Texas Hold&apos;em Handwertungen (höchste zuerst)
              </span>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="text-white underline underline-offset-4 cursor-pointer"
              >
                Schließen
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {HAND_RANKINGS_GUIDE.map((item) => (
                <div
                  key={item.rank}
                  className="rounded-xl border border-white/[0.08] bg-black/50 px-2.5 py-2"
                >
                  <div className="font-medium text-white">
                    {item.rank}. {item.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{item.example}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Opponents Strip */}
      <section className="px-4 pt-4 sm:px-6 z-10">
        <div className="max-w-5xl mx-auto flex flex-wrap items-stretch justify-center gap-2.5 sm:gap-3">
          {opponents.map((opp) => {
            const isTurn =
              room.phase === 'playing' &&
              room.handPhase !== 'hand_over' &&
              room.handPhase !== 'all_in_runout' &&
              room.currentPlayerId === opp.id;
            const isDealer = room.dealerPlayerId === opp.id;
            const isSB = room.smallBlindPlayerId === opp.id;
            const isBB = room.bigBlindPlayerId === opp.id;
            const isWinner = room.handPhase === 'hand_over' && winnerSet.has(opp.id);
            const revealedCards = room.revealedCardsByPlayer[opp.id] ?? null;
            const revealedEval = room.handSummary?.revealedHands[opp.id]?.evaluated ?? null;
            const dimmed = opp.folded || opp.eliminated;

            return (
              <div
                key={opp.id}
                className={`relative rounded-xl border px-3.5 py-2.5 min-w-[148px] sm:min-w-[168px] transition-all flex flex-col justify-between gap-2 ${
                  isWinner
                    ? 'border-white bg-white/[0.09] shadow-[0_0_24px_rgba(255,255,255,0.14)]'
                    : isTurn
                      ? 'border-white bg-white/[0.07] shadow-[0_0_24px_rgba(255,255,255,0.08)]'
                      : 'border-white/10 bg-[#09090B]'
                } ${dimmed && !isWinner ? 'opacity-45' : 'opacity-100'}`}
              >
                {/* Header: Name + Position Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {opp.isBot ? (
                      <Bot className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    ) : (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          !opp.connected
                            ? 'bg-zinc-600'
                            : isTurn
                              ? 'bg-white animate-pulse'
                              : 'bg-zinc-500'
                        }`}
                      />
                    )}
                    <span className="text-xs font-medium text-white truncate">
                      {opp.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isDealer && (
                      <span
                        title="Dealer Button"
                        className="w-4 h-4 rounded-full bg-white text-black font-mono-code text-[10px] font-bold flex items-center justify-center"
                      >
                        D
                      </span>
                    )}
                    {isSB && (
                      <span className="rounded px-1 py-0.5 text-[9px] font-mono-code border border-white/20 text-zinc-300 leading-none">
                        SB
                      </span>
                    )}
                    {isBB && (
                      <span className="rounded px-1 py-0.5 text-[9px] font-mono-code border border-white/20 text-zinc-300 leading-none">
                        BB
                      </span>
                    )}
                  </div>
                </div>

                {/* Stack & Current Bet */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono-code font-semibold text-white">
                    {formatMoney(opp.chips)}
                  </span>
                  {opp.streetBet > 0 ? (
                    <span className="font-mono-code text-[11px] text-zinc-300 bg-white/[0.08] px-1.5 py-0.5 rounded">
                      +{opp.streetBet}
                    </span>
                  ) : opp.lastActionLabel ? (
                    <span className="text-[10px] text-zinc-400 border border-white/10 px-1.5 py-0.5 rounded">
                      {opp.lastActionLabel}
                    </span>
                  ) : null}
                </div>

                {/* Cards / Status */}
                <div className="flex items-center justify-between gap-2 min-h-[42px]">
                  {revealedCards && revealedCards.length === 2 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-1">
                        {revealedCards.map((c) => (
                          <PokerCard
                            key={c.id}
                            card={c}
                            size="xs"
                            highlighted={isShowdownHighlightActive && winningCardSet.has(c.id)}
                            dimmed={isShowdownHighlightActive && !winningCardSet.has(c.id)}
                          />
                        ))}
                      </div>
                      {revealedEval && (
                        <span className="text-[10px] text-zinc-300 font-medium leading-tight max-w-[72px]">
                          {revealedEval.shortLabelDe}
                        </span>
                      )}
                    </div>
                  ) : opp.hasCards ? (
                    <div className="flex items-center gap-1">
                      <PokerCardBack size="xs" />
                      <PokerCardBack size="xs" />
                    </div>
                  ) : opp.eliminated ? (
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Ausgeschieden
                    </span>
                  ) : opp.folded ? (
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Gepasst
                    </span>
                  ) : null}

                  {!opp.connected && !opp.isBot && (
                    <span className="text-[10px] text-zinc-500">Getrennt</span>
                  )}
                </div>

                {isHost && isTurn && !opp.connected && !opp.isBot && (
                  <button
                    type="button"
                    onClick={() => onSkipDisconnected(opp.id)}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 py-1 text-[10px] text-zinc-300 hover:bg-white hover:text-black transition-colors cursor-pointer"
                  >
                    <SkipForward className="w-3 h-3" />
                    <span>Zug überspringen</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Center Stage: Pot + 5 Community Cards + Showdown / Status */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-5 relative gap-4">
        {/* Pot Display */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="inline-flex items-baseline gap-2.5 rounded-full border border-white/15 bg-[#09090B] px-5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.85)]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Pot
            </span>
            <span className="font-mono-code text-xl sm:text-2xl font-bold text-white">
              {formatMoney(room.potTotal)}
            </span>
          </div>

          {room.pots.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {room.pots.map((pot) => (
                <span
                  key={pot.label}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-mono-code text-zinc-400"
                >
                  {pot.label}: {formatMoney(pot.amount)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 5 Community Card Slots */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          {Array.from({ length: 5 }).map((_, idx) => {
            const card = room.communityCards[idx];
            if (!card) {
              return (
                <div
                  key={`slot-${idx}`}
                  aria-hidden="true"
                  className="w-[76px] h-[110px] sm:w-[92px] sm:h-[134px] rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.015] flex items-center justify-center"
                >
                  <span className="text-[10px] font-mono-code text-zinc-700">
                    {idx < 3 ? 'FLOP' : idx === 3 ? 'TURN' : 'RIVER'}
                  </span>
                </div>
              );
            }
            const isWinCard = isShowdownHighlightActive && winningCardSet.has(card.id);
            const isDimmedCard = isShowdownHighlightActive && !isWinCard;
            return (
              <PokerCard
                key={card.id}
                card={card}
                size="md"
                highlighted={isWinCard}
                dimmed={isDimmedCard}
              />
            );
          })}
        </div>

        {/* Street & Event Status Pill */}
        <div className="flex flex-col items-center gap-2 max-w-md text-center z-10">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-[#09090B] px-4 py-1.5 text-xs">
            <span className="font-medium text-white">
              {getHandPhaseLabelDe(room.handPhase)}
            </span>
            {room.currentBet > 0 && room.handPhase !== 'hand_over' && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="font-mono-code text-zinc-400">
                  Einsatz: <span className="text-white">{formatMoney(room.currentBet)}</span>
                </span>
              </>
            )}
          </div>

          {actionNotice ? (
            <p className="text-xs font-medium text-white bg-white/[0.1] border border-white/25 rounded-full px-3.5 py-1 animate-card-pop">
              {actionNotice}
            </p>
          ) : (
            room.lastEvent && (
              <p className="text-xs text-zinc-400 px-3 leading-relaxed">
                {room.lastEvent.message}
              </p>
            )
          )}
        </div>

        {/* Showdown / Hand Over Inline Banner */}
        {room.phase === 'playing' && room.handPhase === 'hand_over' && room.handSummary && (
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-[#09090B] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl animate-card-pop">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-white">
                {room.handSummary.winnerIds
                  .map((id) => room.players.find((p) => p.id === id)?.name ?? 'Spieler')
                  .join(' & ')}{' '}
                {room.handSummary.winnerIds.length > 1 ? 'teilen' : 'gewinnt'}{' '}
                {formatMoney(room.handSummary.totalPot)}
              </div>
              <div className="text-xs text-zinc-400">
                {room.handSummary.wonByFold
                  ? 'Alle anderen Spieler haben gepasst'
                  : room.handSummary.potResults
                      .map((p) =>
                        room.handSummary!.potResults.length > 1
                          ? `${p.potLabel}: ${p.winningHandLabel ?? ''}`
                          : p.winningHandLabel ?? ''
                      )
                      .join(' • ')}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {me && !me.eliminated && (
                <button
                  type="button"
                  onClick={onReadyNextHand}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    me.readyForNextHand
                      ? 'border border-white/30 bg-white/[0.08] text-white'
                      : 'bg-white text-black hover:bg-zinc-200'
                  }`}
                >
                  {me.readyForNextHand && <Check className="w-3.5 h-3.5" />}
                  <span>
                    Nächste Hand
                    {totalActiveHumans > 1 ? ` (${readyHumanCount}/${totalActiveHumans})` : ''}
                    {room.countdownSeconds !== null ? ` • ${room.countdownSeconds}s` : ''}
                  </span>
                </button>
              )}

              {isHost && (
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                >
                  Lobby
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Area: Turn Indicator + My Hole Cards + Betting Controls */}
      <footer className="px-3 pb-5 pt-2 sm:px-6 z-10">
        <div className="max-w-3xl mx-auto space-y-3.5">
          {/* Turn Status Pill */}
          <div className="flex justify-center">
            <div
              className={`inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-2 text-sm sm:text-base font-semibold tracking-tight transition-all ${
                isMyTurn
                  ? 'bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.2)]'
                  : 'border border-white/15 bg-[#09090B] text-zinc-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isMyTurn ? 'bg-black animate-pulse' : 'bg-zinc-400'
                }`}
              />
              <span>
                {room.handPhase === 'hand_over'
                  ? `Hand #${room.handNumber} beendet`
                  : room.handPhase === 'all_in_runout'
                    ? 'All-In — Karten werden aufgedeckt…'
                    : isMyTurn
                      ? room.toCall > 0
                        ? `Du bist am Zug • ${formatMoney(room.toCall)} zum Mitgehen`
                        : 'Du bist am Zug'
                      : `${currentPlayer?.name ?? '…'} ist am Zug`}
              </span>
            </div>
          </div>

          {/* My Seat + Hole Cards */}
          {me && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* My 2 Hole Cards */}
              <div className="flex items-center justify-center -space-x-2 py-1">
                {room.myHoleCards.length === 2 ? (
                  room.myHoleCards.map((card, i) => {
                    const isWinCard = isShowdownHighlightActive && winningCardSet.has(card.id);
                    const isDimmed =
                      me.folded || (isShowdownHighlightActive && !isWinCard);
                    return (
                      <div
                        key={card.id}
                        style={{
                          transform: `rotate(${i === 0 ? -4 : 4}deg)`,
                        }}
                        className="transition-transform duration-200 hover:-translate-y-1.5"
                      >
                        <PokerCard
                          card={card}
                          size="lg"
                          highlighted={isWinCard}
                          dimmed={isDimmed}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2">
                    <PokerCardBack size="sm" dimmed />
                    <PokerCardBack size="sm" dimmed />
                  </div>
                )}
              </div>

              {/* My Info Card */}
              <div
                className={`rounded-2xl border px-4 py-3 min-w-[220px] space-y-2 ${
                  room.handPhase === 'hand_over' && winnerSet.has(me.id)
                    ? 'border-white bg-white/[0.08]'
                    : 'border-white/12 bg-[#09090B]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white">{me.name}</span>
                    <span className="text-[10px] text-zinc-500">(Du)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {room.dealerPlayerId === me.id && (
                      <span className="w-4 h-4 rounded-full bg-white text-black font-mono-code text-[10px] font-bold flex items-center justify-center">
                        D
                      </span>
                    )}
                    {room.smallBlindPlayerId === me.id && (
                      <span className="rounded px-1 py-0.5 text-[9px] font-mono-code border border-white/20 text-zinc-300 leading-none">
                        SB
                      </span>
                    )}
                    {room.bigBlindPlayerId === me.id && (
                      <span className="rounded px-1 py-0.5 text-[9px] font-mono-code border border-white/20 text-zinc-300 leading-none">
                        BB
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Guthaben
                    </div>
                    <div className="font-mono-code text-base font-bold text-white">
                      {formatMoney(me.chips)}
                    </div>
                  </div>
                  {me.streetBet > 0 && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                        Einsatz
                      </div>
                      <div className="font-mono-code text-sm font-semibold text-zinc-200">
                        {formatMoney(me.streetBet)}
                      </div>
                    </div>
                  )}
                </div>

                {me.eliminated ? (
                  <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-500">
                      Ausgeschieden (keine Chips mehr)
                    </span>
                    {isHost && (
                      <button
                        type="button"
                        onClick={onReturnToLobby}
                        className="text-[11px] text-zinc-300 hover:text-white underline underline-offset-4 cursor-pointer"
                      >
                        Zurück zur Lobby
                      </button>
                    )}
                  </div>
                ) : me.folded ? (
                  <div className="text-[11px] text-zinc-500 pt-1 border-t border-white/[0.06]">
                    Gepasst (Fold)
                  </div>
                ) : room.myEvaluatedHand ? (
                  <div className="text-[11px] text-zinc-300 pt-1 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Hand:</span>
                    <span className="font-medium text-white">
                      {room.myEvaluatedHand.labelDe}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Betting Controls */}
          {isMyTurn && (
            <div className="rounded-2xl border border-white/15 bg-[#09090B] p-3.5 sm:p-4 space-y-3 animate-card-pop">
              {room.canBetOrRaise && (
                <div className="space-y-2.5 pb-2 border-b border-white/[0.08]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {quickSizingButtons.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setBetAmount(preset.amount)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                            clampedBet === preset.amount
                              ? 'bg-white text-black font-semibold'
                              : 'border border-white/15 bg-black text-zinc-300 hover:text-white hover:border-white/35'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={room.minRaiseTo}
                        max={room.maxRaiseTo}
                        value={clampedBet}
                        onChange={(e) => {
                          const v = Number.parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) setBetAmount(v);
                        }}
                        aria-label="Einsatzbetrag"
                        className="w-24 rounded-lg border border-white/15 bg-black px-2.5 py-1 text-xs font-mono-code font-semibold text-white text-right focus:outline-none focus:border-white"
                      />
                      <span className="font-mono-code text-xs text-zinc-400">$</span>
                    </div>
                  </div>

                  {room.maxRaiseTo > room.minRaiseTo && (
                    <input
                      type="range"
                      min={room.minRaiseTo}
                      max={room.maxRaiseTo}
                      step={1}
                      value={clampedBet}
                      onChange={(e) => setBetAmount(Number(e.target.value))}
                      aria-label="Einsatzschieberegler"
                      className="w-full accent-white cursor-pointer"
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void runAction('fold')}
                  className="rounded-xl border border-white/15 bg-black py-3 px-4 text-xs sm:text-sm font-semibold text-zinc-300 hover:border-red-500/50 hover:text-red-400 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Fold (Passen)
                </button>

                {room.canCheck ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void runAction('check')}
                    className="rounded-xl bg-white text-black py-3 px-4 text-xs sm:text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Check
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting || !room.canCall}
                    onClick={() => void runAction('call')}
                    className="rounded-xl bg-white text-black py-3 px-4 text-xs sm:text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {myCallIsAllIn
                      ? `All-In (${formatMoney(room.toCall)})`
                      : `Call (${formatMoney(room.toCall)})`}
                  </button>
                )}

                {room.canBetOrRaise && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      void runAction(
                        clampedBet >= room.maxRaiseTo
                          ? 'all_in'
                          : room.currentBet === 0
                            ? 'bet'
                            : 'raise',
                        clampedBet
                      )
                    }
                    className="col-span-2 sm:col-span-1 rounded-xl border border-white/30 bg-white/[0.1] text-white py-3 px-4 text-xs sm:text-sm font-semibold hover:bg-white hover:text-black disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {clampedBet >= room.maxRaiseTo
                      ? `All-In (${formatMoney(room.maxRaiseTo)})`
                      : room.currentBet === 0
                        ? `Setzen (${formatMoney(clampedBet)})`
                        : `Erhöhen auf ${formatMoney(clampedBet)}`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </footer>

      {room.phase === 'match_over' && (
        <MatchOverModal
          room={room}
          onToggleReady={onToggleReady}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
