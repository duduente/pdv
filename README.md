# Kito PDV

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-gshzyhmc)

## Relatórios de lucro

Cadastre o custo unitário no Estoque ou nos itens do Cardápio. O custo é copiado para cada venda no momento do pagamento, preservando a margem histórica quando o custo cadastrado mudar. Despesas podem ser lançadas em Frente de Caixa → Movimentações e extratos; despesas em dinheiro também saem do saldo esperado do caixa. Os relatórios por período exibem lucro e margem estimados e avisam quando há vendas sem custo cadastrado. Vendas antigas sem custo permanecem incompletas; o cálculo não inclui impostos, tarifas de pagamento ou folha.

Em ambientes Supabase, aplique as migrations pendentes para ativar as permissões de registro de despesas.

## Categorias de estoque

Ao cadastrar produtos, escolha uma categoria existente ou crie uma nova. Nomes novos são aparados e comparados sem diferenciar maiúsculas/minúsculas ou acentos para reutilizar categorias existentes; produtos sem categoria ficam em **Geral**.

## Páginas públicas

O cardápio digital e o agendamento online usam layouts responsivos: no computador, o cardápio aproveita a largura com uma grade de produtos e o agendamento distribui os serviços em colunas; em telas menores, os conteúdos se reorganizam. Em **Links Públicos**, os links de agendamento e cardápio aparecem em cartões separados com ações de copiar e pré-visualizar.

## Reservas de mesa

Em **Comandas → Reservas de mesa**, registre horário, cliente, telefone, quantidade de pessoas e, opcionalmente, mesa e observações. A equipe pode marcar a chegada ou cancelar a reserva. Reservas são armazenadas separadamente das comandas; a atribuição de mesa é informativa e não representa controle automático de ocupação.

## Impressão de pedidos

No módulo **Delivery**, cada pedido tem a opção **Imprimir pedido**, que abre a impressão do navegador com modalidade (entrega/retirada), dados do cliente, itens, pagamento e totais. A impressão usa a impressora selecionada no navegador/sistema operacional; pop-ups precisam estar liberados para o aplicativo.

## Mensalidades e boletos

As finanças são divididas entre o controle interno da loja e as cobranças do Kito. O lojista pode registrar boletos e contas próprias na aba **Finanças** da loja, com recorrência opcional e alertas de vencimento; subusuários precisam da permissão **Finanças · Boletos e mensalidades**. Essa aba não exibe nem altera cobranças do Kito.

Somente o Super Admin tem a aba **Finanças do Kito** no Painel Super Admin. Ele seleciona a loja, configura o dia fixo da mensalidade e gera cobranças da assinatura usando o valor mensal cadastrado para aquela loja; cada cobrança permite editar vencimento, código e validade, marcar como paga ou excluir. Os registros administrativos são armazenados separadamente dos boletos da loja e protegidos pelas políticas Supabase para Super Admin. Em ambientes Supabase, aplique `supabase/migrations/20261109000000_store_finances_permission.sql`.

## Perfis de subusuários

Ao criar subusuários, o responsável pode aplicar os atalhos **Atendente**, **Caixa** ou **Gerente** e depois personalizar as permissões. Os atalhos respeitam as permissões que o responsável pode conceder e os módulos ativos da loja. O perfil Gerente não inclui finanças, configurações da loja nem gestão de subusuários.

## Auditoria e exportação

Cancelamentos/estornos e exclusões de vendas e despesas exigem motivo. Reduções manuais do estoque também exigem uma justificativa, registrada e exibida nas movimentações recentes. Vendas registradas, despesas, movimentações, sessões de caixa e alterações de pedidos ficam no Histórico com responsável e data/hora. Os gráficos do Dashboard e do relatório permitem escolher entre colunas, linhas e pizza; a pizza resume os valores do período, enquanto colunas e linhas preservam a comparação temporal. O relatório compara vendas e despesas por hora (diário), dia (semanal/mensal) ou mês (anual), respeitando o período selecionado e excluindo registros cancelados. **Exportar Excel** baixa um `.xlsx` com abas de resumo, vendas, despesas, movimentações, entregadores e auditoria; **Backup JSON** guarda os dados do relatório selecionado em formato estruturado.

## Suporte no aplicativo

Usuários das lojas podem abrir **Ajuda** para conversar com o Kito AI. Além de orientar sobre Dashboard, caixa, vendas, pagamentos, despesas, relatórios, lucro, estoque, cardápio, comandas, delivery, agendamentos, configurações, permissões, login, senhas, usuários e links públicos, ele responde a cumprimentos, agradecimentos, despedidas, perguntas simples sobre si mesmo e pedidos de piada. As orientações sobre contas distinguem Super Admin, responsáveis de loja e subusuários; o Kito também informa quando o aplicativo não oferece uma ação, como recuperação de senha. O reconhecimento considera expressões coloquiais e palavras de contexto, sem tratar termos ambíguos isolados como uma intenção certa; quando não reconhece a dúvida, oferece encaminhamento humano. O Kito AI usa respostas locais predefinidas, não altera dados e não é um modelo generativo. Para respostas automáticas, o chat mostra o indicador de digitação por cerca de 1,75 segundo; mensagens do suporte humano são enviadas sem esse atraso. A opção **Falar com humano** encaminha a conversa para a caixa de entrada do Super Admin; o alerta sonoro se repete até a conversa ser aberta. Para ambientes Supabase, aplique `supabase/migrations/20261108000000_support_chat.sql` antes de usar o atendimento entre dispositivos. O alerta de áudio pode depender de uma interação prévia do administrador com a página, conforme as permissões do navegador.
