import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Pencil, Plus, Trash2, WalletCards } from 'lucide-react';
import type { Establishment } from '@/types';
import { formatCurrency } from '@/mockData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ensureAdminMonthlyBill, ensureNextAdminMonthlyBill, loadAdminBilling, saveAdminBilling } from '@/lib/adminBilling';
import { EMPTY_STORE_FINANCES, getBillAlert, getBillPaymentOptions, type BillAlert, type FinanceBill, type StoreFinances } from '@/lib/storeFinances';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `kito-bill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const BILL_LABELS = {
  paid: 'Paga',
  overdue: 'Vencida',
  'due-today': 'Vence hoje',
  'due-soon': 'Vence em menos de 7 dias',
  upcoming: 'Vence em 7 dias ou mais',
  expired: 'Boleto expirado',
  none: 'Sem vencimento',
} as const;

const BILL_ALERT_STYLES: Record<BillAlert, string> = {
  paid: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  overdue: 'border-red-300 bg-red-50 text-red-800',
  'due-today': 'border-orange-300 bg-orange-50 text-orange-900',
  'due-soon': 'border-yellow-300 bg-yellow-50 text-yellow-900',
  upcoming: 'border-slate-300 bg-slate-100 text-slate-700',
  expired: 'border-red-300 bg-red-50 text-red-800',
  none: 'border-slate-300 bg-slate-100 text-slate-700',
};

const BILL_DUE_DATE_STYLES: Record<BillAlert, string> = {
  paid: 'text-emerald-800',
  overdue: 'text-red-800',
  'due-today': 'text-orange-900',
  'due-soon': 'text-yellow-900',
  upcoming: 'text-slate-700',
  expired: 'text-red-800',
  none: 'text-muted-foreground',
};

export function AdminBillingPanel({
  establishments,
  onUpdateMonthlyRevenue,
}: {
  establishments: Establishment[];
  onUpdateMonthlyRevenue: (establishmentId: string, monthlyRevenue: number) => Promise<void>;
}) {
  const { user } = useAuth();
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? '');
  const [billing, setBilling] = useState<StoreFinances>(EMPTY_STORE_FINANCES);
  const [loading, setLoading] = useState(false);
  const [loadedEstablishmentId, setLoadedEstablishmentId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringDay, setRecurringDay] = useState('10');
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [addBillDialogOpen, setAddBillDialogOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayKey);
  const [paymentType, setPaymentType] = useState<'boleto' | 'pix'>('boleto');
  const [boletoCode, setBoletoCode] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [savingBillId, setSavingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<Pick<FinanceBill, 'description' | 'amount' | 'dueDate' | 'boletoCode' | 'pixCode' | 'paymentType' | 'validUntil'> | null>(null);

  const selectedEstablishment = establishments.find((establishment) => establishment.id === establishmentId);
  const attentionBills = billing.bills.filter((bill) => ['overdue', 'due-today', 'due-soon', 'expired'].includes(getBillAlert(bill, new Date())));

  useEffect(() => {
    if (!establishments.some((establishment) => establishment.id === establishmentId)) {
      setEstablishmentId(establishments[0]?.id ?? '');
    }
  }, [establishmentId, establishments]);

  useEffect(() => {
    if (!establishmentId) {
      setBilling(EMPTY_STORE_FINANCES);
      setLoadedEstablishmentId('');
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError('');
    void loadAdminBilling(establishmentId, Boolean(user?.isDemo))
      .then((loaded) => {
        if (!active) return;
        const storeMonthlyAmount = establishments.find((entry) => entry.id === establishmentId)?.monthlyRevenue ?? 0;
        const monthlyAmount = loaded.recurring.enabled
          ? storeMonthlyAmount
          : loaded.recurring.amount || storeMonthlyAmount;
        const normalized = loaded.recurring.enabled && loaded.recurring.amount !== monthlyAmount
          ? { ...loaded, recurring: { ...loaded.recurring, amount: monthlyAmount } }
          : loaded;
        setBilling(normalized);
        setRecurringDay(String(loaded.recurring.dueDay));
        setRecurringEnabled(loaded.recurring.enabled);
        setRecurringAmount(String(monthlyAmount));
        setLoadedEstablishmentId(establishmentId);
      })
      .catch((error: unknown) => {
        if (active) {
          setBilling(EMPTY_STORE_FINANCES);
          setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as cobranças.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [establishmentId, establishments, user?.isDemo]);

  useEffect(() => {
    if (!selectedEstablishment || loadedEstablishmentId !== establishmentId || loading || loadError || !billing.recurring.enabled || billing.recurring.amount <= 0) return;
    const latestMonthly = billing.bills.filter((bill) => bill.recurringMonth)
      .sort((a, b) => (b.recurringMonth ?? '').localeCompare(a.recurringMonth ?? ''))[0];
    const withNext = latestMonthly?.paidAt ? ensureNextAdminMonthlyBill(billing, latestMonthly, createId) : billing;
    const updated = ensureAdminMonthlyBill(withNext, billing.recurring.amount, new Date(), createId);
    if (updated === billing) return;
    setBilling(updated);
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a mensalidade.'));
  }, [billing, establishmentId, loadedEstablishmentId, loadError, loading, selectedEstablishment, user?.isDemo]);

  const saveRecurringSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEstablishment || loadError || loadedEstablishmentId !== establishmentId) return;
    const day = Number(recurringDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      toast.error('Informe um dia de vencimento entre 1 e 31.');
      return;
    }
    const monthlyAmount = Number(recurringAmount);
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0 || (recurringEnabled && monthlyAmount === 0)) {
      toast.error('Informe um valor mensal válido; a mensalidade fixa precisa ser maior que zero.');
      return;
    }
    const updated: StoreFinances = {
      ...billing,
      recurring: {
        enabled: recurringEnabled,
        dueDay: day,
        amount: Math.round(monthlyAmount * 100) / 100,
      },
    };
    let updatedBilling = recurringEnabled
      ? ensureAdminMonthlyBill(updated, monthlyAmount, new Date(), createId)
      : updated;
    const currentMonth = todayKey().slice(0, 7);
    updatedBilling = {
      ...updatedBilling,
      bills: updatedBilling.bills.map((bill) => recurringEnabled && bill.recurringMonth === currentMonth && !bill.paidAt
        ? {
          ...bill,
          amount: Math.round(monthlyAmount * 100) / 100,
          dueDate: `${currentMonth}-${String(Math.min(day, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())).padStart(2, '0')}`,
        }
        : bill),
    };
    setBilling(updatedBilling);
    void Promise.all([
      saveAdminBilling(selectedEstablishment.id, updatedBilling, Boolean(user?.isDemo)),
      onUpdateMonthlyRevenue(selectedEstablishment.id, Math.round(monthlyAmount * 100) / 100),
    ])
      .then(() => {
        setRecurringDialogOpen(false);
        toast.success(recurringEnabled ? 'Mensalidade fixa configurada para esta loja.' : 'Geração automática desativada.');
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a configuração.'));
  };

  const addBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEstablishment || loadError || loadedEstablishmentId !== establishmentId) return;
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0 || !dueDate) {
      toast.error('Informe descrição, valor maior que zero e vencimento.');
      return;
    }
    const updated: StoreFinances = {
      ...billing,
      bills: [...billing.bills, {
        id: createId(),
        description: description.trim(),
        amount: Math.round(value * 100) / 100,
        dueDate,
        boletoCode: boletoCode.trim(),
        paymentType,
        validUntil,
      }],
    };
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .then(() => {
        setBilling(updated);
        setAddBillDialogOpen(false);
        toast.success('Cobrança da mensalidade Kito criada.');
        setDescription('');
        setAmount('');
        setDueDate(todayKey());
        setPaymentType('boleto');
        setBoletoCode('');
        setValidUntil('');
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a cobrança.'));
  };

  const saveBill = () => {
    if (!selectedEstablishment || loadError || loadedEstablishmentId !== establishmentId || !editingBillId || !billDraft) return;
    const value = Number(billDraft.amount);
    if (!billDraft.description.trim() || !Number.isFinite(value) || value <= 0 || !billDraft.dueDate) {
      toast.error('Informe descrição, valor maior que zero e vencimento.');
      return;
    }
    const updated = {
      ...billing,
      bills: billing.bills.map((bill) => bill.id === editingBillId
        ? { ...bill, ...billDraft, description: billDraft.description.trim(), amount: Math.round(value * 100) / 100, boletoCode: billDraft.boletoCode.trim(), pixCode: billDraft.pixCode?.trim() }
        : bill),
    };
    setBilling(updated);
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .then(() => toast.success('Cobrança atualizada.'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a cobrança.'));
    setEditingBillId(null);
    setBillDraft(null);
  };

  const updateBill = async (billId: string, update: (bill: FinanceBill) => FinanceBill) => {
    if (!selectedEstablishment || loadError || loadedEstablishmentId !== establishmentId) return;
    const updatedBill = billing.bills.find((bill) => bill.id === billId);
    if (!updatedBill) return;
    const changedBill = update(updatedBill);
    setSavingBillId(billId);
    try {
      const updated = ensureNextAdminMonthlyBill(
        { ...billing, bills: billing.bills.map((bill) => bill.id === billId ? changedBill : bill) },
        changedBill,
        createId,
      );
      await saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo));
      setBilling(updated);
      toast.success('Status de pagamento atualizado nas Finanças da loja.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o status do pagamento.');
    } finally {
      setSavingBillId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><WalletCards className="h-6 w-6 text-primary" />Finanças do Kito</h1>
        <p className="text-muted-foreground">Gerencie mensalidades e cobranças do sistema por loja. Estas informações são exclusivas do Super Admin.</p>
      </div>

      <Card className="space-y-4 p-5">
        <label className="block max-w-xl space-y-1 text-sm font-medium">Selecionar loja
          <select
            value={establishmentId}
            onChange={(event) => setEstablishmentId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>{establishment.name} · {formatCurrency(establishment.monthlyRevenue)}/mês</option>
            ))}
          </select>
        </label>
        {selectedEstablishment && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            Mensalidade Kito: <strong>{formatCurrency(selectedEstablishment.monthlyRevenue)}</strong>
          </div>
        )}
      </Card>

      {!selectedEstablishment ? (
        <Card className="p-6 text-sm text-muted-foreground">Cadastre uma loja para gerenciar as mensalidades do Kito.</Card>
      ) : (
        <>
          {loadError && <Card role="alert" className="border-destructive p-4 text-sm text-destructive">{loadError} Atualize a página antes de fazer alterações.</Card>}
          {!loading && !loadError && attentionBills.length > 0 && (
            <Card role="status" className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{attentionBills.length} cobrança(s) precisam de atenção</p>
                <p className="text-sm">{attentionBills.filter((bill) => getBillAlert(bill, new Date()) === 'overdue').length} vencida(s) · {attentionBills.filter((bill) => getBillAlert(bill, new Date()) === 'due-soon').length} vencem nos próximos 7 dias · {attentionBills.filter((bill) => getBillAlert(bill, new Date()) === 'expired').length} boleto(s) expirado(s).</p>
              </div>
            </Card>
          )}
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Mensalidade fixa</h2>
                <p className="text-sm text-muted-foreground">
                  {recurringEnabled
                    ? `Ativa · dia ${recurringDay} · ${formatCurrency(Number(recurringAmount) || 0)} por mês`
                    : 'Geração mensal desativada'}
                </p>
                <p className="text-xs text-muted-foreground">Os pagamentos são liberados individualmente em cada cobrança.</p>
              </div>
              <Button type="button" variant="outline" disabled={loading || Boolean(loadError) || loadedEstablishmentId !== establishmentId} onClick={() => setRecurringDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />Editar mensalidade
              </Button>
            </div>
          </Card>

          <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar mensalidade Kito</DialogTitle>
                <DialogDescription>Configure o valor e vencimento de {selectedEstablishment.name}.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={saveRecurringSettings}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                    <input type="checkbox" checked={recurringEnabled} onChange={(event) => setRecurringEnabled(event.target.checked)} />
                    Gerar mensalidade todo mês
                  </label>
                  <label className="space-y-1 text-sm font-medium">Valor mensal (R$)
                    <CurrencyInput value={Number(recurringAmount) || 0} onValueChange={(value) => setRecurringAmount(value === null ? '' : String(value))} />
                  </label>
                  <label className="space-y-1 text-sm font-medium">Dia do vencimento
                    <Input type="number" min="1" max="31" value={recurringDay} onChange={(event) => setRecurringDay(event.target.value)} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">Para liberar boleto ou Pix, edite a cobrança correspondente na lista.</p>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRecurringDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={loading || Boolean(loadError) || loadedEstablishmentId !== establishmentId}>Salvar mensalidade</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <div className="flex justify-end">
            <Button type="button" onClick={() => setAddBillDialogOpen(true)} disabled={loading || Boolean(loadError) || loadedEstablishmentId !== establishmentId}>
              <Plus className="mr-2 h-4 w-4" />Gerar cobrança avulsa
            </Button>
          </div>
          <Dialog open={addBillDialogOpen} onOpenChange={setAddBillDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Gerar cobrança avulsa</DialogTitle>
                <DialogDescription>Crie uma cobrança específica da mensalidade Kito para {selectedEstablishment.name}.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={addBill}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium">Descrição<Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mensalidade Kito" required /></label>
                  <label className="space-y-1 text-sm font-medium">Valor (R$)<CurrencyInput value={Number(amount) || 0} onValueChange={(value) => setAmount(value === null ? '' : String(value))} required /></label>
                  <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
                  <label className="space-y-1 text-sm font-medium">Tipo de pagamento
                    <select value={paymentType} onChange={(event) => setPaymentType(event.target.value as 'boleto' | 'pix')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="boleto">Boleto</option>
                      <option value="pix">Pix</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-medium">{paymentType === 'pix' ? 'Chave ou código Pix' : 'Código do boleto'}<Input value={boletoCode} onChange={(event) => setBoletoCode(event.target.value)} /></label>
                  <label className="space-y-1 text-sm font-medium">{paymentType === 'pix' ? 'Validade (opcional)' : 'Validade do boleto'}<Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddBillDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={loading || Boolean(loadError) || loadedEstablishmentId !== establishmentId}><Plus className="mr-2 h-4 w-4" />Gerar cobrança</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <section className="space-y-3">
            <h2 className="font-semibold">Cobranças de {selectedEstablishment.name}</h2>
            {loading && <Card className="p-5 text-sm text-muted-foreground">Carregando cobranças...</Card>}
            {!loading && !billing.bills.length && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma cobrança do Kito para esta loja.</Card>}
            {billing.bills.map((bill) => {
              const status = getBillAlert(bill, new Date());
              const isEditing = editingBillId === bill.id && billDraft;
              return (
                <Card key={bill.id} className="space-y-3 p-4">
                  {isEditing ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="space-y-1 text-sm font-medium">Descrição<Input value={billDraft.description} onChange={(event) => setBillDraft({ ...billDraft, description: event.target.value })} /></label>
                      <label className="space-y-1 text-sm font-medium">Valor<CurrencyInput value={billDraft.amount} onValueChange={(value) => setBillDraft({ ...billDraft, amount: value ?? 0 })} /></label>
                      <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={billDraft.dueDate} onChange={(event) => setBillDraft({ ...billDraft, dueDate: event.target.value })} /></label>
                      {!bill.recurringMonth && <label className="space-y-1 text-sm font-medium">Tipo de pagamento
                        <select value={billDraft.paymentType ?? 'boleto'} onChange={(event) => setBillDraft({ ...billDraft, paymentType: event.target.value as 'boleto' | 'pix' })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="boleto">Boleto</option>
                          <option value="pix">Pix</option>
                        </select>
                      </label>}
                      <label className="space-y-1 text-sm font-medium">{bill.recurringMonth ? 'Código do boleto' : billDraft.paymentType === 'pix' ? 'Chave ou código Pix' : 'Código do boleto'}<Input value={billDraft.boletoCode} onChange={(event) => setBillDraft({ ...billDraft, boletoCode: event.target.value })} /></label>
                      <label className="space-y-1 text-sm font-medium">Chave/código Pix{bill.recurringMonth ? '' : ' adicional'}<Input value={billDraft.pixCode ?? ''} onChange={(event) => setBillDraft({ ...billDraft, pixCode: event.target.value })} /></label>
                      <label className="space-y-1 text-sm font-medium">Validade<Input type="date" value={billDraft.validUntil} onChange={(event) => setBillDraft({ ...billDraft, validUntil: event.target.value })} /></label>
                      <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                        <Button type="button" size="sm" onClick={saveBill}>Salvar</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setEditingBillId(null); setBillDraft(null); }}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{bill.description}</h3>
                          <Badge variant="outline" className={BILL_ALERT_STYLES[status]}>
                            {status === 'overdue' || status === 'expired' ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
                            {BILL_LABELS[status]}
                          </Badge>
                          {bill.recurringMonth && <Badge variant="outline">Mensalidade Kito · {new Date(`${bill.recurringMonth}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</Badge>}
                        </div>
                        <p className={cn('mt-1 text-base font-semibold', BILL_DUE_DATE_STYLES[status])}>Vencimento: {new Date(`${bill.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(bill.amount)}</p>
                        {bill.boletoCode && bill.paymentType !== 'pix' && <p className="break-all text-sm text-muted-foreground">Código do boleto: {bill.boletoCode}</p>}
                        {bill.pixCode && <p className="break-all text-sm text-muted-foreground">Chave ou código Pix: {bill.pixCode}</p>}
                        {bill.paymentType === 'pix' && !bill.pixCode && bill.boletoCode && <p className="break-all text-sm text-muted-foreground">Chave ou código Pix: {bill.boletoCode}</p>}
                        {bill.validUntil && <p className="text-sm text-muted-foreground">Validade: {new Date(`${bill.validUntil}T00:00:00`).toLocaleDateString('pt-BR')}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingBillId === bill.id}
                          onClick={() => void updateBill(bill.id, (entry) => ({ ...entry, paidAt: entry.paidAt ? undefined : new Date().toISOString() }))}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          {savingBillId === bill.id ? 'Salvando...' : bill.paidAt ? 'Reabrir pagamento' : bill.recurringMonth ? 'Marcar mensalidade paga' : 'Marcar paga'}
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Editar ${bill.description}`} onClick={() => {
                          setEditingBillId(bill.id);
                          const options = getBillPaymentOptions(bill);
                          setBillDraft({
                            description: bill.description, amount: bill.amount, dueDate: bill.dueDate,
                            boletoCode: bill.recurringMonth ? options.find((option) => option.type === 'boleto')?.code ?? '' : bill.boletoCode,
                            pixCode: bill.recurringMonth ? options.find((option) => option.type === 'pix')?.code ?? '' : bill.pixCode,
                            paymentType: bill.recurringMonth ? 'boleto' : bill.paymentType ?? 'boleto', validUntil: bill.validUntil,
                          });
                        }}><Pencil className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${bill.description}`} onClick={() => {
                          if (window.confirm(`Excluir a cobrança "${bill.description}"?`)) {
                            const updated = { ...billing, bills: billing.bills.filter((entry) => entry.id !== bill.id) };
                            setBilling(updated);
                            void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
                              .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a cobrança.'));
                          }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
