// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PaymentDialog } from './PaymentDialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

it('waits for payment confirmation and prevents duplicate submissions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let resolveSave: ((result: boolean) => void) | undefined;
  const onConfirm = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve; }));
  const onOpenChange = vi.fn();
  await act(async () => {
    root.render(<PaymentDialog open total={100} defaultMethod="pix" onConfirm={onConfirm} onOpenChange={onOpenChange} />);
  });
  const confirm = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Confirmar pagamento'));
  expect(confirm).toBeDefined();
  await act(async () => { confirm?.click(); confirm?.click(); });
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(onOpenChange).not.toHaveBeenCalled();
  await act(async () => { resolveSave?.(false); });
  expect(onOpenChange).not.toHaveBeenCalled();
  await act(async () => { confirm?.click(); });
  await act(async () => { resolveSave?.(true); });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  await act(async () => root.unmount());
  container.remove();
});
