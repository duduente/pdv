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

As finanças são divididas entre o controle interno da loja e as cobranças do Kito. A aba **Finanças** é organizada em **Resumo**, **Mensalidade Kito**, **Contas e boletos** e **Extrato**. O lojista pode registrar contas próprias, escolher Pix ou boleto, informar o vencimento e marcar cada lançamento para repetir mensalmente; as próximas cobranças são criadas automaticamente e podem ser editadas como as demais contas da loja. Para encerrar a repetição, desmarque a opção ao editar a cobrança; excluir uma cobrança recorrente também encerra a recorrência. As cobranças Kito mostram o status pendente, atrasado, expirado ou pago; somente o Super Admin pode confirmar ou reabrir um pagamento. Ao confirmar a mensalidade fixa, a próxima aparece com boleto e Pix indisponíveis até o Super Admin liberar os dados editando essa cobrança. Ícones verdes abrem uma janela com o código; ícones cinza indicam meios indisponíveis. O status é atualizado automaticamente em até 30 segundos, ao voltar para a aba ou ao usar **Atualizar status**. O **Extrato** filtra vendas, despesas e contas pagas por dia, semana, mês ou ano, mostra faturamento, saídas e saldo do período e lista os lançamentos que compõem os totais. Contas em aberto não entram como gasto pago. Subusuários precisam da permissão **Finanças · Boletos e mensalidades**.

Finanças é um módulo ativado por loja pelo Super Admin em **Editar loja → Módulos Contratados**. Quando desativado, a seção deixa de aparecer para os usuários daquela loja; permissões de subusuário continuam sendo respeitadas quando o módulo está ativo.

Somente o Super Admin tem a aba **Finanças do Kito** no Painel Super Admin. Ao criar uma loja, o Super Admin define o valor da mensalidade Kito; na lista de lojas, basta clicar no valor da mensalidade para alterá-lo em uma janela própria. As configurações de cobrança mensal e a criação de cobranças avulsas também ficam em janelas para deixar a tela de Finanças mais limpa. Para disponibilizar boleto e/ou Pix, edite a cobrança do mês e preencha os respectivos códigos; eles não são copiados para o mês seguinte. O lojista pode consultar as cobranças do Kito, mas não editá-las. Cobranças avulsas também aceitam tipo e código de pagamento, e podem ser editadas, marcadas como pagas ou excluídas pelo Super Admin. Os registros administrativos são armazenados separadamente dos boletos da loja; as políticas Supabase concedem leitura somente aos membros com permissão de Finanças e mantêm as alterações exclusivas do Super Admin. Em ambientes Supabase, aplique `supabase/migrations/20261109120000_kito_billing_read.sql` e `supabase/migrations/20261109130000_finance_report_read.sql` após `supabase/migrations/20261109000000_store_finances_permission.sql`. A última migration permite que usuários com permissão de Finanças leiam os dados do caixa para o extrato, sem conceder permissão para alterá-los.

Os campos de valor monetário usam o padrão brasileiro com duas casas decimais (`0,00`).

## Funcionários (experimental)

O Super Admin pode ativar **Funcionários** para cada loja junto com **Finanças**. Subusuários precisam da permissão de Finanças para gerenciar funcionários; o vínculo opcional com um subusuário exige também acesso à gestão de usuários. No Supabase, aplique as migrations pendentes, incluindo `supabase/migrations/20261112010000_employee_roster_access.sql`, antes de usar a integração.

As abas separam cadastro, consumos, comissões e fechamento. No caixa e no pagamento de delivery, a escolha de funcionário é opcional; a comissão usa o valor integral da venda e o percentual registrado no pagamento. Para preservar o histórico, vendas com funcionário podem ser canceladas, mas não excluídas definitivamente. Consumos de estoque reduzem o saldo e registram movimentação; itens do cardápio não baixam estoque automaticamente. Cancelar consumo exige ajuste manual do estoque.

Após o término do mês, o fechamento soma salário e comissões, desconta consumos e estornos e transfere saldo negativo ao mês seguinte. Vendas canceladas após o fechamento geram ajuste em fechamento posterior. Quando há valor a pagar, é criada uma conta pendente em Finanças, que pode ser marcada como paga, mas não editada ou excluída.

**Somente para testes:** não use com dados reais até validar a integração completa no ambiente Supabase. A migration `supabase/migrations/20261112020000_atomic_employee_records.sql` adiciona operações transacionais e detecção de conflito para funcionários, estoque, caixa, pedidos, comandas e agendamentos. A cobrança, o cancelamento e a exclusão de vendas vinculadas alteram o caixa e o registro de origem na mesma transação; o armazenamento local e o modo demonstração continuam sem garantias transacionais.

Essa migration bloqueia gravações diretas da versão anterior do aplicativo nesses registros. Planeje uma janela de manutenção e backup, aplique as migrations pendentes no ambiente de testes e publique a versão correspondente do aplicativo antes de retomar o uso; todos os dispositivos devem recarregar a página. Não aplique a migration isoladamente em uma loja em funcionamento.

## Perfis de subusuários

Ao criar subusuários, o responsável pode aplicar os atalhos **Atendente**, **Caixa** ou **Gerente** e depois personalizar as permissões. Os atalhos respeitam as permissões que o responsável pode conceder e os módulos ativos da loja. O perfil Gerente não inclui finanças, configurações da loja nem gestão de subusuários.

No Painel Super Admin, a aba **Usuários** reúne a lista e o cadastro de contas para lojas. A exclusão de uma conta exige confirmação; nas configurações de uma loja, a remoção de subusuário retira o acesso àquela loja e também exclui a conta se ela não tiver acesso a outras lojas.

## Auditoria e exportação

Cancelamentos/estornos e exclusões de vendas e despesas exigem motivo. Reduções manuais do estoque também exigem uma justificativa, registrada e exibida nas movimentações recentes. Vendas registradas, despesas, movimentações, sessões de caixa e alterações de pedidos ficam no Histórico com responsável e data/hora. O Dashboard mostra indicadores operacionais de vendas, pedidos, agendamentos, contas, estoque e comandas conforme os módulos e permissões da conta. No menu **Relatórios** ficam os gráficos e o relatório de caixa, além do relatório por profissional quando Agendamentos está disponível. O acesso ao relatório de caixa continua exigindo a permissão de relatórios; cancelar ou excluir vendas exige também a permissão de vendas. Os gráficos permitem escolher entre colunas, linhas e pizza; a pizza resume os valores do período, enquanto colunas e linhas preservam a comparação temporal. O relatório compara vendas e despesas por hora (diário), dia (semanal/mensal) ou mês (anual), respeitando o período selecionado e excluindo registros cancelados. **Exportar Excel** baixa um `.xlsx` com abas de resumo, vendas, despesas, movimentações, entregadores e auditoria; **Backup JSON** guarda os dados do relatório selecionado em formato estruturado.

## Suporte no aplicativo

Usuários das lojas podem abrir **Ajuda** para conversar com o Kito AI. Além de orientar sobre Dashboard, caixa, vendas, pagamentos, despesas, relatórios, lucro, estoque, cardápio, comandas, delivery, agendamentos, configurações, permissões, login, senhas, usuários e links públicos, ele responde a cumprimentos, agradecimentos, despedidas, perguntas simples sobre si mesmo e pedidos de piada. As orientações sobre contas distinguem Super Admin, responsáveis de loja e subusuários; o Kito também informa quando o aplicativo não oferece uma ação, como recuperação de senha. O reconhecimento considera expressões coloquiais e palavras de contexto, sem tratar termos ambíguos isolados como uma intenção certa; quando não reconhece a dúvida, oferece encaminhamento humano. O Kito AI usa respostas locais predefinidas, não altera dados e não é um modelo generativo. Para respostas automáticas, o chat mostra o indicador de digitação por cerca de 1,75 segundo; mensagens do suporte humano são enviadas sem esse atraso. A opção **Falar com humano** encaminha a conversa para a aba **Suporte** do Super Admin. O indicador vermelho conta mensagens não lidas e também sinaliza solicitações sem mensagens; o alerta sonoro se repete enquanto houver notificações não lidas. Uma conversa é marcada como lida quando selecionada na aba Suporte. Para ambientes Supabase, aplique `supabase/migrations/20261108000000_support_chat.sql` antes de usar o atendimento entre dispositivos. O alerta de áudio pode depender de uma interação prévia do administrador com a página, conforme as permissões do navegador.
