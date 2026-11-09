import { supabase } from '@/lib/supabase';

export type SupportSender = 'merchant' | 'ai' | 'admin' | 'system';
export const KITO_RESPONSE_DELAY_MS = 1750;

export function waitForKitoResponse() {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, KITO_RESPONSE_DELAY_MS));
}

export interface SupportMessage {
  id: string;
  sender: SupportSender;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface SupportConversation {
  id: string;
  establishmentId: string;
  establishmentName: string;
  userId: string;
  userName: string;
  humanRequestedAt: string | null;
  adminSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
}

export function appendSupportMessage(conversation: SupportConversation, message: SupportMessage): SupportConversation {
  if (conversation.messages.some((existing) => existing.id === message.id)) return conversation;
  return { ...conversation, messages: [...conversation.messages, message] };
}

const LOCAL_KEY = 'kito-support-conversations';
const SUPPORT_EVENT = 'kito:support-conversations-changed';

function isRemote(userIsDemo: boolean) {
  return Boolean(supabase && !userIsDemo);
}

function readLocal(): SupportConversation[] {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? '[]') as SupportConversation[];
  } catch {
    return [];
  }
}

function writeLocal(conversations: SupportConversation[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(conversations));
  window.dispatchEvent(new Event(SUPPORT_EVENT));
}

function fromMessageRow(row: Record<string, unknown>): SupportMessage {
  return {
    id: String(row.id),
    sender: row.sender_kind as SupportSender,
    senderId: String(row.sender_id ?? ''),
    senderName: String(row.sender_name),
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

function fromConversationRow(row: Record<string, unknown>, messages: SupportMessage[]): SupportConversation {
  return {
    id: String(row.id),
    establishmentId: String(row.establishment_id),
    establishmentName: String(row.establishment_name),
    userId: String(row.user_id),
    userName: String(row.user_name),
    humanRequestedAt: row.human_requested_at ? String(row.human_requested_at) : null,
    adminSeenAt: row.admin_seen_at ? String(row.admin_seen_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    messages,
  };
}

export function subscribeToLocalSupportChanges(listener: () => void) {
  window.addEventListener(SUPPORT_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(SUPPORT_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export async function listSupportConversations(input: {
  isDemo: boolean;
  isAdmin: boolean;
  userId: string;
  establishmentId?: string;
}): Promise<SupportConversation[]> {
  if (!isRemote(input.isDemo) || !supabase) {
    return readLocal().filter((conversation) =>
      input.isAdmin
        ? true
        : conversation.userId === input.userId && conversation.establishmentId === input.establishmentId,
    );
  }

  let conversationQuery = supabase.from('support_conversations').select('*');
  if (!input.isAdmin) {
    if (!input.establishmentId) return [];
    conversationQuery = conversationQuery
      .eq('user_id', input.userId)
      .eq('establishment_id', input.establishmentId);
  }
  const { data: rows, error } = await conversationQuery.order('updated_at', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar o suporte: ${error.message}`);
  if (!rows?.length) return [];

  const { data: messageRows, error: messagesError } = await supabase
    .from('support_messages')
    .select('*')
    .in('conversation_id', rows.map((row) => row.id))
    .order('created_at', { ascending: true });
  if (messagesError) throw new Error(`Não foi possível carregar as mensagens: ${messagesError.message}`);

  const messagesByConversation = new Map<string, SupportMessage[]>();
  for (const row of messageRows ?? []) {
    const messages = messagesByConversation.get(row.conversation_id) ?? [];
    messages.push(fromMessageRow(row));
    messagesByConversation.set(row.conversation_id, messages);
  }
  return rows.map((row) => fromConversationRow(row, messagesByConversation.get(row.id) ?? []));
}

export async function createSupportConversation(input: {
  isDemo: boolean;
  establishmentId: string;
  establishmentName: string;
  userId: string;
  userName: string;
}): Promise<SupportConversation> {
  const now = new Date().toISOString();
  const conversation: SupportConversation = {
    id: crypto.randomUUID(),
    establishmentId: input.establishmentId,
    establishmentName: input.establishmentName,
    userId: input.userId,
    userName: input.userName,
    humanRequestedAt: null,
    adminSeenAt: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  if (!isRemote(input.isDemo) || !supabase) {
    writeLocal([conversation, ...readLocal()]);
    return conversation;
  }

  const { data, error } = await supabase.from('support_conversations').insert({
    id: conversation.id,
    establishment_id: conversation.establishmentId,
    establishment_name: conversation.establishmentName,
    user_id: conversation.userId,
    user_name: conversation.userName,
  }).select('*').single();
  if (error) throw new Error(`Não foi possível iniciar o atendimento: ${error.message}`);
  return fromConversationRow(data, []);
}

export async function addSupportMessage(input: {
  isDemo: boolean;
  conversationId: string;
  sender: SupportSender;
  senderId: string;
  senderName: string;
  body: string;
}): Promise<SupportMessage> {
  const message: SupportMessage = {
    id: crypto.randomUUID(),
    sender: input.sender,
    senderId: input.senderId,
    senderName: input.senderName,
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!isRemote(input.isDemo) || !supabase) {
    writeLocal(readLocal().map((conversation) => conversation.id !== input.conversationId
      ? conversation
      : { ...conversation, updatedAt: message.createdAt, messages: [...conversation.messages, message] }));
    return message;
  }

  const { error } = await supabase.from('support_messages').insert({
    id: message.id,
    conversation_id: input.conversationId,
    sender_kind: message.sender,
    sender_id: message.senderId || null,
    sender_name: message.senderName,
    body: message.body,
  });
  if (error) throw new Error(`Não foi possível enviar a mensagem: ${error.message}`);
  return message;
}

export async function requestHumanSupport(input: {
  isDemo: boolean;
  conversationId: string;
}) {
  const requestedAt = new Date().toISOString();
  if (!isRemote(input.isDemo) || !supabase) {
    writeLocal(readLocal().map((conversation) => conversation.id !== input.conversationId
      ? conversation
      : { ...conversation, humanRequestedAt: conversation.humanRequestedAt ?? requestedAt, updatedAt: requestedAt }));
    return;
  }

  const { error } = await supabase.from('support_conversations')
    .update({ human_requested_at: requestedAt })
    .eq('id', input.conversationId);
  if (error) throw new Error(`Não foi possível solicitar atendimento humano: ${error.message}`);
}

export async function markSupportConversationSeen(input: {
  isDemo: boolean;
  conversationId: string;
}) {
  const seenAt = new Date().toISOString();
  if (!isRemote(input.isDemo) || !supabase) {
    writeLocal(readLocal().map((conversation) => conversation.id !== input.conversationId
      ? conversation
      : { ...conversation, adminSeenAt: seenAt }));
    return;
  }

  const { error } = await supabase.from('support_conversations')
    .update({ admin_seen_at: seenAt })
    .eq('id', input.conversationId);
  if (error) throw new Error(`Não foi possível marcar a conversa como lida: ${error.message}`);
}

interface HelpAnswer {
  keywords: string[];
  answer: string;
}

const HELP_ANSWERS: HelpAnswer[] = [
  {
    keywords: ['o que voce faz', 'como funciona o aplicativo', 'quais funcionalidades'],
    answer: 'Posso orientar sobre Dashboard e gráficos; Frente de Caixa, vendas, pagamentos, sessões, movimentações, despesas, relatórios, lucro e histórico; Estoque; Cardápio público; Comandas; Delivery e acompanhamento de pedidos; Agendamentos, serviços e profissionais; configurações da loja; usuários, permissões e login. Diga o que quer fazer com suas palavras. Se eu não souber, use Falar com humano. Sou um assistente de respostas locais: não consulto nem altero os dados da loja.',
  },
  {
    keywords: [
      'fazer login', 'entrar no sistema', 'como entrar no sistema', 'como faco login',
      'acessar minha conta', 'qual usuario usar', 'login do sistema',
      'erro ao entrar', 'problema no login', 'nao consigo fazer login',
    ],
    answer: 'Na tela de acesso, use o e-mail e a senha cadastrados quando a autenticação está configurada; em ambientes locais sem autenticação, use o usuário configurado para essa demonstração. Confira se digitou o e-mail correto e se o teclado não alterou a senha. A conta admin/123 é somente para demonstração local quando esse modo está habilitado, nunca para produção. Se continuar sem acesso, fale com o administrador da loja.',
  },
  {
    keywords: [
      'esqueci minha senha', 'esqueci a senha', 'nao lembro minha senha', 'recuperar senha',
      'redefinir senha', 'resetar senha', 'trocar minha senha', 'mudar minha senha',
      'alterar senha da conta', 'senha invalida', 'senha errada', 'senha para entrar',
      'minha senha nao funciona',
    ],
    answer: 'O Kito PDV não tem um botão de “Esqueci minha senha” nem uma tela para trocar a senha. Fale com o administrador responsável pela sua conta para ele verificar o acesso e orientar a recuperação; não envie sua senha pelo chat.',
  },
  {
    keywords: [
      'diferenca super admin lojista', 'o que e super admin', 'quem e o administrador',
      'permissao de administrador', 'papel de usuario', 'tipo de usuario no sistema',
      'usuario da loja', 'subusuario da loja',
    ],
    answer: 'O Super Admin administra os estabelecimentos e os usuários gerais do sistema. O responsável pela loja trabalha nos módulos liberados para aquele estabelecimento e pode gerenciar subusuários se tiver essa permissão. O subusuário recebe somente os módulos e ações marcados pelo responsável que o cadastrou.',
  },
  {
    keywords: [
      'criar usuario pelo super admin', 'super admin cria usuario', 'criar usuario no super admin',
      'criar usuario administrador', 'cadastrar usuario em varias lojas',
      'adicionar usuario no painel admin', 'gerenciar usuarios do sistema', 'remover usuario do sistema',
      'criar conta para lojista', 'usuario para uma loja', 'usuario no painel super admin',
    ],
    answer: 'No Painel Super Admin, abra Usuários para criar ou remover uma conta de lojista e associá-la a um ou mais estabelecimentos. Para criar, informe usuário, e-mail, senha com pelo menos 8 caracteres e selecione as lojas. Para acessos limitados dentro de uma loja, use Configurações da loja → Subusuários e permissões.',
  },
  {
    keywords: [
      'permissoes de subusuario', 'limitar acesso do funcionario', 'escolher acesso do funcionario',
      'permissao de vendas', 'permissao de relatorio', 'permissao de fechamento',
      'acesso so ao caixa', 'acesso ao estoque', 'o que marcar nas permissoes',
    ],
    answer: 'Em Configurações da loja → Subusuários e permissões, marque apenas as áreas e ações que a pessoa deve usar. As opções incluem módulos como Estoque e Delivery, configurações e gerenciamento de usuários, além de permissões separadas do caixa para vendas, movimentações, relatórios e abertura/fechamento. Você só pode conceder permissões que já possui; módulos desativados não ficam disponíveis.',
  },
  {
    keywords: [
      'criar loja', 'criar estabelecimento', 'cadastrar estabelecimento', 'ativar modulo',
      'desativar modulo', 'habilitar modulo na loja', 'editar plano da loja',
      'loja inativa', 'ativar uma loja', 'gerenciar modulos da loja',
    ],
    answer: 'No Painel Super Admin, crie ou edite um estabelecimento para ajustar nome, responsável, contato, plano, status e módulos disponíveis. É preciso ativar pelo menos um módulo ao criar a loja. Os menus que cada usuário vê também dependem das permissões da conta.',
  },
  {
    keywords: [
      'mensalidade kito', 'boleto do kito', 'boleto do sistema', 'cobranca do kito',
      'pagar o kito', 'financeiro do admin', 'mensalidade do programa',
    ],
    answer: 'A mensalidade do Kito e os boletos cobrados pelo sistema são gerenciados somente pelo Super Admin. No Painel Super Admin, abra Finanças do Kito, selecione a loja e configure o dia fixo ou gere uma cobrança com vencimento, código e validade. A aba Finanças da loja é separada e serve para o lojista controlar as contas próprias do estabelecimento.',
  },
  {
    keywords: [
      'financeiro', 'financas da loja', 'boleto', 'boletos', 'mensalidade da loja',
      'boleto vencendo', 'boleto vencido', 'cadastrar boleto', 'codigo do boleto',
      'dia fixo do boleto', 'cobranca mensal recorrente',
    ],
    answer: 'A aba Finanças no menu da loja serve para o lojista registrar e acompanhar boletos e contas próprias, incluindo cobranças avulsas e recorrentes, código, validade e vencimento. Ela não permite criar nem alterar cobranças da mensalidade Kito; isso é exclusivo do Super Admin, no Painel Super Admin → Finanças do Kito. As contas da loja podem ser acessadas por subusuários com a permissão “Finanças · Boletos e mensalidades”.',
  },
  {
    keywords: [
      'tema claro', 'tema escuro', 'modo escuro', 'modo claro', 'mudar tema',
      'trocar para modo escuro', 'aparencia do sistema',
    ],
    answer: 'Abra o menu do usuário no rodapé da barra lateral e escolha Tema → Claro ou Escuro. A cor e o logo da loja são configurados separadamente em Configurações da loja.',
  },
  {
    keywords: [
      'dashboard', 'grafico', 'graficos', 'faturamento', 'quanto vendeu', 'vendas hoje',
      'vendas da semana', 'vendas do mes', 'vendas do ano', 'faturamento do dia', 'data de referencia',
      'quanto entrou', 'quanto eu vendi', 'quanto a loja vendeu', 'dar uma olhada nas vendas',
      'ver as vendas', 'olhar as vendas', 'acompanhar vendas', 'entrou hoje', 'entrou no caixa',
    ],
    answer: 'No menu lateral, abra Dashboard. Nos filtros acima dos gráficos, escolha Diário, Semanal, Mensal ou Anual e informe a Data de referência. Os gráficos mostram vendas e movimentações do período; o faturamento por profissional aparece quando Agendamentos e Relatórios estão disponíveis para sua conta.',
  },
  {
    keywords: [
      'abrir caixa', 'abrir o caixa', 'iniciar caixa', 'sessao de caixa', 'fundo de caixa',
      'comecar o caixa', 'comecar caixa', 'comecar a trabalhar no caixa', 'registrar fundo de caixa',
    ],
    answer: 'Abra Frente de Caixa → Abertura e fechamento. Informe o valor inicial do caixa e abra a sessão. É necessário ter uma sessão aberta para registrar vendas e movimentações em dinheiro.',
  },
  {
    keywords: [
      'fechar caixa', 'fechamento de caixa', 'encerrar sessao', 'conferir caixa', 'diferenca no caixa',
      'fechar o caixa no fim do dia', 'terminar o caixa', 'finalizar o caixa', 'bater o caixa',
      'ver se o caixa bateu', 'conferir o dinheiro do caixa',
    ],
    answer: 'Em Frente de Caixa → Abertura e fechamento, confira o valor esperado, informe o dinheiro contado e feche a sessão. O sistema calcula e registra a diferença entre o esperado e o contado; as sessões anteriores ficam disponíveis para consulta.',
  },
  {
    keywords: [
      'registrar venda', 'fazer venda', 'lancar venda', 'venda avulsa', 'vender produto', 'cobrar cliente',
      'passar uma venda', 'passar venda', 'fazer uma cobranca', 'lancar um pedido no caixa',
      'receber do cliente', 'colocar venda no sistema',
    ],
    answer: 'Abra Frente de Caixa → Vendas e escolha a origem da venda: agendamento, cardápio, produto de estoque, comanda ou avulsa. Adicione os itens e finalize o pagamento. Para cobrar, precisa haver uma sessão de caixa aberta.',
  },
  {
    keywords: [
      'forma de pagamento', 'pagamento dividido', 'dividir pagamento', 'mais de uma forma',
      'calcular troco', 'troco da venda', 'troco em dinheiro', 'dar troco', 'dar o troco',
      'quanto devolver', 'quanto devo devolver', 'dinheiro de volta pro cliente',
      'recebi a mais', 'cliente pagou a mais', 'sobrou dinheiro do pagamento',
    ],
    answer: 'Na finalização da venda, informe uma ou mais formas de pagamento — dinheiro, Pix, crédito, débito ou outra — e o valor de cada uma. Se receber mais dinheiro que o total, o caixa calcula o troco.',
  },
  {
    keywords: ['cancelar venda', 'cancelar uma venda', 'cancelo venda', 'cancelo uma venda', 'estornar venda', 'estornar', 'estorno', 'excluir venda', 'cancelamento de venda'],
    answer: 'Acesse Frente de Caixa → Relatórios e localize a venda. O cancelamento/estorno ou a exclusão pede confirmação e um motivo obrigatório; itens de estoque e registros relacionados podem ser estornados. Se a ação não aparecer, peça a permissão de vendas ao administrador.',
  },
  {
    keywords: [
      'historico', 'auditoria', 'quem alterou', 'quem fez a venda', 'alteracoes feitas',
      'quem mexeu', 'quem mudou', 'ver o que aconteceu', 'consultar alteracoes',
    ],
    answer: 'Abra Frente de Caixa → Histórico para consultar eventos registrados com responsável e data/hora, como vendas, despesas, movimentações, sessões e alterações de pedidos. O relatório também pode incluir os eventos do período selecionado.',
  },
  {
    keywords: [
      'sangria', 'suprimento', 'retirada de dinheiro', 'entrada de dinheiro no caixa', 'movimentacao do caixa',
      'tirar dinheiro do caixa', 'pegar dinheiro do caixa', 'por dinheiro no caixa', 'colocar dinheiro no caixa',
      'reforcar o caixa', 'registrar uma retirada', 'registrar uma entrada no caixa',
    ],
    answer: 'Em Frente de Caixa → Movimentações e extratos, selecione Suprimento para registrar uma entrada ou Sangria para uma retirada. Informe valor e motivo; para essas movimentações é necessário manter uma sessão de caixa aberta.',
  },
  {
    keywords: [
      'registrar despesa', 'lancar despesa', 'cancelar despesa', 'despesa em dinheiro',
      'anotar uma conta', 'anotar gasto', 'lancar um gasto', 'registrar um gasto',
      'paguei uma conta', 'conta de luz', 'conta de agua',
    ],
    answer: 'Em Frente de Caixa → Movimentações e extratos, selecione Despesa e informe valor, descrição, categoria e forma de pagamento. Uma despesa paga em dinheiro também sai do caixa esperado. Para cancelar, informe o motivo obrigatório.',
  },
  {
    keywords: [
      'relatorio', 'relatorios', 'vendas por periodo', 'dia especifico', 'data especifica',
      'puxar relatorio', 'tirar relatorio', 'ver relatorio', 'olhar o relatorio',
      'dar uma olhada no relatorio', 'como foi o movimento', 'movimento do dia',
      'ver o que vendeu', 'conferir as vendas', 'fechamento do dia',
    ],
    answer: 'Abra Frente de Caixa → Relatórios. Escolha Diário, Semanal, Mensal ou Anual e selecione a Data de referência; para consultar um dia específico, escolha Diário e selecione a data. O relatório inclui vendas, despesas, formas e origens de pagamento, lucro/margem estimados e entregadores.',
  },
  {
    keywords: [
      'excel', 'planilha', 'exportar relatorio', 'baixar relatorio', 'relatorio em excel', 'exportar excel',
      'baixar planilha', 'baixar no excel', 'jogar no excel', 'salvar relatorio',
      'mandar relatorio pra planilha', 'arquivo do relatorio',
    ],
    answer: 'Em Frente de Caixa → Relatórios, escolha primeiro o período e a data de referência. Use Exportar Excel para baixar uma planilha com abas de resumo, vendas, despesas, movimentações, entregadores e auditoria; Backup JSON baixa os dados estruturados do relatório.',
  },
  {
    keywords: ['lucro', 'margem', 'custo do produto', 'lucro estimado'],
    answer: 'O lucro e a margem estimados aparecem no Dashboard e em Frente de Caixa → Relatórios. Cadastre o custo unitário nos produtos do Estoque ou nos itens do Cardápio; o custo é copiado para novas vendas. O cálculo considera custos conhecidos e despesas lançadas, mas não impostos, tarifas de pagamento nem folha, e fica parcial se faltarem custos.',
  },
  {
    keywords: [
      'entregador', 'entregadores', 'quanto cada entregador', 'relatorio por entregador',
      'quanto fez cada entregador', 'corrida do entregador', 'entregas de cada entregador',
    ],
    answer: 'O relatório por entregador fica em Frente de Caixa → Relatórios. Atribua o entregador ao pedido no Delivery para que as entregas possam ser agrupadas corretamente no relatório.',
  },
  {
    keywords: [
      'cadastrar produto', 'novo produto', 'adicionar produto no estoque', 'categoria de estoque',
      'produto no estoque', 'estoque', 'chegou mercadoria', 'mercadoria nova',
      'colocar produto no sistema', 'por produto no estoque', 'cadastrar mercadoria',
    ],
    answer: 'Abra Estoque e preencha nome, preço, quantidade inicial, unidade e limite de alerta. Categoria e custo unitário são opcionais. Depois clique em Adicionar produto; o estoque inicial também aparece como uma entrada no histórico de movimentações.',
  },
  {
    keywords: [
      'ajustar estoque', 'corrigir estoque', 'repor estoque', 'entrada no estoque', 'estoque baixo',
      'estoque minimo', 'limite de estoque', 'mexer na quantidade', 'arrumar quantidade',
      'ajeitar quantidade', 'corrigir quantidade do produto', 'dar baixa no estoque',
      'dar entrada na mercadoria', 'baixar quantidade', 'produto acabou', 'produto ta acabando',
    ],
    answer: 'Em Estoque, use o campo de quantidade ao lado do produto e os botões − ou + para registrar uma saída/ajuste ou reposição. O ajuste não permite deixar o estoque negativo. Edite o limite de alerta no campo “Alerta abaixo de”; entradas, ajustes e vendas recentes aparecem no histórico.',
  },
  {
    keywords: ['venda baixa estoque', 'baixar estoque', 'estoque apos venda', 'estoque depois da venda'],
    answer: 'Vendas feitas pela origem Produto de estoque no PDV baixam automaticamente as quantidades e registram a movimentação. O PDV não permite adicionar mais unidades do que há em estoque.',
  },
  {
    keywords: [
      'editar item do cardapio', 'adicionar item ao cardapio', 'preco do cardapio', 'imagem do cardapio',
      'mexer no cardapio', 'mudar o preco do item', 'arrumar o preco', 'trocar o preco',
      'colocar produto no cardapio', 'subir produto no cardapio', 'foto do produto',
      'mexer no preco', 'mudar preco', 'baixar preco', 'aumentar preco', 'subir preco',
      'mexo no preco', 'arrumar preco', 'ajeitar preco',
    ],
    answer: 'Abra Cardápio → Itens do Cardápio. Use Novo item para cadastrar ou Editar para alterar nome, preço, custo opcional, descrição, categoria e URL da imagem. As setas mudam a ordem e o ícone de lixeira exclui o item.',
  },
  {
    keywords: ['categoria do cardapio', 'editar categoria', 'ordem das categorias', 'separar os itens do cardapio'],
    answer: 'Em Cardápio → Categorias, adicione, edite, reordene ou exclua categorias. Ao renomear uma categoria, os itens associados também são atualizados; ao excluir, os itens ficam sem categoria.',
  },
  {
    keywords: [
      'link do cardapio', 'cardapio publico', 'pedido pelo site', 'pedido online', 'whatsapp do cardapio',
      'mandar o cardapio', 'compartilhar o cardapio', 'passar o link do menu',
    ],
    answer: 'Em Cardápio, use Ver cardápio público ou copie o link. O cliente escolhe itens e quantidades, informa seus dados e conclui o pedido; o app monta a mensagem para o WhatsApp configurado e gera um link de acompanhamento. Confira o número de WhatsApp em Cardápio → WhatsApp ou Configurações da loja.',
  },
  {
    keywords: [
      'criar comanda', 'abrir comanda', 'comanda', 'consumo do cliente',
      'anotar consumo', 'abrir uma conta pro cliente', 'deixar pendurado na comanda',
      'juntar consumo pra pagar depois',
    ],
    answer: 'Abra Comandas e clique em Nova comanda. Selecione uma comanda aberta, adicione itens do Cardápio ou informe um item e valor manualmente; ajuste as quantidades nos botões +/−. Para receber, vá a Frente de Caixa → Vendas, escolha Comanda e cobre a comanda aberta.',
  },
  {
    keywords: [
      'configurar agendamento', 'horario de funcionamento', 'horarios de atendimento', 'duracao do agendamento',
      'mudar horario de atendimento', 'alterar horario', 'dia que abre', 'dia que atende',
    ],
    answer: 'Abra Agendamentos → Configurações. Ative os dias de atendimento, defina os horários de início e fim e ajuste a duração padrão dos atendimentos. Salve as configurações para aplicar.',
  },
  {
    keywords: [
      'cadastrar servico', 'novo servico', 'preco do servico', 'duracao do servico', 'cobrar servico',
      'vender servico', 'colocar um servico novo', 'adicionar um corte', 'mudar o valor do corte',
    ],
    answer: 'Em Agendamentos → Serviços, informe nome, preço e duração e clique em Adicionar serviço. Para remover um serviço, use o ícone de lixeira correspondente.',
  },
  {
    keywords: ['cadastrar profissional', 'adicionar profissional', 'remover profissional', 'colocar funcionario', 'adicionar barbeiro'],
    answer: 'Em Agendamentos → Profissionais, informe nome e cargo e clique em Adicionar. Use a lixeira para remover um profissional.',
  },
  {
    keywords: [
      'editar agendamento', 'edito agendamento', 'edito um agendamento', 'editar um agendamento',
      'alterar agendamento', 'mudar agendamento', 'cancelar agendamento', 'status do agendamento',
      'agenda do dia', 'historico de agendamentos', 'remarcar horario', 'trocar horario do cliente',
      'desmarcar cliente', 'mudar o horario marcado',
    ],
    answer: 'Em Agendamentos → Agendamentos, selecione a data para ver a agenda daquele dia. Ative o histórico para ver outros atendimentos e use o lápis para editar dados, horário ou status. O pagamento é atualizado pelo caixa; para cobrar, escolha a origem Agendamento em Frente de Caixa → Vendas.',
  },
  {
    keywords: [
      'relatorio por profissional', 'vendas por profissional', 'faturamento por profissional',
      'quanto cada barbeiro fez', 'quanto cada profissional ganhou',
    ],
    answer: 'Abra Agendamentos → Relatório para ver atendimentos pagos e faturamento por profissional. Há filtros de Hoje, Esta semana e Este mês. Os atendimentos precisam ser registrados como pagos no caixa para entrar no faturamento.',
  },
  {
    keywords: [
      'link de agendamento', 'agendamento publico', 'agendar online', 'cliente fazer agendamento',
      'mandar link pra marcar horario', 'cliente marcar sozinho', 'compartilhar link de agendamento',
    ],
    answer: 'Em Agendamentos, use Ver página pública ou copie o link de agendamento. O cliente escolhe um serviço, data/horário disponível e informa nome e WhatsApp; o agendamento confirmado aparece na aba Agendamentos. Após confirmar, também pode enviar os dados pelo WhatsApp.',
  },
  {
    keywords: [
      'criar pedido delivery', 'novo pedido delivery', 'lancar pedido', 'pedido para retirada', 'pedido para entrega',
      'anotar pedido', 'pedido que veio pelo telefone', 'pedido que chegou no whatsapp',
      'cliente vai buscar', 'cliente vai retirar', 'mandar pelo motoboy',
    ],
    answer: 'Abra Delivery → Novo pedido e escolha claramente ENTREGA ou RETIRADA. Informe os dados do cliente, adicione itens do Cardápio ou um item manual e confirme o pagamento informado. Entrega exige endereço e pode ter taxa; retirada não cobra taxa.',
  },
  {
    keywords: ['cancelar pedido delivery', 'cancelar pedido de entrega', 'excluir pedido delivery'],
    answer: 'O Delivery não oferece uma ação para cancelar ou excluir pedidos. Não altere o registro financeiro para contornar isso; se precisar corrigir um pedido, procure o administrador. Pedidos já pagos devem ser tratados pelo fluxo de estorno do caixa, com o motivo obrigatório.',
  },
  {
    keywords: [
      'editar pedido delivery', 'editar pedido', 'corrigir pedido', 'alterar pedido', 'pedido pago',
      'mudar pedido', 'arrumar pedido', 'faltou item no pedido', 'coloquei errado no pedido',
      'errei o pedido', 'trocar item do pedido',
    ],
    answer: 'No Delivery, abra Editar pedido para corrigir modalidade, dados do cliente ou itens antes do pagamento. Pedidos já pagos não permitem alterar itens, valores ou modalidade para preservar o registro do caixa; nesse caso, fale com o administrador antes de corrigir qualquer lançamento financeiro.',
  },
  {
    keywords: [
      'status do delivery', 'despachar pedido', 'pronto para retirada', 'finalizar pedido delivery',
      'pedido saiu', 'pedido ta pronto', 'pedido esta pronto', 'mandar pedido pra rua',
      'marcar como entregue', 'avisar que pode buscar',
    ],
    answer: 'No Delivery, pedidos começam Em produção. Use Despachar para marcar que a entrega saiu, ou Marcar pronto para retirada em pedidos de retirada. Depois, use Finalizar pagamento; é necessário haver uma sessão aberta no caixa. O status final é refletido no acompanhamento público quando disponível.',
  },
  {
    keywords: [
      'entregador no pedido', 'atribuir entregador', 'trocar entregador',
      'mandar pedido com entregador', 'quem vai levar o pedido', 'escolher motoboy',
    ],
    answer: 'Na lista de pedidos do Delivery, escolha o entregador no seletor do pedido enquanto ele está em produção. Os entregadores precisam estar cadastrados e ativos em Configurações da loja → Configurações do Delivery.',
  },
  {
    keywords: [
      'taxa de entrega', 'cadastrar entregador', 'configuracao do delivery', 'configuracoes do delivery',
      'valor do frete', 'preco da entrega', 'adicionar motoboy', 'cadastrar motoboy',
    ],
    answer: 'Abra Configurações da loja → Configurações do Delivery. Defina a taxa padrão para novos pedidos e cadastre entregadores com nome e telefone; você pode ativar ou desativar cada entregador. A taxa pode ser ajustada em cada pedido.',
  },
  {
    keywords: [
      'notificacao de pedido', 'aviso de pedido', 'pedido novo', 'notificacao navegador',
      'tocar quando chegar pedido', 'avisar quando cair pedido', 'chegou pedido novo',
    ],
    answer: 'Mantenha a tela Delivery aberta para ver avisos de novos pedidos. Para receber notificações do sistema, clique em Ativar notificações do navegador na seção Avisos de novos pedidos e permita o acesso no navegador.',
  },
  {
    keywords: [
      'acompanhar pedido', 'link de acompanhamento', 'rastrear pedido', 'status do meu pedido',
      'ver onde ta meu pedido', 'saber se saiu pra entrega', 'link pra rastrear',
    ],
    answer: 'Pedidos feitos pelo cardápio público geram um link seguro de acompanhamento, enviado junto da mensagem do pedido e disponível para copiar na confirmação. O cliente vê se está em produção, saiu para entrega/está pronto para retirada ou foi concluído; o status atualiza automaticamente. Esse acompanhamento requer a configuração Supabase.',
  },
  {
    keywords: [
      'editar loja', 'nome da loja', 'logo da loja', 'cor da loja', 'identidade visual', 'telefone da loja',
      'foto de perfil', 'foto do perfil', 'foto perfil', 'foto da loja', 'imagem de perfil',
      'imagem do perfil', 'imagem da loja', 'trocar foto', 'mudar foto', 'alterar foto',
      'trocar logo', 'mudar logo', 'alterar logo',
      'mexer na foto', 'mexo na foto', 'mudar a fotinha', 'trocar a fotinha', 'subir foto', 'colocar foto',
      'por foto', 'tirar foto', 'atualizar imagem', 'mudar avatar', 'foto da empresa', 'logo da empresa',
      'mudar a foto da loja', 'trocar a foto da loja', 'colocar a foto da loja', 'subir a foto da loja',
      'botar foto', 'botar a foto', 'mudar foto de perfil', 'trocar foto de perfil',
      'personalizar a loja', 'arrumar a aparencia da loja', 'ajeitar a loja',
    ],
    answer: 'Abra Configurações da loja. Você pode alterar nome, cor de destaque, logo e WhatsApp e depois clicar em Salvar alterações. A imagem deve ter até 8 MB; no Supabase, é enviada para o armazenamento de logos.',
  },
  {
    keywords: [
      'posso criar usuarios', 'posso criar outros usuarios', 'posso criar usuario e subusuario',
      'posso criar usuarios e subusuarios', 'criar outros usuarios e subusuarios',
      'posso cadastrar usuarios', 'posso cadastrar outros usuarios', 'da para criar subusuarios',
      'consigo criar usuarios', 'criar acesso para funcionarios',
      'criar usuarios subusuarios', 'criar usuarios e subusuarios',
      'criar outros usuarios subusuarios', 'criar outros usuarios e subusuarios',
    ],
    answer: 'Sim, você pode criar acessos, desde que sua conta tenha a permissão necessária. Para dar acesso a funcionários da sua loja, vá a Configurações da loja → Subusuários e permissões e crie um subusuário, escolhendo as permissões dele. A criação de usuários de lojista e a associação a lojas é feita pelo Super Admin, no Painel Super Admin → Usuários.',
  },
  {
    keywords: [
      'criar usuario', 'criar subusuario', 'criar um subusuario', 'permissoes de usuario',
      'crio usuario', 'crio subusuario', 'cadastrar subusuario', 'cadastrar funcionario',
      'acesso de funcionario', 'remover usuario', 'dar acesso pro funcionario',
      'liberar acesso pro funcionario', 'tirar acesso do funcionario', 'cadastrar funcionario no sistema',
    ],
    answer: 'Em Configurações da loja → Subusuários e permissões, crie um acesso com usuário, e-mail, nome e senha de pelo menos 8 caracteres. Selecione somente as permissões que você possui. A lista mostra os acessos da loja e permite removê-los; se a opção não estiver disponível, peça ao responsável pela loja.',
  },
  {
    keywords: [
      'nao vejo modulo', 'nao aparece modulo', 'sem permissao', 'liberar acesso', 'permissao do caixa',
      'sumiu o menu', 'nao consigo entrar', 'nao consigo acessar', 'bloqueou meu acesso',
    ],
    answer: 'Os menus e ações dependem dos módulos ativos na loja e das permissões da sua conta. Se uma área não aparece, peça ao administrador da loja para conferir seu acesso; apenas quem tem a permissão correspondente pode visualizar ou operar aquela área.',
  },
  {
    keywords: [
      'mudar loja', 'trocar loja', 'menu do usuario', 'sair da conta', 'logout', 'sair do sistema',
      'fazer logoff', 'alternar estabelecimento', 'trocar de estabelecimento', 'acessar outra loja',
    ],
    answer: 'Use o menu do usuário no rodapé da barra lateral para acessar as opções da conta, trocar para outro estabelecimento ao qual você tem acesso, escolher o Painel Super Admin se sua conta tiver esse papel, alterar o tema ou sair do sistema.',
  },
];

function normalizeQuestion(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const FILLER_WORDS = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'pra', 'pro', 'para', 'por', 'com', 'pelo', 'pela', 'pelos', 'pelas',
  'eu', 'me', 'mim', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas',
  'que', 'como', 'faz', 'faco', 'fazer', 'queria', 'quero', 'gostaria', 'pode', 'poderia',
]);

function normalizeIntent(value: string) {
  return normalizeQuestion(value).split(' ').filter((term) => !FILLER_WORDS.has(term)).join(' ');
}

function getConversationalAnswer(question: string) {
  const rawNormalized = normalizeQuestion(question);
  const normalized = normalizeIntent(question);
  const greeting = /^(oi|ola|e ai|eae|opa|bom dia|boa tarde|boa noite)( kito)?$/;
  if (greeting.test(normalized)) {
    return 'Oi! Que bom falar com você 😊 Posso ajudar com alguma coisa do Kito PDV ou só bater um papo. O que você precisa?';
  }
  if (/^(oi|ola|e ai|eae|opa) tudo bem( kito)?$/.test(normalized)) {
    return 'Oi! Tudo certo por aqui, pronto pra ajudar 😊 E com você?';
  }

  if (/^(tudo bem|tudo certo|como vai|voce ta|voce esta|vc ta|vc esta|beleza|tranquilo)( kito)?$/.test(normalized)) {
    return 'Tudo certo por aqui, pronto pra ajudar 😊 E com você? Se tiver alguma dúvida do sistema, pode mandar!';
  }

  if (/^(muito )?(obrigado|obrigada|valeu|brigado|brigada|agradeco)( ajuda)?$/.test(normalized)) {
    return 'Por nada! 😊 Se precisar de mais alguma coisa, é só me chamar.';
  }

  if (/^(tchau|ate mais|falou|fui|ate logo|bom trabalho|tenha um bom dia|boa noite kito|valeu tchau|tchau ate mais)$/.test(normalized)) {
    return 'Até mais! Estarei por aqui quando precisar. 👋';
  }

  if (
    /^(quem e voce|quem e o kito|qual seu nome|qual e seu nome|qual e nome|como voce se chama|voce e um robo|voce e uma ia|voce e humano|e uma pessoa)$/.test(normalized)
    || /^(qual|como|quem)( e)? (o )?(teu|seu) nome$/.test(rawNormalized)
    || /^(como|qual) te chama(m)?$/.test(rawNormalized)
    || /^como tu (te )?chama(m)?$/.test(rawNormalized)
    || /^tu (te )?chama(m)?$/.test(rawNormalized)
    || /^te chama(m)?$/.test(normalized)
  ) {
    return 'Sou o Kito AI, assistente virtual do Kito PDV. Posso conversar e orientar sobre o aplicativo, mas não sou uma pessoa e uso respostas locais — não consigo consultar ou alterar os dados da sua loja.';
  }

  if (/^(tudo bem com voce|voce ta hoje|voce esta hoje|ta tudo bem|esta tudo bem)$/.test(normalized)) {
    return 'Tudo bem por aqui! 😊 Sou um assistente virtual, então não tenho sentimentos, mas estou pronto pra conversar e ajudar no que puder.';
  }

  if (/^(voce e legal|gosto de voce|voce e demais|voce e otimo|voce e otima|bom robo|boa kito|mandou bem)$/.test(normalized)) {
    return 'Valeu! 😊 Fico feliz em ajudar. Quer conversar ou precisa de uma mão com alguma parte do sistema?';
  }

  if (/^(me conta uma piada|conta uma piada|conta piada|fala uma piada|fala piada|me faz rir)$/.test(normalized)) {
    return 'Por que o computador foi ao médico? Porque estava com um vírus! 😄 Quer ajuda com mais alguma coisa?';
  }

  if (/^(que dia e hoje|dia e hoje|qual a data de hoje|qual data hoje|data de hoje|que dia e hoje mesmo)$/.test(normalized)) {
    return `Hoje é ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}.`;
  }

  if (/^(que horas sao|horas sao|qual o horario|horario|horas agora)$/.test(normalized)) {
    return `Agora são ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  }

  return null;
}

export function getKitoAnswer(question: string) {
  const conversationalAnswer = getConversationalAnswer(question);
  if (conversationalAnswer) return conversationalAnswer;

  const normalized = normalizeIntent(question);
  const terms = new Set(normalized.split(' ').filter(Boolean));
  let bestMatch: HelpAnswer | undefined;
  let bestScore = 0;

  for (const entry of HELP_ANSWERS) {
    const matchedTerms = new Set<string>();
    for (const keyword of entry.keywords) {
      const normalizedKeyword = normalizeIntent(keyword);
      if (!normalizedKeyword) continue;
      if (` ${normalized} `.includes(` ${normalizedKeyword} `)) {
        normalizedKeyword.split(' ').forEach((term) => matchedTerms.add(term));
      }
    }
    const score = matchedTerms.size;
    if (score > bestScore) {
      bestMatch = entry;
      bestScore = score;
    }
  }

  if (bestMatch) return bestMatch.answer;

  const helpRequest = ['ajuda', 'duvida', 'duvidas', 'menu', 'modulo', 'funcionalidade', 'funcionalidades']
    .some((keyword) => terms.has(keyword));
  return helpRequest
    ? 'Posso orientar sobre Dashboard, caixa, vendas, relatórios, estoque, delivery, comandas, cardápio, agendamentos, configurações e acessos. Diga o que você quer fazer, por exemplo: “como abrir o caixa?” ou “como editar um pedido?”. Se eu não souber, use Falar com humano. Sou um assistente de respostas prontas, não altero dados por você.'
    : 'Ainda não encontrei uma resposta segura para essa dúvida. Você pode tentar explicar de outro jeito ou clicar em Falar com humano para conversar com o suporte.';
}
