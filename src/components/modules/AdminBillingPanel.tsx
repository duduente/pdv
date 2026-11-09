import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Pencil, Plus, Trash2, WalletCards } from 'lucide-react';
import type { Establishment } from '@/types';
import { formatCurrency } from '@/mockData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ensureAdminMonthlyBill, loadAdminBilling, saveAdminBilling } from '@/lib/adminBilling';
import { EMPTY_STORE_FINANCES, getBillAlert, type FinanceBill, type StoreFinances } from '@/lib/storeFinances';
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
  'due-soon': 'Vence em até 7 dias',
  upcoming: 'A vencer',
  expired: 'Boleto expirado',
  none: 'Sem vencimento',
} as const;

export function AdminBillingPanel({ establishments }: { establishments: Establishment[] }) {
  const { user } = useAuth();
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? '');
  const [billing, setBilling] = useState<StoreFinances>(EMPTY_STORE_FINANCES);
  const [loading, setLoading] = useState(false);
  const [loadedEstablishmentId, setLoadedEstablishmentId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringDay, setRecurringDay] = useState('10');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayKey);
  const [boletoCode, setBoletoCode] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<Pick<FinanceBill, 'description' | 'amount' | 'dueDate' | 'boletoCode' | 'validUntil'> | null>(null);

  const selectedEstablishment = establishments.find((establishment) => establishment.id === establishmentId);
  const attentionBills = billing.bills.filter((bill) => ['overdue', 'due-soon', 'expired'].includes(getBillAlert(bill, new Date())));

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
        setBilling(loaded);
        setRecurringDay(String(loaded.recurring.dueDay));
        setRecurringEnabled(loaded.recurring.enabled);
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
  }, [establishmentId, user?.isDemo]);

  useEffect(() => {
    if (!selectedEstablishment || loadedEstablishmentId !== establishmentId || loading || loadError || !billing.recurring.enabled || selectedEstablishment.monthlyRevenue <= 0) return;
    const updated = ensureAdminMonthlyBill(billing, selectedEstablishment.monthlyRevenue, new Date(), createId);
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
    if (recurringEnabled && selectedEstablishment.monthlyRevenue <= 0) {
      toast.error('Defina uma mensalidade maior que zero no cadastro da loja antes de ativar a recorrência.');
      return;
    }
    const updated: StoreFinances = {
      ...billing,
      recurring: {
        enabled: recurringEnabled,
        dueDay: day,
        amount: selectedEstablishment.monthlyRevenue,
      },
    };
    setBilling(updated);
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .then(() => toast.success(recurringEnabled ? 'Mensalidade fixa configurada para esta loja.' : 'Geração automática desativada.'))
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
        validUntil,
      }],
    };
    setBilling(updated);
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .then(() => toast.success('Cobrança da mensalidade Kito criada.'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a cobrança.'));
    setDescription('');
    setAmount('');
    setDueDate(todayKey());
    setBoletoCode('');
    setValidUntil('');
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
        ? { ...bill, ...billDraft, description: billDraft.description.trim(), amount: Math.round(value * 100) / 100, boletoCode: billDraft.boletoCode.trim() }
        : bill),
    };
    setBilling(updated);
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .then(() => toast.success('Cobrança atualizada.'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a cobrança.'));
    setEditingBillId(null);
    setBillDraft(null);
  };

  const updateBill = (billId: string, update: (bill: FinanceBill) => FinanceBill) => {
    if (!selectedEstablishment || loadError || loadedEstablishmentId !== establishmentId) return;
    const updated = { ...billing, bills: billing.bills.map((bill) => bill.id === billId ? update(bill) : bill) };
    setBilling(updated);
    void saveAdminBilling(selectedEstablishment.id, updated, Boolean(user?.isDemo))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a cobrança.'));
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
            Mensalidade configurada no cadastro da loja: <strong>{formatCurrency(selectedEstablishment.monthlyRevenue)}</strong>
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
            <div>
              <h2 className="font-semibold">Mensalidade fixa de {selectedEstablishment.name}</h2>
              <p className="text-sm text-muted-foreground">O valor vem da mensalidade definida no cadastro da loja. Se a recorrência estiver ativa, uma cobrança do mês é gerada ao abrir esta aba; você pode editar o código e a validade do boleto.</p>
            </div>
            <form className="flex flex-wrap items-end gap-3" onSubmit={saveRecurringSettings}>
              <label className="flex items-center gap-2 pb-2 text-sm font-medium">
                <input type="checkbox" checked={recurringEnabled} onChange={(event) => setRecurringEnabled(event.target.checked)} />
                Gerar mensalidade todo mês
              </label>
              <label className="w-40 space-y-1 text-sm font-medium">Dia do vencimento
                <Input type="number" min="1" max="31" value={recurringDay} onChange={(event) => setRecurringDay(event.target.value)} />
              </label>
              <p className="pb-2 text-sm text-muted-foreground">Valor mensal: {formatCurrency(selectedEstablishment.monthlyRevenue)}</p>
              <Button type="submit" disabled={loading || Boolean(loadError) || loadedEstablishmentId !== establishmentId}>Salvar dia fixo</Button>
            </form>
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h2 className="font-semibold">Gerar cobrança avulsa</h2>
              <p className="text-sm text-muted-foreground">Use para uma cobrança manual ou para lançar um boleto específico desta mensalidade.</p>
            </div>
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={addBill}>
              <label className="space-y-1 text-sm font-medium">Descrição<Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mensalidade Kito" required /></label>
              <label className="space-y-1 text-sm font-medium">Valor (R$)<Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
              <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
              <label className="space-y-1 text-sm font-medium">Código do boleto<Input value={boletoCode} onChange={(event) => setBoletoCode(event.target.value)} /></label>
              <label className="space-y-1 text-sm font-medium">Validade do boleto<Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
              <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" disabled={loading || Boolean(loadError) || loadedEstablishmentId !== establishmentId}><Plus className="mr-2 h-4 w-4" />Gerar cobrança</Button></div>
            </form>
          </Card>

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
                      <label className="space-y-1 text-sm font-medium">Valor<Input type="number" min="0.01" step="0.01" value={billDraft.amount} onChange={(event) => setBillDraft({ ...billDraft, amount: Number(event.target.value) })} /></label>
                      <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={billDraft.dueDate} onChange={(event) => setBillDraft({ ...billDraft, dueDate: event.target.value })} /></label>
                      <label className="space-y-1 text-sm font-medium">Código<Input value={billDraft.boletoCode} onChange={(event) => setBillDraft({ ...billDraft, boletoCode: event.target.value })} /></label>
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
                          <Badge variant={status === 'paid' ? 'secondary' : status === 'overdue' || status === 'expired' ? 'destructive' : 'outline'}>
                            {status === 'overdue' || status === 'expired' ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
                            {BILL_LABELS[status]}
                          </Badge>
                          {bill.recurringMonth && <Badge variant="outline">Mensalidade Kito</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">Vencimento: {new Date(`${bill.dueDate}T00:00:00`).toLocaleDateString('pt-BR')} · {formatCurrency(bill.amount)}</p>
                        {bill.boletoCode && <p className="break-all text-sm text-muted-foreground">Código: {bill.boletoCode}</p>}
                        {bill.validUntil && <p className="text-sm text-muted-foreground">Validade: {new Date(`${bill.validUntil}T00:00:00`).toLocaleDateString('pt-BR')}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => updateBill(bill.id, (entry) => ({ ...entry, paidAt: entry.paidAt ? undefined : new Date().toISOString() }))}><Check className="mr-1 h-4 w-4" />{bill.paidAt ? 'Reabrir' : 'Marcar paga'}</Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Editar ${bill.description}`} onClick={() => {
                          setEditingBillId(bill.id);
                          setBillDraft({ description: bill.description, amount: bill.amount, dueDate: bill.dueDate, boletoCode: bill.boletoCode, validUntil: bill.validUntil });
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
