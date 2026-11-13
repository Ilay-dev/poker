import { useEffect, useState } from 'react';
import { Bot, Check, Coins, Copy, Link2, LogOut, UserMinus, Users, Wifi } from 'lucide-react';
import {
  clampStartingStack,
  MAX_STARTING_STACK,
  MIN_STARTING_STACK,
} from '../../shared/gameEngine.ts';
import type { ClientRoomState } from '../../shared/types.ts';
import { formatMoney, STARTING_STACK_PRESETS } from '../utils/pokerLabels.ts';

interface LobbyScreenProps {
  room: ClientRoomState;
  connected: boolean;
  onToggleReady: () => void;
  onSetTableConfig: (startingStack: number, smallBlind?: number) => void;
  onAddBot: () => void;
  onRemovePlayer: (targetPlayerId: string) => void;
  onLeave: () => void;
}

export function LobbyScreen({
  room,
  connected,
  onToggleReady,
  onSetTableConfig,
  onAddBot,
  onRemovePlayer,
  onLeave,
}: LobbyScreenProps) {
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [customStack, setCustomStack] = useState<string>(String(room.config.startingStack));

  useEffect(() => {
    setCustomStack(String(room.config.startingStack));
  }, [room.config.startingStack]);

  const me = room.players.find((p) => p.id === room.myPlayerId);
  const isHost = room.hostId === room.myPlayerId;
  const readyCount = room.players.filter((p) => p.isReady).length;
  const totalCount = room.players.length;

  const copyText = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const inviteUrl = (() => {
    if (typeof window === 'undefined') return room.roomCode;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', room.roomCode);
    return url.toString();
  })();

  const applyCustomStack = () => {
    const parsed = Number.parseInt(customStack, 10);
    const clean = clampStartingStack(
      Number.isFinite(parsed) ? parsed : room.config.startingStack
    );
    setCustomStack(String(clean));
    if (clean !== room.config.startingStack) {
      onSetTableConfig(clean);
    }
  };

  const blindPresets = (() => {
    const baseSb = Math.max(1, Math.round(room.config.startingStack / 100));
    const lowSb = Math.max(1, Math.round(room.config.startingStack / 200));
    const turboSb = Math.max(1, Math.round(room.config.startingStack / 50));
    const candidates = [lowSb, baseSb, turboSb].filter(
      (sb, idx, arr) => sb * 2 <= room.config.startingStack && arr.indexOf(sb) === idx
    );
    return candidates;
  })();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="max-w-2xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-bold tracking-[-0.03em]">POKER</span>
          <span className="text-zinc-700">/</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <Wifi className={`w-3.5 h-3.5 ${connected ? 'text-white' : 'text-zinc-600'}`} />
            {connected ? 'Verbunden' : 'Verbinde…'}
          </span>
        </div>

        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white rounded-lg px-2.5 py-1.5 hover:bg-white/[0.05] transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Verlassen</span>
        </button>
      </header>

      {/* Main Lobby Card */}
      <main className="max-w-2xl w-full mx-auto my-auto py-8 space-y-5">
        {/* Room Code & Share Panel */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#08080A] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1">
              Room-Code
            </div>
            <div className="font-mono-code text-3xl sm:text-4xl font-bold tracking-[0.22em] text-white">
              {room.roomCode}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyText(room.roomCode, 'code')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
            >
              {copiedType === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'code' ? 'Code kopiert' : 'Code kopieren'}</span>
            </button>

            <button
              type="button"
              onClick={() => copyText(inviteUrl, 'link')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-black px-3.5 py-2 text-xs font-semibold hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              {copiedType === 'link' ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{copiedType === 'link' ? 'Link kopiert' : 'Invite-Link kopieren'}</span>
            </button>
          </div>
        </section>

        {/* Starting Money & Blinds Panel */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#08080A] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Coins className="w-3.5 h-3.5 text-zinc-300" />
                <span>Startgeld &amp; Blinds</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Jeder Spieler startet mit{' '}
                <span className="font-mono-code font-semibold text-white">
                  {formatMoney(room.config.startingStack)}
                </span>{' '}
                · Small / Big Blind:{' '}
                <span className="font-mono-code font-semibold text-zinc-300">
                  {room.config.smallBlind} / {room.config.bigBlind} $
                </span>
              </p>
            </div>

            {isHost && (
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={MIN_STARTING_STACK}
                  max={MAX_STARTING_STACK}
                  step={50}
                  value={customStack}
                  onChange={(e) => setCustomStack(e.target.value)}
                  onBlur={applyCustomStack}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomStack();
                  }}
                  aria-label="Startgeld"
                  className="w-28 rounded-xl border border-white/10 bg-black px-3 py-1.5 text-xs font-mono-code font-semibold text-white focus:outline-none focus:border-white/60"
                />
                <button
                  type="button"
                  onClick={applyCustomStack}
                  className="rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white hover:text-black transition-colors cursor-pointer"
                >
                  Übernehmen
                </button>
              </div>
            )}
          </div>

          {isHost && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.05]">
              <div className="flex flex-wrap gap-1.5">
                {STARTING_STACK_PRESETS.map((preset) => {
                  const active = room.config.startingStack === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onSetTableConfig(preset)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-mono-code transition-all cursor-pointer ${
                        active
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.09]'
                      }`}
                    >
                      {formatMoney(preset)}
                    </button>
                  );
                })}
              </div>

              {blindPresets.length > 1 && (
                <div className="inline-flex items-center gap-1 rounded-xl bg-black/80 p-1 self-start sm:self-center">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 px-2">
                    Blinds
                  </span>
                  {blindPresets.map((sb) => {
                    const active = room.config.smallBlind === sb;
                    return (
                      <button
                        key={sb}
                        type="button"
                        onClick={() => onSetTableConfig(room.config.startingStack, sb)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-mono-code transition-all cursor-pointer ${
                          active
                            ? 'bg-white text-black font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {sb}/{sb * 2}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Players List */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#08080A] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Users className="w-4 h-4 text-zinc-400" />
              <span>Spieler ({totalCount}/10)</span>
            </div>

            {isHost && totalCount < 10 && (
              <button
                type="button"
                onClick={onAddBot}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-white/[0.05] rounded-lg px-2.5 py-1 hover:bg-white/[0.1] transition-colors cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>+ Bot</span>
              </button>
            )}
          </div>

          <ul className="divide-y divide-white/[0.06]">
            {room.players.map((player) => {
              const isMe = player.id === room.myPlayerId;
              return (
                <li
                  key={player.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full border border-white/15 bg-white/[0.04] flex items-center justify-center text-xs font-semibold text-white shrink-0">
                      {player.isBot ? (
                        <Bot className="w-4 h-4 text-zinc-300" />
                      ) : (
                        player.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">
                          {player.name}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                            (Du)
                          </span>
                        )}
                        {player.isHost && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider border border-white/25 text-white px-1.5 py-0.5 rounded">
                            Host
                          </span>
                        )}
                        {!player.connected && !player.isBot && (
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500 border border-white/10 px-1.5 py-0.5 rounded">
                            Getrennt
                          </span>
                        )}
                      </div>
                      <div className="font-mono-code text-[11px] text-zinc-500 mt-0.5">
                        Startgeld: {formatMoney(room.config.startingStack)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        player.isReady
                          ? 'bg-white text-black'
                          : 'border border-white/15 text-zinc-400'
                      }`}
                    >
                      {player.isReady && <Check className="w-3 h-3" />}
                      <span>{player.isReady ? 'Bereit' : 'Wartet'}</span>
                    </span>

                    {isHost && !isMe && (
                      <button
                        type="button"
                        onClick={() => onRemovePlayer(player.id)}
                        title="Aus dem Room entfernen"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Ready Bar & Status */}
        <section className="space-y-3">
          {room.countdownSeconds !== null ? (
            <div className="rounded-2xl border border-white/40 bg-white text-black px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Alle Spieler sind bereit!</div>
                <div className="text-xs text-zinc-700">Spiel startet in {room.countdownSeconds}…</div>
              </div>
              <button
                type="button"
                onClick={onToggleReady}
                className="text-xs font-semibold border border-black/25 rounded-lg px-3 py-1.5 hover:bg-black/10 transition-colors cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleReady}
              className={`w-full rounded-2xl py-4 px-5 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                me?.isReady
                  ? 'border border-white/30 bg-white/[0.08] text-white hover:bg-white/[0.14]'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {me?.isReady ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Du bist bereit (Klick zum Zurücksetzen)</span>
                </>
              ) : (
                <span>Bereit machen</span>
              )}
            </button>
          )}

          <p className="text-center text-xs text-zinc-500">
            {totalCount < 2
              ? 'Mindestens 2 Spieler nötig — teile den Room-Code oder Invite-Link mit Freunden.'
              : `${readyCount} von ${totalCount} Spielern bereit — startet automatisch, sobald alle bereit sind.`}
          </p>
        </section>
      </main>
    </div>
  );
}

