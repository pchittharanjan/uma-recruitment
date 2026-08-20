'use client';

import { useEffect, useRef, useState } from 'react';
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
}): { status: DocumentSaveStatus; errorMessage: string } {
  const [status, setStatus] = useState<DocumentSaveStatus>('saved');
  const [errorMessage, setErrorMessage] = useState('');
  const savedRef = useRef<string | null>(null);
  const persistRef = useRef(persist);
  const generationRef = useRef(0);
  const hydratedRef = useRef(false);

  persistRef.current = persist;

  useEffect(() => {
    hydratedRef.current = false;
    savedRef.current = null;
    generationRef.current += 1;
  }, [resetKey]);

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
      void (async () => {
        setStatus('saving');
        try {
          await persistRef.current(snapshot);
          if (generation !== generationRef.current) return;
          savedRef.current = snapshot;
          setStatus('saved');
          setErrorMessage('');
        } catch (error) {
          if (generation !== generationRef.current) return;
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : "Couldn't save");
        }
      })();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [snapshot, ready, enabled, delay]);

  useEffect(() => {
    if (!warnOnLeave || (status !== 'dirty' && status !== 'saving')) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status, warnOnLeave]);

  return { status, errorMessage };
}
