import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'poker_sound_enabled';

export function useSound() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // ignore storage quota errors
    }
  }, [enabled]);

  const getContext = useCallback((): AudioContext | null => {
    if (!enabled || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctxRef.current) {
      ctxRef.current = new AudioCtx();
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, [enabled]);

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.045) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    },
    [getContext]
  );

  const playCardSound = useCallback(() => {
    playTone(320, 0.055, 'triangle', 0.05);
  }, [playTone]);

  const playChipSound = useCallback(() => {
    playTone(880, 0.04, 'sine', 0.035);
    setTimeout(() => playTone(1180, 0.045, 'sine', 0.03), 35);
  }, [playTone]);

  const playCheckSound = useCallback(() => {
    playTone(210, 0.05, 'triangle', 0.045);
  }, [playTone]);

  const playTurnSound = useCallback(() => {
    playTone(540, 0.1, 'sine', 0.04);
  }, [playTone]);

  const playRejectSound = useCallback(() => {
    playTone(165, 0.07, 'triangle', 0.045);
    setTimeout(() => playTone(135, 0.08, 'triangle', 0.04), 55);
  }, [playTone]);

  const playWinSound = useCallback(() => {
    playTone(523.25, 0.12, 'sine', 0.05);
    setTimeout(() => playTone(659.25, 0.12, 'sine', 0.05), 110);
    setTimeout(() => playTone(783.99, 0.22, 'sine', 0.06), 220);
  }, [playTone]);

  const toggleSound = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  return {
    soundEnabled: enabled,
    toggleSound,
    playCardSound,
    playChipSound,
    playCheckSound,
    playTurnSound,
    playRejectSound,
    playWinSound,
  };
}

