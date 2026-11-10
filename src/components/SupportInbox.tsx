import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Bell, Headphones, Send, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  addSupportMessage,
  listSupportConversations,
  markSupportConversationSeen,
  subscribeToLocalSupportChanges,
  type SupportConversation,
} from '@/lib/supportChat';
import { toast } from 'sonner';

function playAlert() {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.32);
  oscillator.onended = () => { void context.close(); };
}

export function SupportInbox() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const alertInterval = useRef<number | null>(null);
  const loadErrorShown = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'super-admin') return;
    try {
      setConversations(await listSupportConversations({
        isDemo: Boolean(user.isDemo),
        isAdmin: true,
        userId: user.id,
      }));
      loadErrorShown.current = false;
    } catch (error) {
      if (!loadErrorShown.current) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os atendimentos.');
        loadErrorShown.current = true;
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'super-admin') return;
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 4000);
    const unsubscribe = subscribeToLocalSupportChanges(() => void refresh());
    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [refresh, user]);

  const unreadHumanThreads = useMemo(() => conversations.filter((conversation) =>
    conversation.humanRequestedAt
    && (!conversation.adminSeenAt || Date.parse(conversation.adminSeenAt) < Date.parse(conversation.humanRequestedAt)),
  ), [conversations]);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  useEffect(() => {
    if (alertInterval.current !== null) window.clearInterval(alertInterval.current);
    if (unreadHumanThreads.length) {
      playAlert();
      alertInterval.current = window.setInterval(playAlert, 3000);
    }
    return () => {
      if (alertInterval.current !== null) window.clearInterval(alertInterval.current);
      alertInterval.current = null;
    };
  }, [unreadHumanThreads.length]);

  useEffect(() => {
    if (!user || !selected || selected.adminSeenAt) return;
    void markSupportConversationSeen({
      isDemo: Boolean(user.isDemo),
      conversationId: selected.id,
    }).then(() => void refresh()).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível marcar a conversa como lida.');
    });
  }, [refresh, selected, user]);

  if (!user || user.role !== 'super-admin') return null;

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    setDraft('');
    try {
      await addSupportMessage({
        isDemo: Boolean(user.isDemo),
        conversationId: selected.id,
        sender: 'admin',
        senderId: user.id,
        senderName: user.displayName || 'Administrador',
        body,
      });
      await refresh();
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a resposta.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Headphones className="h-5 w-5" />Atendimentos de suporte</h2>
          <p className="text-sm text-muted-foreground">Converse com usuários que solicitaram ajuda humana.</p>
        </div>
        <Badge variant={unreadHumanThreads.length ? 'destructive' : 'secondary'}>
          {unreadHumanThreads.length ? `${unreadHumanThreads.length} aguardando` : `${conversations.filter((item) => item.humanRequestedAt).length} conversas`}
        </Badge>
      </div>
      <div className="grid min-h-[22rem] md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
        <div className="border-b md:border-b-0 md:border-r">
          <ScrollArea className="h-80 md:h-[25rem]">
            {conversations.filter((item) => item.humanRequestedAt).map((conversation) => {
              const isUnread = unreadHumanThreads.some((item) => item.id === conversation.id);
              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                  className={cn('w-full border-b p-4 text-left hover:bg-muted/60', selectedId === conversation.id && 'bg-muted')}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{conversation.userName}</span>
                    {isUnread && <Bell className="h-4 w-4 shrink-0 text-destructive" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{conversation.establishmentName}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.messages.at(-1)?.body ?? 'Solicitou suporte humano'}</span>
                </button>
              );
            })}
            {!conversations.some((item) => item.humanRequestedAt) && <p className="p-5 text-sm text-muted-foreground">Nenhum pedido de suporte humano no momento.</p>}
          </ScrollArea>
        </div>
        <div className="flex h-[25rem] max-h-[calc(100vh-12rem)] min-h-0 min-w-0 flex-col">
          {selected ? (
            <>
              <div className="flex items-center gap-2 border-b p-4">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0"><p className="truncate text-sm font-medium">{selected.userName}</p><p className="truncate text-xs text-muted-foreground">{selected.establishmentName}</p></div>
                <Badge className="ml-auto">Suporte Humano</Badge>
              </div>
              <ScrollArea className="min-h-0 flex-1 p-4">
                <div className="space-y-3">
                  {selected.messages.map((message) => (
                    <div key={message.id} className={cn(
                      'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                      message.sender === 'admin' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted',
                      message.sender === 'system' && 'mx-auto max-w-full bg-transparent text-center text-xs text-muted-foreground',
                    )}>
                      {message.sender !== 'admin' && message.sender !== 'system' && <p className="mb-1 text-[11px] font-semibold opacity-75">{message.senderName}</p>}
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <form onSubmit={(event) => void sendReply(event)} className="flex gap-2 border-t p-4">
                <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Responder ao usuário..." maxLength={1000} aria-label="Resposta do administrador" />
                <Button type="submit" size="icon" aria-label="Enviar resposta" disabled={!draft.trim() || sending}><Send className="h-4 w-4" /></Button>
              </form>
            </>
          ) : <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Selecione uma conversa para responder.</div>}
        </div>
      </div>
    </Card>
  );
}
