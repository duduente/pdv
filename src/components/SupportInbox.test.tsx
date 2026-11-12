// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SupportInbox } from './SupportInbox';
import type { SupportConversation } from '@/lib/supportChat';

const fixtures = vi.hoisted(() => ({ list: vi.fn(), mark: vi.fn(), notify: vi.fn(), changed: () => {} }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: admin }) }));
vi.mock('@/lib/supportChat', async (original) => ({
  ...await original<typeof import('@/lib/supportChat')>(),
  listSupportConversations: fixtures.list,
  markSupportConversationSeen: fixtures.mark,
  subscribeToLocalSupportChanges: (callback: () => void) => { fixtures.changed = callback; return () => {}; },
}));
const admin = { id: 'admin', role: 'super-admin', isDemo: true };

it('counts messages in the background and reads only a selected visible conversation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let conversation: SupportConversation = {
    id: 'chat', establishmentId: 'store', establishmentName: 'Loja', userId: 'user', userName: 'Cliente',
    humanRequestedAt: '2026-01-01T10:00:00.000Z', adminSeenAt: null, adminJoinedAt: null, adminTypingAt: null,
    closedAt: null, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
    messages: [{ id: 'one', sender: 'merchant', senderId: 'user', senderName: 'Cliente', body: 'Olá', createdAt: '2026-01-01T10:00:01.000Z', attachment: null }],
  };
  fixtures.list.mockImplementation(async () => [conversation]);
  fixtures.mark.mockImplementation(async ({ seenThrough }: { seenThrough: string }) => {
    conversation = { ...conversation, adminSeenAt: seenThrough };
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (active: boolean) => root.render(<SupportInbox active={active} onUnreadCountChange={fixtures.notify} />);
  await act(async () => render(false));
  expect(fixtures.notify).toHaveBeenLastCalledWith(1);
  expect(fixtures.mark).not.toHaveBeenCalled();
  await act(async () => render(true));
  expect(fixtures.mark).not.toHaveBeenCalled();
  const chat = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Cliente'));
  await act(async () => chat?.click());
  expect(fixtures.mark).toHaveBeenCalledWith(expect.objectContaining({ seenThrough: '2026-01-01T10:00:01.000Z' }));
  expect(fixtures.notify).toHaveBeenLastCalledWith(0);
  await act(async () => render(false));
  conversation = { ...conversation, messages: [...conversation.messages, { ...conversation.messages[0], id: 'two', createdAt: '2026-01-01T10:00:02.000Z' }] };
  await act(async () => fixtures.changed());
  expect(fixtures.notify).toHaveBeenLastCalledWith(1);
  expect(fixtures.mark).toHaveBeenCalledOnce();
  await act(async () => render(true));
  expect(fixtures.mark).toHaveBeenCalledTimes(2);
  expect(fixtures.notify).toHaveBeenLastCalledWith(0);
  await act(async () => root.unmount());
  container.remove();
});
