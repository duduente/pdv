import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { AtomicRecordError, commitEmployeeRecords, isAtomicEmployeeRecord, type AtomicRecordSnapshot } from '@/lib/atomicEmployeeRecords';

const PERSISTENT_STATE_EVENT = 'app:persistent-state-change';
export const PERSISTENT_STATE_ERROR_EVENT = 'app:persistent-state-error';
export const PERSISTENT_STATE_SAVED_EVENT = 'app:persistent-state-saved';

function notifyPersistentStateError(key: string, message: string) {
  window.dispatchEvent(new CustomEvent(PERSISTENT_STATE_ERROR_EVENT, { detail: { key, message } }));
}

function notifyPersistentStateSaved(key: string) {
  window.dispatchEvent(new CustomEvent(PERSISTENT_STATE_SAVED_EVENT, { detail: { key } }));
}

function notifyPersistentStateChange<T>(key: string, value: T, source: string) {
  window.dispatchEvent(new CustomEvent(PERSISTENT_STATE_EVENT, { detail: { key, value, source } }));
}

export function syncPersistentState<T>(key: string, value: T) {
  notifyPersistentStateChange(key, value, 'external-sync');
}

function readValue<T>(key: string, initialValue: T): T {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue === null ? initialValue : JSON.parse(storedValue) as T;
  } catch {
    return initialValue;
  }
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options?: { readOnly?: boolean },
): [T, Dispatch<SetStateAction<T>>, boolean, AtomicRecordSnapshot<T>] {
  const { user } = useAuth();
  const isReadOnly = options?.readOnly ?? false;
  const usesRemoteStorage = Boolean(supabase && user && !user.isDemo);
  const isEstablishmentIndex = key === 'establishments';
  const instanceId = useRef(crypto.randomUUID());
  const skipNextPersist = useRef(false);
  const atomicSessionRef = useRef({
    key, snapshot: null as AtomicRecordSnapshot<T> | null,
    queue: Promise.resolve(), pending: 0, failed: false,
  });
  if (atomicSessionRef.current.key !== key) {
    atomicSessionRef.current = { key, snapshot: null, queue: Promise.resolve(), pending: 0, failed: false };
  }
  const atomicSession = atomicSessionRef.current;
  const atomicRemote = usesRemoteStorage && isAtomicEmployeeRecord(key);
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  const [storedState, setStoredState] = useState(() => ({
    key,
    value: readValue(key, initialValue),
    loaded: !usesRemoteStorage || isEstablishmentIndex,
  }));
  const isCurrentKey = storedState.key === key;
  const value = isCurrentKey ? storedState.value : initialValue;
  const isLoaded = isCurrentKey && storedState.loaded;

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: T; source?: string }>).detail;
      if (detail?.key !== key || detail.source === instanceId.current) return;
      if (atomicRemote) {
        if (atomicSession.pending > 0) {
          return;
        }
        atomicSession.snapshot = { key, value: detail.value, exists: true };
      }
      setStoredState((current) => {
        if (current.key === key && current.value === detail.value) return current;
        skipNextPersist.current = true;
        return { key, value: detail.value, loaded: true };
      });
    };
    const handleStorage = (event: StorageEvent) => {
      if (usesRemoteStorage) return;
      if (event.key !== key || !event.newValue) return;
      try {
        const newValue = JSON.parse(event.newValue) as T;
        setStoredState((current) => {
          if (current.key === key && current.value === newValue) return current;
          skipNextPersist.current = true;
          return { key, value: newValue, loaded: true };
        });
      } catch {
        // Ignore malformed values written by another tab.
      }
    };
    window.addEventListener(PERSISTENT_STATE_EVENT, handleChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(PERSISTENT_STATE_EVENT, handleChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [atomicRemote, atomicSession, key, usesRemoteStorage]);

  useEffect(() => {
    if (!usesRemoteStorage || !supabase || isEstablishmentIndex) {
      setStoredState((current) => current.key === key && current.loaded
        ? current
        : { key, value: usesRemoteStorage ? initialValueRef.current : readValue(key, initialValueRef.current), loaded: true });
      return;
    }

    let active = true;
    const separatorIndex = key.indexOf(':');
    if (separatorIndex < 1) {
      setStoredState({ key, value: initialValueRef.current, loaded: true });
      return;
    }
    const tenantId = key.slice(separatorIndex + 1);
    setStoredState((current) => current.key === key
      ? current.loaded ? { ...current, loaded: false } : current
      : { key, value: initialValueRef.current, loaded: false });

    void (async () => {
      const { data, error } = await supabase
        .from('tenant_records')
        .select('value')
        .eq('storage_key', key)
        .maybeSingle();
      if (!active) return;
      if (error) {
        notifyPersistentStateError(key, error.message);
        return;
      }
      if (data) {
        atomicSession.snapshot = { key, value: data.value as T, exists: true };
        skipNextPersist.current = true;
        setStoredState({ key, value: data.value as T, loaded: true });
        return;
      }

      const legacyValue = readValue(key, initialValueRef.current);
      if (isReadOnly) {
        atomicSession.snapshot = { key, value: initialValueRef.current, exists: false };
        skipNextPersist.current = true;
        setStoredState({ key, value: initialValueRef.current, loaded: true });
        return;
      }
      if (atomicRemote) {
        try {
          await commitEmployeeRecords(tenantId, [{
            snapshot: { key, value: legacyValue, exists: false }, value: legacyValue, write: true,
          }]);
        } catch (insertError) {
          if (!(insertError instanceof AtomicRecordError) || insertError.code !== '40001') {
            if (active) notifyPersistentStateError(key, insertError instanceof Error ? insertError.message : 'Falha ao criar o registro.');
            return;
          }
          const { data: existing, error: readError } = await supabase
            .from('tenant_records').select('value').eq('storage_key', key).maybeSingle();
          if (!active) return;
          if (readError || !existing) {
            notifyPersistentStateError(key, readError?.message ?? (insertError instanceof Error ? insertError.message : 'Falha ao criar o registro.'));
            return;
          }
          atomicSession.snapshot = { key, value: existing.value as T, exists: true };
          skipNextPersist.current = true;
          setStoredState({ key, value: existing.value as T, loaded: true });
          return;
        }
        if (!active) return;
        atomicSession.snapshot = { key, value: legacyValue, exists: true };
        skipNextPersist.current = true;
        setStoredState({ key, value: legacyValue, loaded: true });
        return;
      }
      const { error: insertError } = await supabase.from('tenant_records').insert({
        storage_key: key,
        tenant_id: tenantId,
        value: legacyValue,
      });
      if (!active) return;
      if (insertError?.code === '23505') {
        const { data: existing, error: readError } = await supabase
          .from('tenant_records')
          .select('value')
          .eq('storage_key', key)
          .maybeSingle();
        if (!active) return;
        if (readError || !existing) {
          notifyPersistentStateError(key, readError?.message ?? 'Registro existente não está acessível.');
          return;
        }
        skipNextPersist.current = true;
        setStoredState({ key, value: existing.value as T, loaded: true });
        return;
      }
      if (insertError) {
        notifyPersistentStateError(key, insertError.message);
        return;
      }
      skipNextPersist.current = true;
      setStoredState({ key, value: legacyValue, loaded: true });
    })().catch((error: unknown) => {
      if (active) notifyPersistentStateError(key, error instanceof Error ? error.message : 'Falha ao carregar os dados.');
    });

    return () => { active = false; };
  }, [atomicRemote, atomicSession, isEstablishmentIndex, isReadOnly, key, usesRemoteStorage]);

  useEffect(() => {
    if (isReadOnly) return;
    if (!isCurrentKey || !storedState.loaded) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (usesRemoteStorage && supabase && !isEstablishmentIndex) {
      const separatorIndex = key.indexOf(':');
      if (separatorIndex < 1) return;
      if (atomicRemote) {
        atomicSession.pending += 1;
        atomicSession.queue = atomicSession.queue.then(async () => {
          if (atomicSession.failed) return;
          if (!atomicSession.snapshot) throw new Error('Os dados ainda não foram carregados.');
          await commitEmployeeRecords(key.slice(separatorIndex + 1), [{
            snapshot: atomicSession.snapshot, value, write: true,
          }]);
          atomicSession.snapshot = { key, value, exists: true };
          notifyPersistentStateChange(key, value, instanceId.current);
          notifyPersistentStateSaved(key);
        }).catch((error: unknown) => {
          atomicSession.failed = true;
          notifyPersistentStateError(key, error instanceof Error ? error.message : 'Falha ao salvar os dados.');
        }).finally(() => { atomicSession.pending -= 1; });
        return;
      }
      void supabase.from('tenant_records').upsert({
        storage_key: key,
        tenant_id: key.slice(separatorIndex + 1),
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'storage_key' }).then(({ error }) => {
        if (error) notifyPersistentStateError(key, error.message);
        else {
          notifyPersistentStateChange(key, value, instanceId.current);
          notifyPersistentStateSaved(key);
        }
      }, (error: unknown) => {
        notifyPersistentStateError(key, error instanceof Error ? error.message : 'Falha ao salvar os dados.');
      });
      return;
    }
    if (usesRemoteStorage && isEstablishmentIndex) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      notifyPersistentStateChange(key, value, instanceId.current);
      notifyPersistentStateSaved(key);
    } catch {
      notifyPersistentStateError(key, 'O armazenamento local está indisponível ou sem espaço.');
    }
  }, [atomicRemote, atomicSession, isEstablishmentIndex, isCurrentKey, isReadOnly, key, storedState.loaded, usesRemoteStorage, value]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    setStoredState((currentState) => {
      const currentValue = currentState.key === key
        ? currentState.value
        : usesRemoteStorage ? initialValue : readValue(key, initialValue);

      return {
        key,
        value: typeof nextValue === 'function'
          ? (nextValue as (previousValue: T) => T)(currentValue)
          : nextValue,
        loaded: currentState.key === key ? currentState.loaded : !usesRemoteStorage,
      };
    });
  }, [initialValue, key, usesRemoteStorage]);

  return [value, setValue, isLoaded, atomicSession.snapshot ?? { key, value, exists: false }];
}