'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function formatElapsedMs(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  }

  return `${minutes}:${ss}`;
}

export type ElapsedTimer = {
  elapsed: string;
  running: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

export function useElapsedTimer(): ElapsedTimer {
  const accumulatedMsRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const startedAt = startedAtRef.current;
      if (startedAt == null) return;
      setElapsedMs(accumulatedMsRef.current + (Date.now() - startedAt));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    setRunning((was) => {
      if (!was) {
        startedAtRef.current = Date.now();
      }
      return true;
    });
  }, []);

  const pause = useCallback(() => {
    const startedAt = startedAtRef.current;
    if (startedAt != null) {
      accumulatedMsRef.current += Date.now() - startedAt;
      startedAtRef.current = null;
      setElapsedMs(accumulatedMsRef.current);
    }
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    setElapsedMs(0);
    setRunning(false);
  }, []);

  return {
    elapsed: formatElapsedMs(elapsedMs),
    running,
    start,
    pause,
    reset,
  };
}
