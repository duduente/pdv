import { describe, expect, it, vi } from 'vitest';
import {
  appendSupportMessage,
  getKitoAnswer,
  getSupportAttachmentMimeType,
  KITO_RESPONSE_DELAY_MS,
  isSupportConversationExpired,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_INACTIVITY_MS,
  waitForKitoResponse,
  type SupportConversation,
  type SupportMessage,
} from './supportChat';

describe('getKitoAnswer', () => {
  it('does not append a message twice when local sync races the optimistic update', () => {
    const message: SupportMessage = {
      id: 'same-message',
      sender: 'merchant',
      senderId: 'user-1',
      senderName: 'Lojista',
      body: 'Oi',
      createdAt: '2026-11-09T12:00:00.000Z',
      attachment: null,
    };
    const conversation: SupportConversation = {
      id: 'conversation-1',
      establishmentId: 'store-1',
      establishmentName: 'Loja',
      userId: 'user-1',
      userName: 'Lojista',
      humanRequestedAt: null,
      adminSeenAt: null,
      adminJoinedAt: null,
      adminTypingAt: null,
      closedAt: null,
      createdAt: message.createdAt,
      updatedAt: message.createdAt,
      messages: [message],
    };

    expect(appendSupportMessage(conversation, message).messages).toHaveLength(1);
  });

  it('expires human support after 10 minutes without activity but leaves bot chats open', () => {
    const updatedAt = '2026-11-09T12:00:00.000Z';
    const conversation: SupportConversation = {
      id: 'conversation-1',
      establishmentId: 'store-1',
      establishmentName: 'Loja',
      userId: 'user-1',
      userName: 'Lojista',
      humanRequestedAt: updatedAt,
      adminSeenAt: null,
      adminJoinedAt: null,
      adminTypingAt: null,
      closedAt: null,
      createdAt: updatedAt,
      updatedAt,
      messages: [],
    };

    expect(isSupportConversationExpired(conversation, Date.parse(updatedAt) + SUPPORT_INACTIVITY_MS - 1)).toBe(false);
    expect(isSupportConversationExpired(conversation, Date.parse(updatedAt) + SUPPORT_INACTIVITY_MS)).toBe(true);
    expect(isSupportConversationExpired({ ...conversation, humanRequestedAt: null }, Date.now())).toBe(false);
    expect(isSupportConversationExpired({ ...conversation, closedAt: updatedAt }, Date.now())).toBe(false);
  });

  it('accepts PDF and JPEG attachments and rejects unsupported or oversized files', () => {
    expect(getSupportAttachmentMimeType({ name: 'manual.PDF', type: 'application/pdf', size: 100 })).toBe('application/pdf');
    expect(getSupportAttachmentMimeType({ name: 'photo.jpeg', type: 'image/jpeg', size: 100 })).toBe('image/jpeg');
    expect(() => getSupportAttachmentMimeType({ name: 'notes.txt', type: 'text/plain', size: 100 })).toThrow('PDF ou JPEG');
    expect(() => getSupportAttachmentMimeType({ name: 'photo.jpg', type: 'image/png', size: 100 })).toThrow('PDF ou JPEG');
    expect(() => getSupportAttachmentMimeType({ name: 'large.pdf', type: 'application/pdf', size: SUPPORT_ATTACHMENT_MAX_BYTES + 1 })).toThrow('5 MB');
  });

  it('waits about 1.75 seconds before sending an automatic answer', async () => {
    vi.useFakeTimers();
    try {
      let answered = false;
      const response = waitForKitoResponse().then(() => { answered = true; });
      await vi.advanceTimersByTimeAsync(KITO_RESPONSE_DELAY_MS - 1);
      expect(answered).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await response;
      expect(answered).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers common questions about store modules without depending on accents', () => {
    expect(getKitoAnswer('Como edito um produto no ESTOQUE?')).toContain('Estoque');
    expect(getKitoAnswer('onde vejo o relatório em excel?')).toContain('Exportar Excel');
  });

  it('distinguishes changing the store profile photo from cash change', () => {
    expect(getKitoAnswer('Como troco a minha foto de perfil da loja?')).toContain('logo');
    expect(getKitoAnswer('Como calcular o troco da venda?')).toContain('caixa calcula o troco');
    expect(getKitoAnswer('Como que eu faço pra mudar a fotinha da loja?')).toContain('logo');
    expect(getKitoAnswer('Troco')).toContain('Falar com humano');
  });

  it('understands common informal wording and filler words without losing the intent', () => {
    expect(getKitoAnswer('Queria dar uma olhada no que entrou hoje')).toContain('Dashboard');
    expect(getKitoAnswer('Como faço pra puxar o relatório?')).toContain('Frente de Caixa');
    expect(getKitoAnswer('Chegou mercadoria, como boto no sistema?')).toContain('Estoque');
    expect(getKitoAnswer('Como mexo no preço do item?')).toContain('Cardápio');
    expect(getKitoAnswer('Quero colocar dinheiro no caixa')).toContain('Movimentações e extratos');
  });

  it('covers core cash, sales, reporting and inventory workflows', () => {
    expect(getKitoAnswer('Como faço o fechamento de caixa?')).toContain('valor esperado');
    expect(getKitoAnswer('Como cancelo uma venda?')).toContain('motivo obrigatório');
    expect(getKitoAnswer('Quero ver o lucro do mês')).toContain('custos conhecidos');
    expect(getKitoAnswer('Como ajustar o estoque baixo?')).toContain('Estoque');
  });

  it('covers public pages, appointments, menu, commands, delivery and access', () => {
    expect(getKitoAnswer('Como editar um agendamento?')).toContain('Agendamentos');
    expect(getKitoAnswer('Como criar categoria do cardápio?')).toContain('Categorias');
    expect(getKitoAnswer('Como cobrar uma comanda?')).toContain('Frente de Caixa');
    expect(getKitoAnswer('Como marcar pedido pronto para retirada?')).toContain('Delivery');
    expect(getKitoAnswer('Como criar um subusuário?')).toContain('Subusuários');
    expect(getKitoAnswer('Onde pego o link do cardápio público?')).toContain('Cardápio');
  });

  it('explains login and password recovery without claiming unavailable features', () => {
    expect(getKitoAnswer('Como faço login no sistema?')).toContain('e-mail e a senha');
    expect(getKitoAnswer('Esqueci minha senha, como recupero?')).toContain('não tem um botão de “Esqueci minha senha”');
    expect(getKitoAnswer('Minha senha não funciona')).toContain('Fale com o administrador');
    expect(getKitoAnswer('Qual senha para entrar?')).toContain('não envie sua senha pelo chat');
  });

  it('distinguishes store subusers from Super Admin user and establishment management', () => {
    expect(getKitoAnswer('Como crio um subusuário para o funcionário?')).toContain('Subusuários e permissões');
    expect(getKitoAnswer('Como limitar o acesso do funcionário ao caixa?')).toContain('permissões separadas do caixa');
    expect(getKitoAnswer('Como o Super Admin cria usuário para um lojista?')).toContain('Painel Super Admin');
    expect(getKitoAnswer('Como criar um estabelecimento e ativar módulos?')).toContain('módulos disponíveis');
    expect(getKitoAnswer('Como trocar de estabelecimento?')).toContain('outro estabelecimento');
  });

  it('understands questions asking whether users and subusers can be created', () => {
    expect(getKitoAnswer('Eu posso criar outros usuários e subusuários?')).toContain('Sim, você pode criar acessos');
    expect(getKitoAnswer('Dá para criar usuários e subusuários para os funcionários?')).toContain('Subusuários e permissões');
    expect(getKitoAnswer('Posso cadastrar outros usuários?')).toContain('desde que sua conta tenha a permissão necessária');
  });

  it('explains appearance settings and distinguishes them from the system theme', () => {
    expect(getKitoAnswer('Como mudar para o modo escuro?')).toContain('Tema → Claro ou Escuro');
    expect(getKitoAnswer('Como mudar a cor e o logo da loja?')).toContain('Configurações da loja');
  });

  it('explains recurring and manual boleto tracking and its permission', () => {
    expect(getKitoAnswer('Como cadastrar o código do boleto?')).toContain('Finanças');
    expect(getKitoAnswer('Dá para deixar o boleto fixo todo dia 10?')).toContain('cobranças avulsas e recorrentes');
    expect(getKitoAnswer('Como liberar financeiro para um subusuário?')).toContain('Finanças · Boletos e mensalidades');
    expect(getKitoAnswer('Quem cadastra o boleto da mensalidade Kito?')).toContain('somente pelo Super Admin');
  });

  it('asks for clarification for a general help request and escalates unknown questions', () => {
    expect(getKitoAnswer('Preciso de ajuda')).toContain('Posso orientar');
    expect(getKitoAnswer('Olá')).toContain('Que bom falar com você');
    expect(getKitoAnswer('Qual é a previsão do tempo?')).toContain('Falar com humano');
  });

  it('handles everyday conversation in addition to product support', () => {
    expect(getKitoAnswer('Oi, tudo bem?')).toContain('E com você?');
    expect(getKitoAnswer('Valeu pela ajuda!')).toContain('Por nada');
    expect(getKitoAnswer('Qual é o seu nome?')).toContain('Kito AI');
    expect(getKitoAnswer('Qual teu nome?')).toContain('Kito AI');
    expect(getKitoAnswer('Como tu te chama?')).toContain('Kito AI');
    expect(getKitoAnswer('Conta uma piada')).toContain('vírus');
    expect(getKitoAnswer('Que dia é hoje?')).toContain(new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' }));
    expect(getKitoAnswer('Tchau, até mais!')).toContain('Até mais');
  });
});
