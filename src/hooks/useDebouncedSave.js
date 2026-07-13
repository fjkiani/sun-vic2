// useDebouncedSave — coalesces rapid saves into one PATCH request.
//
// Usage:
//   const { queueSave, flushNow, saving, lastSaved, error, conflict } = useDebouncedSave({
//     apiCall: (payload) => api.updateDocument(id, payload),
//     debounceMs: 500,
//   });
//   queueSave({ payload: newPayload });     // merges with any pending save, resets timer.
//   await flushNow();                       // force immediate flush (useful before navigating away).
//
// Behavior:
// - Multiple queueSave() calls within `debounceMs` collapse into one PATCH (last-write-wins for each
//   top-level key; nested `payload` and `locks` objects are shallow-merged too).
// - `saving` is true while a request is in flight.
// - `error` and `conflict` are cleared on success. `conflict` is set separately when the API throws
//   an error with status 409, so the caller can surface a merge dialog / refresh button.
// - `flushNow()` is safe to call from an unmount effect (it doesn't call setState after unmount).

import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebouncedSave({ apiCall, debounceMs = 500 }) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  // Pending payload waiting to be flushed.
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const doFlush = useCallback(async () => {
    if (!pendingRef.current) return null;
    if (inFlightRef.current) {
      // if a request is in flight, wait for it — the next queueSave will re-arm.
      return null;
    }
    const payload = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    inFlightRef.current = true;
    if (mountedRef.current) setSaving(true);
    try {
      const result = await apiCall(payload);
      if (mountedRef.current) {
        setLastSaved(new Date());
        setError(null);
        setConflict(null);
      }
      return result;
    } catch (e) {
      if (mountedRef.current) {
        if (e?.status === 409) {
          setConflict(e);
        } else {
          setError(e);
        }
      }
      throw e;
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
      // if new edits arrived while we were saving, flush them.
      if (pendingRef.current) {
        // small nudge to avoid tight loop; schedule via timer.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { doFlush().catch(() => {}); }, 50);
      }
    }
  }, [apiCall]);

  const mergePending = useCallback((next) => {
    const prev = pendingRef.current || {};
    // shallow merge, deep-merge for payload and locks
    const merged = { ...prev, ...next };
    if (prev.payload || next.payload) {
      merged.payload = { ...(prev.payload || {}), ...(next.payload || {}) };
    }
    if (prev.locks || next.locks) {
      merged.locks = { ...(prev.locks || {}), ...(next.locks || {}) };
    }
    pendingRef.current = merged;
  }, []);

  const queueSave = useCallback((patch) => {
    mergePending(patch);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { doFlush().catch(() => {}); }, debounceMs);
  }, [mergePending, doFlush, debounceMs]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    return doFlush();
  }, [doFlush]);

  const dismissConflict = useCallback(() => setConflict(null), []);
  const dismissError = useCallback(() => setError(null), []);

  return { queueSave, flushNow, saving, lastSaved, error, conflict, dismissConflict, dismissError };
}
