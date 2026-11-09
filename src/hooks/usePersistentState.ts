import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';

const PERSISTENT_STATE_EVENT = 'app:persistent-state-change';

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
): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useAuth();
  const usesRemoteStorage = Boolean(supabase && user && !user.isDemo);
  const isEstablishmentIndex = key === 'establishments';
  const instanceId = useRef(crypto.randomUUID());
  const skipNextPersist = useRef(false);
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  const [storedState, setStoredState] = useState(() => ({
    key,
    value: readValue(key, initialValue),
    loaded: !usesRemoteStorage || isEstablishmentIndex,
  }));
  const isCurrentKey = storedState.key === key;
  const value = isCurrentKey ? storedState.value : initialValue;

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: T; source?: string }>).detail;
      if (detail?.key !== key || detail.source === instanceId.current) return;
      setStoredState((current) => {
        if (current.key === key && current.value === detail.value) return current;
        skipNextPersist.current = true;
        return { key, value: detail.value, loaded: true };
      });
    };
    const handleStorage = (event: StorageEvent) => {
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
  }, [key]);

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
        setStoredState({ key, value: initialValueRef.current, loaded: true });
        return;
      }
      if (data) {
        setStoredState({ key, value: data.value as T, loaded: true });
        return;
      }

      const legacyValue = readValue(key, initialValueRef.current);
      const { error: insertError } = await supabase.from('tenant_records').upsert({
        storage_key: key,
        tenant_id: tenantId,
        value: legacyValue,
      }, { onConflict: 'storage_key' });
      if (active) setStoredState({ key, value: insertError ? initialValueRef.current : legacyValue, loaded: true });
    })();

    return () => { active = false; };
  }, [isEstablishmentIndex, key, usesRemoteStorage]);

  useEffect(() => {
    if (!isCurrentKey || !storedState.loaded) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (usesRemoteStorage && supabase && !isEstablishmentIndex) {
      const separatorIndex = key.indexOf(':');
      if (separatorIndex < 1) return;
      void supabase.from('tenant_records').upsert({
        storage_key: key,
        tenant_id: key.slice(separatorIndex + 1),
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'storage_key' }).then(({ error }) => {
        if (!error) notifyPersistentStateChange(key, value, instanceId.current);
      });
      return;
    }
    if (usesRemoteStorage && isEstablishmentIndex) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable or full; keep the in-memory state usable.
    }
    notifyPersistentStateChange(key, value, instanceId.current);
  }, [isEstablishmentIndex, isCurrentKey, key, storedState.loaded, usesRemoteStorage, value]);

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

  return [value, setValue];
}