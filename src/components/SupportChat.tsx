import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Headphones, MessageCircle, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SupportAttachmentLink } from '@/components/SupportAttachmentLink';
import { cn } from '@/lib/utils';
import {
  addSupportMessage,
  appendSupportMessage,
  createSupportConversation,
  getSupportAttachmentMimeType,
  getKitoAnswer,
  listSupportConversations,
  requestHumanSupport,
  subscribeToLocalSupportChanges,
  uploadSupportAttachment,
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
  const [file, setFile] = useState<File | null>(null);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [sending, setSending] = useState(false);
  const [kitoTyping, setKitoTyping] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadErrorShown = useRef(false);
  const knownConversation = useRef<{
    id: string;
    messageIds: Set<string>;
    adminJoinedAt: string | null;
    closedAt: string | null;
  } | null>(null);
  const isHuman = Boolean(conversation?.humanRequestedAt && !conversation.closedAt);

  const refresh = useCallback(async () => {
    if (!user || user.role === 'super-admin') return;
    try {
      const conversations = await listSupportConversations({
        isDemo: Boolean(user.isDemo),
        isAdmin: false,
        userId: user.id,
        establishmentId,
      });
      const current = conversations[0] ?? null;
      if (current) {
        const known = knownConversation.current;
        if (known?.id === current.id) {
          if (current.adminJoinedAt && current.adminJoinedAt !== known.adminJoinedAt) {
            toast.info('Um administrador entrou no atendimento.');
          }
          if (current.closedAt && current.closedAt !== known.closedAt) {
            toast.info('O atendimento foi finalizado.');
          }
          if (current.messages.some((message) =>
            message.sender === 'admin' && !known.messageIds.has(message.id),
          )) {
            toast.info('Você recebeu uma resposta da equipe de suporte.');
          }
        }
        knownConversation.current = {
          id: current.id,
          messageIds: new Set(current.messages.map((message) => message.id)),
          adminJoinedAt: current.adminJoinedAt,
          closedAt: current.closedAt,
        };
      } else {
        knownConversation.current = null;
      }
      setConversation(current);
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
    if (conversation && !conversation.closedAt) return conversation;
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
    if ((!body && !file) || sending) return;
    setSending(true);
    setDraft('');
    const selectedFile = file;
    setFile(null);
    try {
      const activeConversation = await ensureConversation();
      const attachment = selectedFile
        ? await uploadSupportAttachment({
            isDemo: Boolean(user.isDemo),
            conversationId: activeConversation.id,
            file: selectedFile,
          })
        : null;
      const sentMessage = await addSupportMessage({
        isDemo: Boolean(user.isDemo),
        conversationId: activeConversation.id,
        sender: 'merchant',
        senderId: user.id,
        senderName: user.displayName,
        body,
        attachment,
      });
      setConversation((current) => current && current.id === activeConversation.id
        ? appendSupportMessage(current, sentMessage)
        : current);
      if (body && (!activeConversation.humanRequestedAt || activeConversation.closedAt)) {
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
      setFile(selectedFile);
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
                <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                  {conversation.closedAt ? 'Este atendimento foi finalizado. Envie uma nova mensagem para iniciar outro.' : 'Esta conversa está com o Suporte Humano.'}
                </p>
              )}
              {conversation?.adminJoinedAt && conversation.humanRequestedAt && (
                <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
                  A equipe de suporte entrou nesta conversa.
                </p>
              )}
              {conversation?.messages.map((message) => (
                <div key={message.id} className={cn(
                  'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                  message.sender === 'merchant' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted',
                  message.sender === 'admin' && 'border border-sky-200 bg-sky-50 text-slate-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-50',
                  message.sender === 'system' && 'mx-auto max-w-full bg-transparent text-center text-xs text-muted-foreground',
                )}>
                  {message.sender !== 'merchant' && message.sender !== 'system' && (
                    <p className="mb-1 text-[11px] font-semibold opacity-75">
                      {message.sender === 'admin' ? 'Equipe de suporte' : message.senderName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  {message.attachment && <SupportAttachmentLink attachment={message.attachment} isDemo={Boolean(user.isDemo)} />}
                </div>
              ))}
              {(kitoTyping && !isHuman) || (
                conversation?.adminTypingAt
                && !conversation.closedAt
                && Date.now() - Date.parse(conversation.adminTypingAt) < 12_000
              ) ? (
                <div className="flex w-fit items-center gap-1.5 rounded-lg bg-muted px-3 py-3" role="status" aria-label={isHuman ? 'Administrador está digitando' : 'Kito AI está digitando'}>
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="typing-dot h-2 w-2 rounded-full bg-muted-foreground"
                      style={{ animationDelay: `${dot * 180}ms` }}
                    />
                  ))}
                  <span className="sr-only">{isHuman ? 'Administrador está digitando' : 'Kito AI está digitando'}</span>
                </div>
              ) : null}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,.pdf,.jpg,.jpeg"
              className="sr-only"
              aria-label="Anexar PDF ou JPEG"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];
                event.target.value = '';
                if (!selectedFile) return;
                try {
                  getSupportAttachmentMimeType(selectedFile);
                  setFile(selectedFile);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Não foi possível anexar o arquivo.');
                }
              }}
            />
            <Button type="button" size="icon" variant="outline" aria-label="Anexar PDF ou JPEG" disabled={sending} onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
            {file && <span className="sr-only" aria-live="polite">Anexo selecionado: {file.name}</span>}
            <Button type="submit" size="icon" aria-label="Enviar mensagem" disabled={(!draft.trim() && !file) || sending}><Send className="h-4 w-4" /></Button>
          </form>
          {file && (
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <span className="truncate">{file.name}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>Remover</Button>
            </div>
          )}
        </Card>
      )}
      <Button type="button" className="h-12 rounded-full px-5 shadow-lg" onClick={() => setOpen((value) => !value)}>
        {open ? <X className="mr-2 h-4 w-4" /> : <MessageCircle className="mr-2 h-4 w-4" />}
        {open ? 'Fechar' : 'Ajuda'}
      </Button>
    </div>
  );
}
