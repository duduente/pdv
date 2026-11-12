// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { UserManagementPanel } from './UserManagementDialog';
import { StoreUserManagement } from './StoreUserManagement';

const fixtures = vi.hoisted(() => ({
  account: { id: 'user-1', username: 'cliente', displayName: 'Cliente', establishmentIds: ['store'], establishmentPermissions: {} },
  listUsers: vi.fn(), deleteUser: vi.fn(), listStoreUsers: vi.fn(), deleteStoreUser: vi.fn(),
}));
vi.mock('@/store', () => ({ useApp: () => ({ establishments: [] }) }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'super-admin', isDemo: true }, authConfigured: false,
    createUser: vi.fn(), createStoreUser: vi.fn(),
    listUsers: fixtures.listUsers, deleteUser: fixtures.deleteUser,
    listStoreUsers: fixtures.listStoreUsers, deleteStoreUser: fixtures.deleteStoreUser,
  }),
}));

it('opens creation separately and requires confirmation before deleting an account', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixtures.listUsers.mockResolvedValue([fixtures.account]);
  fixtures.deleteUser.mockResolvedValue(undefined);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<UserManagementPanel />));
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
  await act(async () => button('Novo usuário')?.click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain('Criar usuário');
  expect(dialog?.textContent).not.toContain('Usuários cadastrados');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Excluir usuário cliente"]')?.click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('@cliente');
  await act(async () => button('Cancelar')?.click());
  expect(fixtures.deleteUser).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Excluir usuário cliente"]')?.click());
  await act(async () => button('Excluir usuário')?.click());
  expect(fixtures.deleteUser).toHaveBeenCalledOnce();
  expect(fixtures.deleteUser).toHaveBeenCalledWith('user-1');
  expect(container.textContent).not.toContain('@cliente');
  await act(async () => root.unmount());
  container.remove();
});

it('confirms removal of store access separately from deleting an account', async () => {
  fixtures.listStoreUsers.mockResolvedValue([fixtures.account]);
  fixtures.deleteStoreUser.mockResolvedValue(undefined);
  const establishment = { id: 'store', name: 'Loja', modules: {} } as Parameters<typeof StoreUserManagement>[0]['establishment'];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<StoreUserManagement establishment={establishment} />));
  const remove = container.querySelector<HTMLButtonElement>('[aria-label="Remover cliente"]');
  expect(remove).toBeTruthy();
  await act(async () => remove?.click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('loja');
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('a conta também será excluída');
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
  await act(async () => button('Cancelar')?.click());
  expect(fixtures.deleteStoreUser).not.toHaveBeenCalled();
  await act(async () => remove?.click());
  await act(async () => button('Remover acesso')?.click());
  expect(fixtures.deleteStoreUser).toHaveBeenCalledOnce();
  expect(fixtures.deleteStoreUser).toHaveBeenCalledWith('user-1', 'store');
  await act(async () => root.unmount());
  container.remove();
});
