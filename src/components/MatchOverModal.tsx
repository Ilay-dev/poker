import { Check, Trophy } from 'lucide-react';
import type { ClientRoomState } from '../../shared/types.ts';
import { formatMoney } from '../utils/pokerLabels.ts';
import { PokerCard } from './PokerCard.tsx';

interface MatchOverModalProps {
  room: ClientRoomState;
  onToggleReady: () => void;
  onReturnToLobby: () => void;
}

export function MatchOverModal({
  room,
  onToggleReady,
  onReturnToLobby,
}: MatchOverModalProps) {
  const summary = room.matchSummary;
  if (!summary) return null;

  const me = room.players.find((p) => p.id === room.myPlayerId);
  const isHost = room.hostId === room.myPlayerId;
  const readyCount = room.players.filter((p) => p.isReady).length;
  const totalCount = room.players.length;
  const lastHand = room.handSummary;

  return (
    <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#09090B] p-6 shadow-2xl animate-card-pop space-y-6 my-auto">
        {/* Winner Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-400 mb-1">
              <Trophy className="w-3.5 h-3.5 text-white" />
              <span>Spiel beendet • {summary.handsPlayed} Hände</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {summary.winnerName} gewinnt den Tisch!
            </h2>
            {lastHand?.potResults[0]?.winningHandLabel && (
              <p className="text-xs text-zinc-400 mt-1">
                Letzte Hand: {lastHand.potResults[0].winningHandLabel}
              </p>
            )}
          </div>
          <div className="font-mono-code text-right shrink-0">
            <div className="text-xl font-bold text-white">{formatMoney(summary.totalChips)}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Endstand</div>
          </div>
        </div>

        {/* Final Board & Standings */}
        <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
          {room.communityCards.length > 0 && lastHand && !lastHand.wonByFold && (
            <div className="rounded-xl border border-white/10 bg-black/50 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Letztes Board
              </div>
              <div className="flex flex-wrap gap-1.5">
                {room.communityCards.map((card) => (
                  <PokerCard
                    key={card.id}
                    card={card}
                    size="sm"
                    highlighted={lastHand.winningCardIds.includes(card.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {summary.standings.map((row, idx) => {
            const playerObj = room.players.find((p) => p.id === row.id);
            const revealed = lastHand?.revealedHands[row.id];
            return (
              <div
                key={row.id}
                className={`rounded-xl border p-3.5 ${
                  row.id === summary.winnerId
                    ? 'border-white/30 bg-white/[0.05]'
                    : 'border-white/10 bg-black/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-code text-xs text-zinc-500 w-5">
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-medium text-white truncate">
                      {row.name}
                    </span>
                    {playerObj?.isReady && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-white text-black font-semibold px-1.5 py-0.5 rounded-full">
                        <Check className="w-2.5 h-2.5" />
                        Bereit
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono-code text-sm font-semibold text-white">
                      {formatMoney(row.chips)}
                    </span>
                  </div>
                </div>

                {revealed && revealed.cards.length > 0 && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <div className="flex gap-1.5">
                      {revealed.cards.map((card) => (
                        <PokerCard
                          key={card.id}
                          card={card}
                          size="xs"
                          highlighted={lastHand?.winningCardIds.includes(card.id)}
                        />
                      ))}
                    </div>
                    {revealed.evaluated && (
                      <span className="text-[11px] text-zinc-400">
                        {revealed.evaluated.labelDe}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          {room.countdownSeconds !== null ? (
            <div className="rounded-xl bg-white text-black px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm font-semibold">
                Neues Spiel startet in {room.countdownSeconds}…
              </span>
              <button
                type="button"
                onClick={onToggleReady}
                className="text-xs font-semibold border border-black/25 rounded-lg px-2.5 py-1 hover:bg-black/10 cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleReady}
              className={`w-full rounded-xl py-3.5 px-4 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                me?.isReady
                  ? 'border border-white/30 bg-white/[0.08] text-white hover:bg-white/[0.15]'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {me?.isReady ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    Bereit für neues Spiel ({formatMoney(room.config.startingStack)}) ({readyCount}/{totalCount})
                  </span>
                </>
              ) : (
                <span>
                  Neues Spiel ({formatMoney(room.config.startingStack)}) ({readyCount}/{totalCount})
                </span>
              )}
            </button>
          )}

          {isHost && (
            <button
              type="button"
              onClick={onReturnToLobby}
              className="w-full rounded-xl border border-white/12 py-2.5 px-4 text-xs text-zinc-400 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              Zurück in die Lobby (Startgeld &amp; Spieler ändern)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

