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

As finanças são divididas entre o controle interno da loja e as cobranças do Kito. A aba **Finanças** é organizada em **Resumo**, **Mensalidade Kito**, **Contas e boletos** e **Extrato**. O lojista pode registrar contas próprias, escolher Pix ou boleto, informar o vencimento e marcar cada lançamento para repetir mensalmente; as próximas cobranças são criadas automaticamente e podem ser editadas como as demais contas da loja. Para encerrar a repetição, desmarque a opção ao editar a cobrança; excluir uma cobrança recorrente também encerra a recorrência. As cobranças Kito mostram o status pendente, atrasado, expirado ou pago; somente o Super Admin pode confirmar ou reabrir um pagamento. Após a confirmação, o cliente vê a mensalidade como paga, com a data; a tela atualiza o status automaticamente em até 30 segundos, ao voltar para a aba ou ao usar **Atualizar status**. Se o Super Admin cadastrar tanto boleto quanto Pix para a mensalidade fixa, o cliente pode escolher qual usar; apenas os meios configurados aparecem. O **Extrato** filtra vendas, despesas e contas pagas por dia, semana, mês ou ano, mostra faturamento, saídas e saldo do período e lista os lançamentos que compõem os totais. Contas em aberto não entram como gasto pago. Subusuários precisam da permissão **Finanças · Boletos e mensalidades**.

Finanças é um módulo ativado por loja pelo Super Admin em **Editar loja → Módulos Contratados**. Quando desativado, a seção deixa de aparecer para os usuários daquela loja; permissões de subusuário continuam sendo respeitadas quando o módulo está ativo.

Somente o Super Admin tem a aba **Finanças do Kito** no Painel Super Admin. Ao criar uma loja, o Super Admin define o valor da mensalidade Kito; na lista de lojas, basta clicar no valor da mensalidade para alterá-lo em uma janela própria. As configurações de cobrança mensal e a criação de cobranças avulsas também ficam em janelas para deixar a tela de Finanças mais limpa. Cada cobrança identifica se o código é de boleto ou Pix; quando ambos são configurados para a mensalidade fixa, o lojista escolhe qual usar. Ele pode consultar as cobranças do Kito, mas não editá-las. Cobranças avulsas também aceitam tipo e código de pagamento, e podem ser editadas, marcadas como pagas ou excluídas pelo Super Admin. Os registros administrativos são armazenados separadamente dos boletos da loja; as políticas Supabase concedem leitura somente aos membros com permissão de Finanças e mantêm as alterações exclusivas do Super Admin. Em ambientes Supabase, aplique `supabase/migrations/20261109120000_kito_billing_read.sql` e `supabase/migrations/20261109130000_finance_report_read.sql` após `supabase/migrations/20261109000000_store_finances_permission.sql`. A última migration permite que usuários com permissão de Finanças leiam os dados do caixa para o extrato, sem conceder permissão para alterá-los.

Os campos de valor monetário usam o padrão brasileiro com duas casas decimais (`0,00`).

## Perfis de subusuários

Ao criar subusuários, o responsável pode aplicar os atalhos **Atendente**, **Caixa** ou **Gerente** e depois personalizar as permissões. Os atalhos respeitam as permissões que o responsável pode conceder e os módulos ativos da loja. O perfil Gerente não inclui finanças, configurações da loja nem gestão de subusuários.

## Auditoria e exportação

Cancelamentos/estornos e exclusões de vendas e despesas exigem motivo. Reduções manuais do estoque também exigem uma justificativa, registrada e exibida nas movimentações recentes. Vendas registradas, despesas, movimentações, sessões de caixa e alterações de pedidos ficam no Histórico com responsável e data/hora. Os gráficos do Dashboard e do relatório permitem escolher entre colunas, linhas e pizza; a pizza resume os valores do período, enquanto colunas e linhas preservam a comparação temporal. O relatório compara vendas e despesas por hora (diário), dia (semanal/mensal) ou mês (anual), respeitando o período selecionado e excluindo registros cancelados. **Exportar Excel** baixa um `.xlsx` com abas de resumo, vendas, despesas, movimentações, entregadores e auditoria; **Backup JSON** guarda os dados do relatório selecionado em formato estruturado.

## Suporte no aplicativo

Usuários das lojas podem abrir **Ajuda** para conversar com o Kito AI. Além de orientar sobre Dashboard, caixa, vendas, pagamentos, despesas, relatórios, lucro, estoque, cardápio, comandas, delivery, agendamentos, configurações, permissões, login, senhas, usuários e links públicos, ele responde a cumprimentos, agradecimentos, despedidas, perguntas simples sobre si mesmo e pedidos de piada. As orientações sobre contas distinguem Super Admin, responsáveis de loja e subusuários; o Kito também informa quando o aplicativo não oferece uma ação, como recuperação de senha. O reconhecimento considera expressões coloquiais e palavras de contexto, sem tratar termos ambíguos isolados como uma intenção certa; quando não reconhece a dúvida, oferece encaminhamento humano. O Kito AI usa respostas locais predefinidas, não altera dados e não é um modelo generativo. Para respostas automáticas, o chat mostra o indicador de digitação por cerca de 1,75 segundo; mensagens do suporte humano são enviadas sem esse atraso. A opção **Falar com humano** encaminha a conversa para a caixa de entrada do Super Admin; o alerta sonoro se repete até a conversa ser aberta. Para ambientes Supabase, aplique `supabase/migrations/20261108000000_support_chat.sql` antes de usar o atendimento entre dispositivos. O alerta de áudio pode depender de uma interação prévia do administrador com a página, conforme as permissões do navegador.
