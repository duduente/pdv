import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Headphones, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  addSupportMessage,
  appendSupportMessage,
  createSupportConversation,
  getKitoAnswer,
  listSupportConversations,
  requestHumanSupport,
  subscribeToLocalSupportChanges,
  waitForKitoResponse,
  type SupportConversation,
} from '@/lib/supportChat';
import { toast } from 'sonner';

export function SupportChat({ establishmentId, establishmentName }: {
  establishmentId: string;
  establishmentName: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [sending, setSending] = useState(false);
  const [kitoTyping, setKitoTyping] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const loadErrorShown = useRef(false);
  const isHuman = Boolean(conversation?.humanRequestedAt);

  const refresh = useCallback(async () => {
    if (!user || user.role === 'super-admin') return;
    try {
      const conversations = await listSupportConversations({
        isDemo: Boolean(user.isDemo),
        isAdmin: false,
        userId: user.id,
        establishmentId,
      });
      setConversation(conversations[0] ?? null);
      loadErrorShown.current = false;
    } catch (error) {
      if (!loadErrorShown.current) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o chat.');
        loadErrorShown.current = true;
      }
    }
  }, [establishmentId, user]);

  useEffect(() => {
    if (!user || user.role === 'super-admin') return;
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 4000);
    const unsubscribe = subscribeToLocalSupportChanges(() => void refresh());
    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [refresh, user]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight });
  }, [conversation?.messages.length, open]);

  if (!user || user.role === 'super-admin') return null;

  const ensureConversation = async () => {
    if (conversation) return conversation;
    const created = await createSupportConversation({
      isDemo: Boolean(user.isDemo),
      establishmentId,
      establishmentName,
      userId: user.id,
      userName: user.displayName,
    });
    setConversation(created);
    return created;
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      const activeConversation = await ensureConversation();
      const sentMessage = await addSupportMessage({
        isDemo: Boolean(user.isDemo),
        conversationId: activeConversation.id,
        sender: 'merchant',
        senderId: user.id,
        senderName: user.displayName,
        body,
      });
      setConversation((current) => current && current.id === activeConversation.id
        ? appendSupportMessage(current, sentMessage)
        : current);
      if (!activeConversation.humanRequestedAt) {
        setKitoTyping(true);
        await waitForKitoResponse();
        await addSupportMessage({
          isDemo: Boolean(user.isDemo),
          conversationId: activeConversation.id,
          sender: 'ai',
          senderId: user.id,
          senderName: 'Kito AI',
          body: getKitoAnswer(body),
        });
      }
      await refresh();
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setKitoTyping(false);
      setSending(false);
    }
  };

  const askForHuman = async () => {
    setSending(true);
    try {
      const activeConversation = await ensureConversation();
      if (activeConversation.humanRequestedAt) return;
      await requestHumanSupport({ isDemo: Boolean(user.isDemo), conversationId: activeConversation.id });
      await addSupportMessage({
        isDemo: Boolean(user.isDemo),
        conversationId: activeConversation.id,
        sender: 'system',
        senderId: user.id,
        senderName: 'Kito PDV',
        body: `${user.displayName} solicitou atendimento humano.`,
      });
      await refresh();
      toast.success('Solicitação enviada ao administrador.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível solicitar atendimento.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <Card className="mb-3 flex h-[min(34rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              {isHuman ? <Headphones className="h-5 w-5 text-primary" /> : <Sparkles className="h-5 w-5 text-primary" />}
              <div>
                <p className="font-semibold">{isHuman ? 'Suporte Humano' : 'Kito AI'}</p>
                <p className="text-xs text-muted-foreground">{establishmentName}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Fechar chat" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>

          <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {!conversation?.messages.length && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  Olá, {user.displayName}! Sou o Kito AI. Pergunte como encontrar ou usar uma parte do aplicativo.
                </div>
              )}
              {conversation?.humanRequestedAt && (
                <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">Esta conversa está com o Suporte Humano.</p>
              )}
              {conversation?.messages.map((message) => (
                <div key={message.id} className={cn(
                  'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                  message.sender === 'merchant' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted',
                  message.sender === 'system' && 'mx-auto max-w-full bg-transparent text-center text-xs text-muted-foreground',
                )}>
                  {message.sender !== 'merchant' && message.sender !== 'system' && <p className="mb-1 text-[11px] font-semibold opacity-75">{message.senderName}</p>}
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </div>
              ))}
              {kitoTyping && !isHuman && (
                <div className="flex w-fit items-center gap-1.5 rounded-lg bg-muted px-3 py-3" role="status" aria-label="Kito AI está digitando">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none"
                      style={{ animationDelay: `${dot * 150}ms` }}
                    />
                  ))}
                  <span className="sr-only">Kito AI está digitando</span>
                </div>
              )}
            </div>
          </div>

          {!isHuman && (
            <div className="border-t px-4 pt-3">
              <Button type="button" variant="outline" size="sm" className="w-full" disabled={sending} onClick={() => void askForHuman()}>
                <Headphones className="mr-2 h-4 w-4" />Falar com humano
              </Button>
            </div>
          )}
          <form onSubmit={(event) => void sendMessage(event)} className="flex gap-2 p-4">
            <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite sua dúvida..." maxLength={1000} aria-label="Mensagem do chat" />
            <Button type="submit" size="icon" aria-label="Enviar mensagem" disabled={!draft.trim() || sending}><Send className="h-4 w-4" /></Button>
          </form>
        </Card>
      )}
      <Button type="button" className="h-12 rounded-full px-5 shadow-lg" onClick={() => setOpen((value) => !value)}>
        {open ? <X className="mr-2 h-4 w-4" /> : <MessageCircle className="mr-2 h-4 w-4" />}
        {open ? 'Fechar' : 'Ajuda'}
      </Button>
    </div>
  );
}
