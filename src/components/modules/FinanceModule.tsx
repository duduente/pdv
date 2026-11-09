import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Bell, Check, Pencil, Plus, RefreshCw, Trash2, WalletCards } from 'lucide-react';
import { useApp } from '@/store';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency } from '@/mockData';
import {
  PERSISTENT_STATE_ERROR_EVENT, usePersistentState,
} from '@/hooks/usePersistentState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ensureCurrentStoreRecurringBills, EMPTY_STORE_FINANCES, getBillAlert, getBillPaymentOptions,
  getCustomerBillStatus, type CustomerBillStatus, type FinanceBill,
} from '@/lib/storeFinances';
import { loadAdminBilling } from '@/lib/adminBilling';
import { getPeriodRange, type ReportPeriod } from '@/lib/criticalFlows';
import { buildFinancialStatement } from '@/lib/financialStatement';
import type { CashRegisterData } from '@/types';
import { toast } from 'sonner';

const EMPTY_REGISTER: CashRegisterData = { activeSessionId: null, sessions: [], sales: [], movements: [] };
const PERIOD_LABELS: Record<ReportPeriod, string> = {
  day: 'Diário',
  week: 'Semanal',
  month: 'Mensal',
  year: 'Anual',
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const CUSTOMER_BILL_STATUS_LABELS: Record<CustomerBillStatus, string> = {
  paid: 'Paga',
  overdue: 'Atrasada',
  expired: 'Expirada',
  pending: 'Pendente',
};

function formatBillMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  if (!year || !value || value > 12) return month;
  return new Date(year, value - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `bill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ALERT_LABELS = {
  paid: 'Pago',
  overdue: 'Vencido',
  'due-soon': 'Vence em até 7 dias',
  upcoming: 'A vencer',
  expired: 'Boleto expirado',
  none: 'Sem vencimento',
} as const;

export function FinanceModule() {
  const { selectedEstablishment } = useApp();
  const { user } = useAuth();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [finances, setFinances, financesLoaded] = usePersistentState(`store-finances:${establishmentId}`, EMPTY_STORE_FINANCES);
  const [cashRegister, , cashRegisterLoaded] = usePersistentState<CashRegisterData>(
    `cash-register:${establishmentId}`,
    EMPTY_REGISTER,
    { readOnly: true },
  );
  const [kitoBilling, setKitoBilling] = useState(EMPTY_STORE_FINANCES);
  const [kitoBillingLoading, setKitoBillingLoading] = useState(false);
  const [kitoBillingError, setKitoBillingError] = useState('');
  const [cashRegisterError, setCashRegisterError] = useState('');
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [referenceDate, setReferenceDate] = useState(() => localDateKey(new Date()));
  const billingRequestId = useRef(0);
  const [kitoPaymentSelections, setKitoPaymentSelections] = useState<Record<string, 'boleto' | 'pix'>>({});
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => localDateKey(new Date()));
  const [isRecurring, setIsRecurring] = useState(false);
  const [boletoCode, setBoletoCode] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<Pick<FinanceBill, 'description' | 'amount' | 'dueDate' | 'boletoCode' | 'validUntil' | 'isRecurring'> | null>(null);

  const refreshKitoBilling = useCallback(async (showLoading = false) => {
    const requestId = ++billingRequestId.current;
    if (showLoading) setKitoBillingLoading(true);
    try {
      const loaded = await loadAdminBilling(establishmentId, Boolean(user?.isDemo));
      if (requestId === billingRequestId.current) {
        setKitoBilling(loaded);
        setKitoBillingError('');
      }
    } catch (error) {
      if (requestId === billingRequestId.current) {
        setKitoBillingError(error instanceof Error ? error.message : 'Não foi possível carregar as cobranças do Kito.');
      }
    } finally {
      if (requestId === billingRequestId.current) setKitoBillingLoading(false);
    }
  }, [establishmentId, user?.isDemo]);

  useEffect(() => {
    if (!financesLoaded) return;
    setFinances((current) => ensureCurrentStoreRecurringBills(current, new Date(), createId));
  }, [financesLoaded, finances.bills, finances.recurring, setFinances]);

  useEffect(() => {
    let active = true;
    const refreshWhenVisible = () => {
      if (active && document.visibilityState === 'visible') void refreshKitoBilling();
    };
    void refreshKitoBilling(true);
    const intervalId = window.setInterval(() => { void refreshKitoBilling(); }, 30_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshKitoBilling]);

  useEffect(() => {
    const storageKey = `store-finances:${establishmentId}`;
    const handlePersistenceError = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; message: string }>).detail;
      if (detail?.key !== storageKey) return;
      toast.error(`Não foi possível salvar as finanças: ${detail.message}`, {
        description: 'Verifique sua conexão e permissão de Finanças. No Supabase, confirme que a migration 20261109000000_store_finances_permission.sql foi aplicada.',
        duration: 10000,
      });
    };
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, handlePersistenceError);
    return () => {
      window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, handlePersistenceError);
    };
  }, [establishmentId]);

  useEffect(() => {
    const storageKey = `cash-register:${establishmentId}`;
    setCashRegisterError('');
    const handlePersistenceError = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; message: string }>).detail;
      if (detail?.key === storageKey) setCashRegisterError(detail.message);
    };
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, handlePersistenceError);
    return () => window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, handlePersistenceError);
  }, [establishmentId]);

  const today = new Date();
  const sortedBills = [...finances.bills].sort((first, second) => first.dueDate.localeCompare(second.dueDate));
  const unpaidAlerts = sortedBills.filter((bill) => ['overdue', 'due-soon', 'expired'].includes(getBillAlert(bill, today)));
  const storeUnpaidTotal = finances.bills
    .filter((bill) => !bill.paidAt)
    .reduce((sum, bill) => sum + bill.amount, 0);
  const kitoUnpaidTotal = kitoBilling.bills.filter((bill) => !bill.paidAt).reduce((sum, bill) => sum + bill.amount, 0);
  const monthlySalesTotal = cashRegister.sales
    .filter((sale) => sale.status !== 'cancelled' && new Date(sale.createdAt).getFullYear() === today.getFullYear() && new Date(sale.createdAt).getMonth() === today.getMonth())
    .reduce((sum, sale) => sum + sale.total, 0);
  const monthlyExpensesTotal = (cashRegister.expenses ?? [])
    .filter((expense) => !expense.cancelledAt && new Date(expense.createdAt).getFullYear() === today.getFullYear() && new Date(expense.createdAt).getMonth() === today.getMonth())
    .reduce((sum, expense) => sum + expense.amount, 0);
  const periodBounds = useMemo(() => getPeriodRange(period, referenceDate), [period, referenceDate]);
  const financialStatement = useMemo(() => buildFinancialStatement({
    sales: cashRegister.sales,
    expenses: cashRegister.expenses ?? [],
    storeBills: finances.bills,
    kitoBills: kitoBilling.bills,
    period,
    referenceDate,
  }), [cashRegister.expenses, cashRegister.sales, finances.bills, kitoBilling.bills, period, referenceDate]);

  const addBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!financesLoaded) {
      toast.error('Aguarde o carregamento das finanças antes de adicionar um boleto.');
      return;
    }
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0 || !dueDate) {
      toast.error('Informe a descrição, um valor maior que zero e o vencimento.');
      return;
    }
    const id = createId();
    setFinances((current) => ({
      ...current,
      bills: [...current.bills, {
        id,
        description: description.trim(),
        amount: Math.round(value * 100) / 100,
        dueDate,
        boletoCode: boletoCode.trim(),
        validUntil,
        ...(isRecurring && {
          isRecurring: true,
          recurrenceId: id,
          recurrenceDay: Number(dueDate.slice(-2)),
          recurringMonth: dueDate.slice(0, 7),
        }),
      }],
    }));
    setDescription('');
    setAmount('');
    setDueDate(localDateKey(new Date()));
    setIsRecurring(false);
    setBoletoCode('');
    setValidUntil('');
    toast.success(isRecurring ? 'Boleto recorrente cadastrado.' : 'Boleto cadastrado.');
  };

  const beginEdit = (bill: FinanceBill) => {
    if (!financesLoaded) return;
    setEditingBillId(bill.id);
    setBillDraft({
      description: bill.description,
      amount: bill.amount,
      dueDate: bill.dueDate,
      boletoCode: bill.boletoCode,
      validUntil: bill.validUntil,
      isRecurring: bill.isRecurring ?? false,
    });
  };

  const saveBill = () => {
    if (!financesLoaded || !editingBillId || !billDraft) return;
    const value = Number(billDraft.amount);
    if (!billDraft.description.trim() || !Number.isFinite(value) || value <= 0 || !billDraft.dueDate) {
      toast.error('Informe a descrição, um valor maior que zero e o vencimento.');
      return;
    }
    setFinances((current) => {
      const currentBill = current.bills.find((bill) => bill.id === editingBillId);
      const recurrenceId = currentBill?.recurrenceId;
      return {
        ...current,
        bills: current.bills.map((bill) => {
          if (bill.id === editingBillId) return {
            ...bill,
            ...billDraft,
            description: billDraft.description.trim(),
            amount: Math.round(value * 100) / 100,
            boletoCode: billDraft.boletoCode.trim(),
            ...(billDraft.isRecurring && {
              recurrenceId: bill.recurrenceId ?? bill.id,
              recurrenceDay: Number(billDraft.dueDate.slice(-2)),
              recurringMonth: billDraft.dueDate.slice(0, 7),
            }),
          };
          if (!billDraft.isRecurring && recurrenceId && (bill.recurrenceId ?? bill.id) === recurrenceId) {
            return { ...bill, isRecurring: false };
          }
          return bill;
        }),
      };
    });
    setEditingBillId(null);
    setBillDraft(null);
  };

  const togglePaid = (billId: string) => {
    if (!financesLoaded) return;
    setFinances((current) => ({
      ...current,
      bills: current.bills.map((bill) => bill.id === billId
        ? { ...bill, paidAt: bill.paidAt ? undefined : new Date().toISOString() }
        : bill),
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><WalletCards className="h-6 w-6 text-primary" />Finanças</h1>
        <p className="text-muted-foreground">Consulte o faturamento, as contas e os pagamentos da loja.</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Resumo</TabsTrigger>
          <TabsTrigger value="kito">Mensalidade Kito</TabsTrigger>
          <TabsTrigger value="bills">Contas e boletos</TabsTrigger>
          <TabsTrigger value="statement">Extrato</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {unpaidAlerts.length > 0 && (
            <Card role="status" className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <Bell className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{unpaidAlerts.length} conta(s) precisam de atenção</p>
                <p className="text-sm">{unpaidAlerts.filter((bill) => getBillAlert(bill, today) === 'overdue').length} vencida(s) · {unpaidAlerts.filter((bill) => getBillAlert(bill, today) === 'due-soon').length} vencem nos próximos 7 dias · {unpaidAlerts.filter((bill) => getBillAlert(bill, today) === 'expired').length} boleto(s) expirado(s).</p>
              </div>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4"><p className="text-sm text-muted-foreground">Faturamento neste mês</p><p className="mt-1 text-xl font-bold">{cashRegisterLoaded && !cashRegisterError ? formatCurrency(monthlySalesTotal) : '—'}</p></Card>
            <Card className="p-4"><p className="text-sm text-muted-foreground">Contas da loja em aberto</p><p className="mt-1 text-xl font-bold">{financesLoaded ? formatCurrency(storeUnpaidTotal) : '—'}</p></Card>
            <Card className="p-4"><p className="text-sm text-muted-foreground">Cobranças Kito em aberto</p><p className="mt-1 text-xl font-bold">{!kitoBillingLoading && !kitoBillingError ? formatCurrency(kitoUnpaidTotal) : '—'}</p></Card>
            <Card className="p-4"><p className="text-sm text-muted-foreground">Despesas registradas neste mês</p><p className="mt-1 text-xl font-bold">{cashRegisterLoaded && !cashRegisterError ? formatCurrency(monthlyExpensesTotal) : '—'}</p></Card>
          </div>
          {!cashRegisterLoaded && <Card role="status" className="p-4 text-sm text-muted-foreground">Carregando faturamento e despesas...</Card>}
          {cashRegisterError && <Card role="alert" className="border-destructive p-4 text-sm text-destructive">Não foi possível carregar o faturamento e as despesas: {cashRegisterError}. Verifique a permissão de Finanças e aplique as migrations atualizadas.</Card>}
          <Card className="p-5">
            <h2 className="font-semibold">Visão geral</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use as abas para consultar a mensalidade Kito, os boletos da loja ou o extrato detalhado de vendas e pagamentos.</p>
          </Card>
        </TabsContent>

        <TabsContent value="kito" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Mensalidade e cobranças do Kito</h2>
              <p className="text-sm text-muted-foreground">O Super Admin confirma os pagamentos. O status é atualizado automaticamente nesta tela.</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={kitoBillingLoading} onClick={() => void refreshKitoBilling(true)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${kitoBillingLoading ? 'animate-spin' : ''}`} />Atualizar status
            </Button>
          </div>
        {kitoBillingLoading && <Card className="p-5 text-sm text-muted-foreground">Carregando cobranças do Kito...</Card>}
        {kitoBillingError && <Card role="alert" className="border-destructive p-4 text-sm text-destructive">
          Não foi possível carregar as cobranças do Kito: {kitoBillingError}. Se estiver usando Supabase, aplique a migration `20261109120000_kito_billing_read.sql`.
        </Card>}
        {!kitoBillingLoading && !kitoBillingError && !kitoBilling.bills.length && (
          <Card className="p-5 text-center text-sm text-muted-foreground">Nenhuma cobrança do Kito foi emitida para esta loja.</Card>
        )}
        {!kitoBillingLoading && !kitoBillingError && [...kitoBilling.bills]
          .sort((first, second) => first.dueDate.localeCompare(second.dueDate))
          .map((bill) => {
            const alert = getBillAlert(bill, today);
            const billStatus = getCustomerBillStatus(bill, today);
            const paymentOptions = getBillPaymentOptions(bill);
            const selectedPaymentType = kitoPaymentSelections[bill.id]
              ?? (paymentOptions.some((option) => option.type === 'boleto') ? 'boleto' : paymentOptions[0]?.type);
            const selectedPayment = paymentOptions.find((option) => option.type === selectedPaymentType);
            return (
              <Card key={bill.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{bill.description}</h3>
                  <Badge variant={alert === 'paid' ? 'secondary' : alert === 'overdue' || alert === 'expired' ? 'destructive' : 'outline'}>
                    {alert === 'overdue' || alert === 'expired' ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
                    {CUSTOMER_BILL_STATUS_LABELS[billStatus]}
                  </Badge>
                  {bill.recurringMonth && <Badge variant="outline">Mensalidade · {formatBillMonth(bill.recurringMonth)}</Badge>}
                  {paymentOptions.length === 0 && <Badge variant="outline">{bill.paymentType === 'pix' ? 'Pix' : 'Boleto'}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">Vencimento: {new Date(`${bill.dueDate}T00:00:00`).toLocaleDateString('pt-BR')} · Valor: {formatCurrency(bill.amount)}</p>
                {bill.paidAt && <p className="text-sm font-medium text-emerald-700">Pagamento confirmado pelo Kito em {new Date(bill.paidAt).toLocaleDateString('pt-BR')}.</p>}
                {!bill.paidAt && paymentOptions.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Escolha a forma de pagamento para ver os dados:</p>
                    <div className="flex flex-wrap gap-2">
                      {paymentOptions.map((option) => (
                        <Button
                          key={option.type}
                          type="button"
                          size="sm"
                          variant={selectedPaymentType === option.type ? 'default' : 'outline'}
                          aria-pressed={selectedPaymentType === option.type}
                          onClick={() => setKitoPaymentSelections((current) => ({ ...current, [bill.id]: option.type }))}
                        >
                          {option.type === 'pix' ? 'Selecionar Pix' : 'Selecionar boleto'}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {!bill.paidAt && selectedPayment && (
                  <p className="break-all text-sm font-medium">
                    {selectedPayment.type === 'pix' ? 'Chave ou código Pix' : 'Código do boleto'}: {selectedPayment.code}
                  </p>
                )}
                {bill.validUntil && <p className="text-sm text-muted-foreground">Validade: {new Date(`${bill.validUntil}T00:00:00`).toLocaleDateString('pt-BR')}</p>}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="bills" className="space-y-4">

      {!financesLoaded && (
        <Card role="status" className="p-4 text-sm text-muted-foreground">
          Carregando as finanças salvas da loja. Aguarde para editar ou adicionar cobranças.
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Adicionar boleto ou cobrança avulsa</h2>
          <p className="text-sm text-muted-foreground">Registre boletos e contas da própria loja. Eles são separados das cobranças da mensalidade Kito, que só o Super Admin pode gerenciar.</p>
        </div>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={addBill}>
          <fieldset disabled={!financesLoaded} className="contents">
            <label className="space-y-1 text-sm font-medium">Nome do boleto/conta<Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Internet, aluguel, energia" maxLength={100} required /></label>
            <label className="space-y-1 text-sm font-medium">Valor (R$)<CurrencyInput value={Number(amount) || 0} onValueChange={(value) => setAmount(value === null ? '' : String(value))} required /></label>
            <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
            <label className="space-y-1 text-sm font-medium">Código do boleto<Input value={boletoCode} onChange={(event) => setBoletoCode(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium">Validade do boleto<Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-5">
              <input type="checkbox" checked={isRecurring} onChange={(event) => setIsRecurring(event.target.checked)} />
              Repetir este boleto todo mês
            </label>
            <div className="sm:col-span-2 lg:col-span-5"><Button type="submit"><Plus className="mr-2 h-4 w-4" />Adicionar cobrança</Button></div>
          </fieldset>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold">Boletos e cobranças</h2>
        {!sortedBills.length && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum boleto cadastrado.</Card>}
        {sortedBills.map((bill) => {
          const alert = getBillAlert(bill, today);
          const isEditing = editingBillId === bill.id && billDraft;
          return (
            <Card key={bill.id} className="space-y-3 p-4">
              {isEditing ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="space-y-1 text-sm font-medium">Nome do boleto/conta<Input value={billDraft.description} onChange={(event) => setBillDraft({ ...billDraft, description: event.target.value })} maxLength={100} /></label>
                  <label className="space-y-1 text-sm font-medium">Valor (R$)<CurrencyInput value={billDraft.amount} onValueChange={(value) => setBillDraft({ ...billDraft, amount: value ?? 0 })} /></label>
                  <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={billDraft.dueDate} onChange={(event) => setBillDraft({ ...billDraft, dueDate: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Código do boleto<Input value={billDraft.boletoCode} onChange={(event) => setBillDraft({ ...billDraft, boletoCode: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Validade<Input type="date" value={billDraft.validUntil} onChange={(event) => setBillDraft({ ...billDraft, validUntil: event.target.value })} /></label>
                  <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={billDraft.isRecurring ?? false} onChange={(event) => setBillDraft({ ...billDraft, isRecurring: event.target.checked })} />
                      Repetir este boleto todo mês
                    </label>
                  </div>
                  <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                    <Button type="button" size="sm" onClick={saveBill}>Salvar</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setEditingBillId(null); setBillDraft(null); }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{bill.description}</h3>
                      <Badge variant={alert === 'paid' ? 'secondary' : alert === 'overdue' || alert === 'expired' ? 'destructive' : alert === 'due-soon' ? 'outline' : 'secondary'}>
                        {alert === 'overdue' || alert === 'expired' ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
                        {ALERT_LABELS[alert]}
                      </Badge>
                      {bill.paymentType && <Badge variant="outline">{bill.paymentType === 'pix' ? 'Pix' : 'Boleto'}</Badge>}
                      {bill.isRecurring && <Badge variant="outline">Mensal</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Vencimento: {new Date(`${bill.dueDate}T00:00:00`).toLocaleDateString('pt-BR')} · Valor: {formatCurrency(bill.amount)}</p>
                    {bill.boletoCode && <p className="break-all text-sm text-muted-foreground">{bill.paymentType === 'pix' ? 'Chave ou código Pix' : 'Código do boleto'}: {bill.boletoCode}</p>}
                    {bill.validUntil && <p className="text-sm text-muted-foreground">Validade: {new Date(`${bill.validUntil}T00:00:00`).toLocaleDateString('pt-BR')}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={!financesLoaded} onClick={() => togglePaid(bill.id)}>
                      <Check className="mr-1 h-4 w-4" />{bill.paidAt ? 'Reabrir' : 'Marcar pago'}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" disabled={!financesLoaded} aria-label={`Editar ${bill.description}`} onClick={() => beginEdit(bill)}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" disabled={!financesLoaded} aria-label={`Excluir ${bill.description}`} onClick={() => {
                      const recurrenceId = bill.isRecurring ? bill.recurrenceId ?? bill.id : undefined;
                      const confirmMessage = recurrenceId
                        ? `Excluir "${bill.description}" e encerrar a recorrência mensal?`
                        : `Excluir a cobrança "${bill.description}"?`;
                      if (window.confirm(confirmMessage)) {
                        setFinances((current) => ({
                          ...current,
                          bills: current.bills
                            .filter((entry) => entry.id !== bill.id)
                            .map((entry) => recurrenceId && (entry.recurrenceId ?? entry.id) === recurrenceId
                              ? { ...entry, isRecurring: false }
                              : entry),
                        }));
                      }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </section>
        </TabsContent>

        <TabsContent value="statement" className="space-y-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <label className="space-y-1 text-sm font-medium">Período
              <select value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Data de referência
              <Input type="date" value={referenceDate} onChange={(event) => { if (event.target.value) setReferenceDate(event.target.value); }} />
            </label>
            <p className="pb-2 text-sm text-muted-foreground">
              {period === 'day'
                ? new Date(`${referenceDate}T00:00:00`).toLocaleDateString('pt-BR')
                : `${periodBounds.start.toLocaleDateString('pt-BR')} a ${new Date(periodBounds.end.getTime() - 86_400_000).toLocaleDateString('pt-BR')}`}
            </p>
          </Card>

          {!cashRegisterLoaded && <Card role="status" className="p-4 text-sm text-muted-foreground">Carregando vendas e despesas...</Card>}
          {cashRegisterError && <Card role="alert" className="border-destructive p-4 text-sm text-destructive">Não foi possível carregar vendas e despesas para o extrato: {cashRegisterError}.</Card>}
          {kitoBillingError && <Card role="alert" className="border-destructive p-4 text-sm text-destructive">Não foi possível carregar as cobranças Kito para o extrato: {kitoBillingError}.</Card>}

          {cashRegisterLoaded && !cashRegisterError && !kitoBillingLoading && !kitoBillingError && financesLoaded && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Card className="p-4"><p className="text-sm text-muted-foreground">Faturamento bruto</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(financialStatement.grossRevenue)}</p></Card>
                <Card className="p-4"><p className="text-sm text-muted-foreground">Despesas registradas</p><p className="mt-1 text-xl font-bold">{formatCurrency(financialStatement.cashExpenseTotal)}</p></Card>
                <Card className="p-4"><p className="text-sm text-muted-foreground">Boletos/contas da loja pagos</p><p className="mt-1 text-xl font-bold">{formatCurrency(financialStatement.storeBillPaymentsTotal)}</p></Card>
                <Card className="p-4"><p className="text-sm text-muted-foreground">Mensalidade/cobranças Kito pagas</p><p className="mt-1 text-xl font-bold">{formatCurrency(financialStatement.kitoBillPaymentsTotal)}</p></Card>
                <Card className="p-4"><p className="text-sm text-muted-foreground">Total de saídas</p><p className="mt-1 text-xl font-bold text-rose-700">{formatCurrency(financialStatement.totalOutflows)}</p></Card>
                <Card className="p-4"><p className="text-sm text-muted-foreground">Saldo do período · faturamento menos saídas</p><p className="mt-1 text-xl font-bold">{formatCurrency(financialStatement.balance)}</p></Card>
              </div>

              <Card className="p-5">
                <div className="mb-3">
                  <h2 className="font-semibold">Extrato de vendas e pagamentos</h2>
                  <p className="text-sm text-muted-foreground">Vendas e despesas canceladas não entram nos totais. Boletos aparecem como saída quando o administrador confirma o pagamento.</p>
                </div>
                {financialStatement.rows.length ? (
                  <div className="divide-y">
                    {financialStatement.rows.map((entry) => (
                      <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={entry.type === 'revenue' ? 'secondary' : 'outline'}>{entry.type === 'revenue' ? 'Venda' : 'Pagamento'}</Badge>
                            <p className="font-medium">{entry.description}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(entry.date).toLocaleString('pt-BR')} · {entry.detail}</p>
                        </div>
                        <p className={`font-semibold tabular-nums ${entry.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {entry.type === 'revenue' ? '+' : '−'}{formatCurrency(entry.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda, despesa ou conta paga neste período.</p>}
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
