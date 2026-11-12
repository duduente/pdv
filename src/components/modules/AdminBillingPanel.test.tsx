// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AdminBillingPanel } from './AdminBillingPanel';

const fixtures = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { isDemo: true } }) }));
vi.mock('@/lib/adminBilling', async (original) => ({
  ...await original<typeof import('@/lib/adminBilling')>(), loadAdminBilling: fixtures.load, saveAdminBilling: fixtures.save,
}));

it('creates the next month when paid and lets the administrator release its payment codes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  fixtures.load.mockResolvedValue({
    recurring: { enabled: true, dueDay: 10, amount: 100 },
    bills: [{ id: 'current', description: 'Mensalidade', amount: 100, dueDate: `${month}-10`, recurringMonth: month, boletoCode: 'old', pixCode: 'old-pix', paymentType: 'boleto', validUntil: '' }],
  });
  fixtures.save.mockResolvedValue(undefined);
  const establishments = [{ id: 'store', name: 'Teste', monthlyRevenue: 100 }];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AdminBillingPanel establishments={establishments as Parameters<typeof AdminBillingPanel>[0]['establishments']} onUpdateMonthlyRevenue={vi.fn()} />);
  });
  const pay = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Marcar mensalidade paga'));
  expect(pay).toBeTruthy();
  await act(async () => { pay?.click(); });
  expect(fixtures.save).toHaveBeenCalledOnce();
  const saved = fixtures.save.mock.calls[0][1];
  expect(saved.bills).toHaveLength(2);
  expect(saved.bills[0].paidAt).toBeTruthy();
  expect(saved.bills[1]).toMatchObject({ boletoCode: '', pixCode: '' });
  const nextCard = [...container.querySelectorAll('h3')].find((item) => item.textContent === 'Mensalidade recorrente')?.parentElement?.parentElement?.parentElement?.parentElement;
  const edit = nextCard?.querySelector<HTMLButtonElement>('[aria-label="Editar Mensalidade recorrente"]');
  expect(edit).toBeTruthy();
  await act(async () => { edit?.click(); });
  const labels = [...container.querySelectorAll('label')];
  const boleto = labels.find((label) => label.textContent?.includes('Código do boleto'))?.querySelector('input');
  const pix = labels.find((label) => label.textContent?.includes('Chave/código Pix'))?.querySelector('input');
  for (const [input, value] of [[boleto, 'new-boleto'], [pix, 'new-pix']] as const) {
    if (!input) throw new Error('Campo de pagamento não encontrado');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Salvar');
  await act(async () => { save?.click(); });
  expect(fixtures.save).toHaveBeenLastCalledWith('store', expect.objectContaining({
    bills: expect.arrayContaining([expect.objectContaining({ id: saved.bills[1].id, boletoCode: 'new-boleto', pixCode: 'new-pix' })]),
  }), true);
  await act(async () => root.unmount());
  container.remove();
});
