import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRoomState } from '../shared/types.js';
import { BrowserHostManager } from '../src/p2p/hostManager.js';

describe('BrowserHostManager (Serverless P2P Poker Host)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses custom starting stack at creation, updates in lobby, starts hand, and isolates hole cards', () => {
    vi.useFakeTimers();

    const latestViews = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'PKR123',
      'HostUser',
      2500,
      (peerId, state) => {
        latestViews.set(peerId, state);
      },
      () => {}
    );

    expect(manager.room.config.startingStack).toBe(2500);
    expect(manager.room.config.smallBlind).toBe(25);
    expect(manager.room.config.bigBlind).toBe(50);

    const joinRes = manager.joinGuest('peer-guest-1', 'GuestUser');
    expect(joinRes.ok).toBe(true);

    // Host updates starting money in lobby to 5000
    const cfgRes = manager.handleAction('HOST_LOCAL', 'room:set_config', {
      startingStack: 5000,
    });
    expect(cfgRes.ok).toBe(true);
    expect(manager.room.config.startingStack).toBe(5000);
    expect(manager.room.config.bigBlind).toBe(100);

    manager.handleAction('HOST_LOCAL', 'room:toggle_ready');
    manager.handleAction('peer-guest-1', 'room:toggle_ready');

    expect(manager.room.countdownSeconds).toBe(2);
    vi.advanceTimersByTime(2100);

    expect(manager.room.phase).toBe('playing');
    const hostView = latestViews.get('HOST_LOCAL')!;
    const guestView = latestViews.get('peer-guest-1')!;

    expect(hostView.myHoleCards).toHaveLength(2);
    expect(guestView.myHoleCards).toHaveLength(2);
    expect(hostView.myHoleCards).not.toEqual(guestView.myHoleCards);
    expect(hostView.revealedCardsByPlayer).toEqual({});
    expect(hostView.potTotal).toBe(150); // 50 + 100 blinds from 5000 stack

    manager.destroy();
  });

  it('plays an all-in heads-up hand through runout to match_over when one player busts', () => {
    vi.useFakeTimers();

    const latestViews = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'ALLIN1',
      'Host',
      500,
      (peerId, state) => {
        latestViews.set(peerId, state);
      },
      () => {}
    );

    manager.joinGuest('peer-guest-1', 'Guest');
    manager.handleAction('HOST_LOCAL', 'room:toggle_ready');
    manager.handleAction('peer-guest-1', 'room:toggle_ready');
    vi.advanceTimersByTime(2100);

    // Host is Dealer/SB in Heads-Up and acts first
    const allInRes = manager.handleAction('HOST_LOCAL', 'game:action', {
      actionType: 'all_in',
    });
    expect(allInRes.ok).toBe(true);

    const callRes = manager.handleAction('peer-guest-1', 'game:action', {
      actionType: 'call',
    });
    expect(callRes.ok).toBe(true);

    // Should be in all_in_runout with both players' cards revealed
    const midView = latestViews.get('HOST_LOCAL')!;
    expect(midView.handPhase).toBe('all_in_runout');
    expect(Object.keys(midView.revealedCardsByPlayer)).toHaveLength(2);

    // Advance runout (Flop -> Turn -> River/Showdown)
    vi.advanceTimersByTime(3200);

    const endView = latestViews.get('HOST_LOCAL')!;
    const someoneWonMatch = endView.phase === 'match_over';
    const splitPot = endView.phase === 'playing' && endView.handPhase === 'hand_over';
    expect(someoneWonMatch || splitPot).toBe(true);

    manager.destroy();
  });

  it('rotates dealer button across consecutive hands, handles bots, and returns cleanly to lobby', () => {
    vi.useFakeTimers();

    const latestViews = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'BOT999',
      'Alex',
      1000,
      (peerId, state) => {
        latestViews.set(peerId, state);
      },
      () => {}
    );

    expect(manager.handleAction('HOST_LOCAL', 'room:add_bot').ok).toBe(true);
    expect(manager.room.players).toHaveLength(2);
    expect(manager.room.players[1].isBot).toBe(true);

    manager.handleAction('HOST_LOCAL', 'room:toggle_ready');
    vi.advanceTimersByTime(2100);

    const hand1View = latestViews.get('HOST_LOCAL')!;
    expect(hand1View.phase).toBe('playing');
    expect(hand1View.handNumber).toBe(1);
    const firstDealerId = hand1View.dealerPlayerId;
    expect(firstDealerId).toBe(manager.getHostPlayerId());

    // Host folds Hand #1 -> Bot wins blinds -> hand_over with 6s countdown
    expect(
      manager.handleAction('HOST_LOCAL', 'game:action', { actionType: 'fold' }).ok
    ).toBe(true);

    const hand1End = latestViews.get('HOST_LOCAL')!;
    expect(hand1End.handPhase).toBe('hand_over');
    expect(hand1End.handSummary?.wonByFold).toBe(true);
    expect(hand1End.countdownSeconds).toBe(6);

    // Host clicks "Nächste Hand" to skip countdown immediately
    expect(manager.handleAction('HOST_LOCAL', 'game:ready_next_hand').ok).toBe(true);

    const hand2View = latestViews.get('HOST_LOCAL')!;
    expect(hand2View.handNumber).toBe(2);
    expect(hand2View.dealerPlayerId).not.toBe(firstDealerId);

    // Bot is Dealer/SB in Hand #2 and acts first after 850ms timer
    expect(hand2View.currentPlayerId).toBe(manager.room.players[1].id);
    vi.advanceTimersByTime(900);
    const afterBotView = latestViews.get('HOST_LOCAL')!;
    expect(
      afterBotView.currentPlayerId === manager.getHostPlayerId() ||
        afterBotView.handPhase === 'hand_over'
    ).toBe(true);

    // Host returns to Lobby
    expect(manager.handleAction('HOST_LOCAL', 'room:next_round').ok).toBe(true);
    const backInLobby = latestViews.get('HOST_LOCAL')!;
    expect(backInLobby.phase).toBe('lobby');
    expect(backInLobby.players.every((p) => p.chips === 1000)).toBe(true);

    manager.destroy();
  });
});

