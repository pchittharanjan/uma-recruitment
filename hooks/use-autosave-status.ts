'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentSaveStatus } from '@/components/document-save-status';

const DEFAULT_DELAY_MS = 900;

export function useAutosaveStatus({
  snapshot,
  ready,
  resetKey,
  enabled = true,
  warnOnLeave = true,
  delay = DEFAULT_DELAY_MS,
  persist,
}: {
  snapshot: string;
  ready: boolean;
  resetKey?: string | number;
  enabled?: boolean;
  warnOnLeave?: boolean;
  delay?: number;
  persist: (snapshot: string) => Promise<void>;
}): {
  status: DocumentSaveStatus;
  errorMessage: string;
  /** Persist immediately if dirty (Back / Skip / unmount). Set persist=false to only await in-flight. */
  flush: (options?: { persist?: boolean }) => Promise<void>;
} {
  const [status, setStatus] = useState<DocumentSaveStatus>('saved');
  const [errorMessage, setErrorMessage] = useState('');
  const savedRef = useRef<string | null>(null);
  const persistRef = useRef(persist);
  const generationRef = useRef(0);
  const hydratedRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  const readyRef = useRef(ready);
  const inflightRef = useRef<Promise<void> | null>(null);

  persistRef.current = persist;
  snapshotRef.current = snapshot;
  readyRef.current = ready;

  useEffect(() => {
    hydratedRef.current = false;
    savedRef.current = null;
    generationRef.current += 1;
  }, [resetKey]);

  const runPersist = useCallback(async (nextSnapshot: string, generation: number) => {
    setStatus('saving');
    const work = (async () => {
      try {
        await persistRef.current(nextSnapshot);
        if (generation !== generationRef.current) return;
        savedRef.current = nextSnapshot;
        setStatus('saved');
        setErrorMessage('');
      } catch (error) {
        if (generation !== generationRef.current) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : "Couldn't save");
      }
    })();
    inflightRef.current = work;
    try {
      await work;
    } finally {
      if (inflightRef.current === work) inflightRef.current = null;
    }
  }, []);

  const flush = useCallback(
    async (options?: { persist?: boolean }) => {
      const shouldPersist = options?.persist !== false;
      if (shouldPersist && readyRef.current && hydratedRef.current) {
        const current = snapshotRef.current;
        if (current !== savedRef.current) {
          const generation = ++generationRef.current;
          await runPersist(current, generation);
          return;
        }
      } else {
        // Cancel debounced work; caller (e.g. full submit) is about to write.
        generationRef.current += 1;
      }
      if (inflightRef.current) await inflightRef.current;
    },
    [runPersist],
  );

  useEffect(() => {
    if (!ready || !enabled) {
      setStatus('saved');
      return;
    }
    if (!hydratedRef.current) {
      savedRef.current = snapshot;
      hydratedRef.current = true;
      setStatus('saved');
      return;
    }
    if (snapshot === savedRef.current) {
      setStatus('saved');
      return;
    }

    setStatus('dirty');
    const generation = ++generationRef.current;
    const timer = window.setTimeout(() => {
      void runPersist(snapshot, generation);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [snapshot, ready, enabled, delay, runPersist]);

  useEffect(() => {
    if (!warnOnLeave || (status !== 'dirty' && status !== 'saving')) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Best-effort: kick off a save; browsers may still abort in-flight work.
      void flush();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status, warnOnLeave, flush]);

  return { status, errorMessage, flush };
}
