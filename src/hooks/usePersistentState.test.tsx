// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTENT_STATE_ERROR_EVENT, usePersistentState } from './usePersistentState';

const remote = vi.hoisted(() => ({
  read: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { isDemo: false } }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: remote.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: remote.read }) }),
      insert: remote.insert,
      upsert: remote.upsert,
    }),
  },
}));

function TestComponent() {
  const [value, setValue, loaded] = usePersistentState('store-finances:store', { count: 0 });
  return <div>
    <output>{loaded ? value.count : 'carregando'}</output>
    <button onClick={() => setValue({ count: 9 })}>Alterar</button>
    <button onClick={() => setValue((previous) => ({ count: previous.count + 1 }))}>Somar</button>
  </div>;
}

describe('remote persistent state loading', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.localStorage.clear();
    remote.read.mockReset();
    remote.insert.mockReset();
    remote.upsert.mockReset().mockResolvedValue({ error: null });
    remote.rpc.mockReset().mockResolvedValue({ error: null });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not rewrite a loaded remote document until it changes', async () => {
    remote.read.mockResolvedValue({ data: { value: { count: 3 } }, error: null });
    await act(async () => { root.render(<TestComponent />); });
    expect(container.querySelector('output')?.textContent).toBe('3');
    expect(remote.rpc).not.toHaveBeenCalled();
    await act(async () => { container.querySelector('button')?.click(); });
    expect(remote.rpc).toHaveBeenCalledOnce();
    expect(remote.rpc.mock.calls[0][1].operations).toEqual([
      { key: 'store-finances:store', exists: true, expected: { count: 3 }, value: { count: 9 }, write: true },
    ]);
  });

  it('does not overwrite remote data when loading fails', async () => {
    remote.read.mockResolvedValue({ data: null, error: { message: 'sem conexão' } });
    const listener = vi.fn();
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, listener);
    await act(async () => { root.render(<TestComponent />); });
    expect(container.querySelector('output')?.textContent).toBe('carregando');
    expect(listener).toHaveBeenCalledOnce();
    expect(remote.rpc).not.toHaveBeenCalled();
    expect(remote.upsert).not.toHaveBeenCalled();
    window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, listener);
  });

  it('loads the existing record if another client creates it first', async () => {
    remote.read
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { value: { count: 7 } }, error: null });
    remote.rpc.mockResolvedValueOnce({ error: { code: '40001', message: 'duplicate' } });
    await act(async () => { root.render(<TestComponent />); });
    expect(container.querySelector('output')?.textContent).toBe('7');
    expect(remote.rpc).toHaveBeenCalledOnce();
    expect(remote.upsert).not.toHaveBeenCalled();
  });

  it('reports a rejected save request', async () => {
    remote.read.mockResolvedValue({ data: { value: { count: 3 } }, error: null });
    remote.rpc.mockRejectedValue(new Error('conexão interrompida'));
    const listener = vi.fn();
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, listener);
    await act(async () => { root.render(<TestComponent />); });
    await act(async () => { container.querySelector('button')?.click(); });
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail.message).toBe('conexão interrompida');
    window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, listener);
  });

  it('serializes successive changes against the last committed version', async () => {
    remote.read.mockResolvedValue({ data: { value: { count: 3 } }, error: null });
    let finishFirst: ((value: { error: null }) => void) | undefined;
    remote.rpc.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    await act(async () => { root.render(<TestComponent />); });
    await act(async () => { container.querySelector('button')?.click(); });
    await act(async () => { container.querySelectorAll('button')[1].click(); });
    expect(remote.rpc).toHaveBeenCalledOnce();
    await act(async () => { finishFirst?.({ error: null }); });
    expect(remote.rpc).toHaveBeenCalledTimes(2);
    expect(remote.rpc.mock.calls[1][1].operations[0]).toMatchObject({
      expected: { count: 9 }, value: { count: 10 },
    });
  });

  it('stops queued writes after a conflicting save', async () => {
    remote.read.mockResolvedValue({ data: { value: { count: 3 } }, error: null });
    remote.rpc.mockResolvedValueOnce({ error: { code: '40001', message: 'alterado em outro dispositivo' } });
    const listener = vi.fn();
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, listener);
    await act(async () => { root.render(<TestComponent />); });
    await act(async () => { container.querySelector('button')?.click(); });
    await act(async () => { container.querySelectorAll('button')[1].click(); });
    expect(remote.rpc).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, listener);
  });
});
