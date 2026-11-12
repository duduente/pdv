// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FinanceModule } from './FinanceModule';

const fixtures = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/store', () => ({ useApp: () => ({ selectedEstablishment: { id: 'store', name: 'Teste' } }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { isDemo: true } }) }));
vi.mock('@/lib/adminBilling', async (original) => ({ ...await original<typeof import('@/lib/adminBilling')>(), loadAdminBilling: fixtures.load }));
vi.mock('@/hooks/usePersistentState', () => ({
  PERSISTENT_STATE_ERROR_EVENT: 'app:persistent-state-error',
  usePersistentState: (_key: string, initial: unknown) => [initial, vi.fn(), true],
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TabsContent: ({ children, value }: { children: ReactNode; value: string }) => value === 'kito' ? <div>{children}</div> : null,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

it('shows a next monthly bill with disabled payment icons and opens available payment details', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixtures.load.mockResolvedValue({
    recurring: { enabled: true, dueDay: 10, amount: 100 },
    bills: [
      { id: 'old', description: 'Mensalidade', amount: 100, dueDate: '2026-01-10', recurringMonth: '2026-01', boletoCode: 'old-code', paidAt: '2026-01-10', validUntil: '' },
      { id: 'extra', description: 'Cobrança avulsa', amount: 50, dueDate: '2026-02-10', boletoCode: 'secret-code', pixCode: 'secret-pix', validUntil: '' },
    ],
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<FinanceModule />); });
  expect(container.textContent).toContain('fevereiro de 2026');
  const next = [...container.querySelectorAll('h3')].find((item) => item.textContent === 'Mensalidade recorrente')?.parentElement?.parentElement;
  expect(next).toBeTruthy();
  expect(next?.querySelector<HTMLButtonElement>('[aria-label="Boleto indisponível"]')?.disabled).toBe(true);
  expect(next?.querySelector<HTMLButtonElement>('[aria-label="Pix indisponível"]')?.disabled).toBe(true);
  expect(container.textContent).not.toContain('secret-code');
  expect(container.textContent).not.toContain('secret-pix');
  const available = container.querySelector<HTMLButtonElement>('[aria-label="Boleto disponível"]');
  expect(available?.className).toContain('text-emerald');
  await act(async () => { available?.click(); });
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain('secret-code');
  const pix = container.querySelector<HTMLButtonElement>('[aria-label="Pix disponível"]');
  expect(pix?.className).toContain('text-emerald');
  await act(async () => { pix?.click(); });
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain('secret-pix');
  await act(async () => root.unmount());
  container.remove();
});
