import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Bell, Check, Pencil, Plus, Trash2, WalletCards } from 'lucide-react';
import { useApp } from '@/store';
import { formatCurrency } from '@/mockData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ensureCurrentRecurringBill, EMPTY_STORE_FINANCES, getBillAlert, type FinanceBill } from '@/lib/storeFinances';
import { toast } from 'sonner';

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [finances, setFinances] = usePersistentState(`store-finances:${establishmentId}`, EMPTY_STORE_FINANCES);
  const [recurringEnabled, setRecurringEnabled] = useState(finances.recurring.enabled);
  const [recurringDay, setRecurringDay] = useState(String(finances.recurring.dueDay));
  const [recurringAmount, setRecurringAmount] = useState(String(finances.recurring.amount || ''));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => localDateKey(new Date()));
  const [boletoCode, setBoletoCode] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<Pick<FinanceBill, 'description' | 'amount' | 'dueDate' | 'boletoCode' | 'validUntil'> | null>(null);

  useEffect(() => {
    setRecurringEnabled(finances.recurring.enabled);
    setRecurringDay(String(finances.recurring.dueDay));
    setRecurringAmount(String(finances.recurring.amount || ''));
  }, [finances.recurring]);

  useEffect(() => {
    setFinances((current) => ensureCurrentRecurringBill(current, new Date(), createId));
  }, [finances.recurring, finances.bills, setFinances]);

  const today = new Date();
  const sortedBills = [...finances.bills].sort((first, second) => first.dueDate.localeCompare(second.dueDate));
  const unpaidAlerts = sortedBills.filter((bill) => ['overdue', 'due-soon', 'expired'].includes(getBillAlert(bill, today)));
  const unpaidTotal = finances.bills
    .filter((bill) => !bill.paidAt)
    .reduce((sum, bill) => sum + bill.amount, 0);

  const saveRecurring = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const day = Number(recurringDay);
    const recurringValue = Number(recurringAmount);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      toast.error('Informe um dia de vencimento entre 1 e 31.');
      return;
    }
    if (!Number.isFinite(recurringValue) || recurringValue < 0 || (recurringEnabled && recurringValue === 0)) {
      toast.error('Informe um valor mensal válido; a mensalidade fixa precisa ser maior que zero.');
      return;
    }
    setFinances((current) => ({
      ...current,
      recurring: { enabled: recurringEnabled, dueDay: day, amount: Math.round(recurringValue * 100) / 100 },
    }));
  };

  const addBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0 || !dueDate) {
      toast.error('Informe a descrição, um valor maior que zero e o vencimento.');
      return;
    }
    setFinances((current) => ({
      ...current,
      bills: [...current.bills, {
        id: createId(),
        description: description.trim(),
        amount: Math.round(value * 100) / 100,
        dueDate,
        boletoCode: boletoCode.trim(),
        validUntil,
      }],
    }));
    setDescription('');
    setAmount('');
    setDueDate(localDateKey(new Date()));
    setBoletoCode('');
    setValidUntil('');
  };

  const beginEdit = (bill: FinanceBill) => {
    setEditingBillId(bill.id);
    setBillDraft({
      description: bill.description,
      amount: bill.amount,
      dueDate: bill.dueDate,
      boletoCode: bill.boletoCode,
      validUntil: bill.validUntil,
    });
  };

  const saveBill = () => {
    if (!editingBillId || !billDraft) return;
    const value = Number(billDraft.amount);
    if (!billDraft.description.trim() || !Number.isFinite(value) || value <= 0 || !billDraft.dueDate) {
      toast.error('Informe a descrição, um valor maior que zero e o vencimento.');
      return;
    }
    setFinances((current) => ({
      ...current,
      bills: current.bills.map((bill) => bill.id === editingBillId
        ? { ...bill, ...billDraft, description: billDraft.description.trim(), amount: Math.round(value * 100) / 100, boletoCode: billDraft.boletoCode.trim() }
        : bill),
    }));
    setEditingBillId(null);
    setBillDraft(null);
  };

  const togglePaid = (billId: string) => {
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
        <p className="text-muted-foreground">Acompanhe mensalidades e boletos da loja.</p>
      </div>

      {unpaidAlerts.length > 0 && (
        <Card role="status" className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <Bell className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{unpaidAlerts.length} boleto(s) precisam de atenção</p>
            <p className="text-sm">{unpaidAlerts.filter((bill) => getBillAlert(bill, today) === 'overdue').length} vencido(s) · {unpaidAlerts.filter((bill) => getBillAlert(bill, today) === 'due-soon').length} vencem nos próximos 7 dias · {unpaidAlerts.filter((bill) => getBillAlert(bill, today) === 'expired').length} expirado(s).</p>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Total de boletos em aberto para seu controle</p>
        <p className="mt-1 text-2xl font-bold">{formatCurrency(unpaidTotal)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Este controle é privado da loja e não altera as cobranças da mensalidade Kito, gerenciadas pelo Super Admin.</p>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Lançamentos recorrentes para controle próprio</h2>
          <p className="text-sm text-muted-foreground">Gere automaticamente um lançamento mensal de uma conta da loja. Isso não configura nem altera a mensalidade do Kito.</p>
        </div>
        <form className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end" onSubmit={saveRecurring}>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" checked={recurringEnabled} onChange={(event) => setRecurringEnabled(event.target.checked)} />
            Repetir lançamento todo mês
          </label>
          <label className="space-y-1 text-sm font-medium">Dia do vencimento
            <Input type="number" min="1" max="31" value={recurringDay} onChange={(event) => setRecurringDay(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm font-medium">Valor mensal
            <Input type="number" min="0" step="0.01" value={recurringAmount} onChange={(event) => setRecurringAmount(event.target.value)} placeholder="0,00" />
          </label>
          <Button type="submit">Salvar recorrência</Button>
        </form>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Adicionar boleto ou cobrança avulsa</h2>
          <p className="text-sm text-muted-foreground">Registre boletos e contas da própria loja. Eles são separados das cobranças da mensalidade Kito, que só o Super Admin pode gerenciar.</p>
        </div>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={addBill}>
          <label className="space-y-1 text-sm font-medium">Descrição<Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Internet" required /></label>
          <label className="space-y-1 text-sm font-medium">Valor (R$)<Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
          <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
          <label className="space-y-1 text-sm font-medium">Código do boleto<Input value={boletoCode} onChange={(event) => setBoletoCode(event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Validade do boleto<Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit"><Plus className="mr-2 h-4 w-4" />Adicionar cobrança</Button></div>
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
                  <label className="space-y-1 text-sm font-medium">Descrição<Input value={billDraft.description} onChange={(event) => setBillDraft({ ...billDraft, description: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Valor (R$)<Input type="number" min="0.01" step="0.01" value={billDraft.amount} onChange={(event) => setBillDraft({ ...billDraft, amount: Number(event.target.value) })} /></label>
                  <label className="space-y-1 text-sm font-medium">Vencimento<Input type="date" value={billDraft.dueDate} onChange={(event) => setBillDraft({ ...billDraft, dueDate: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Código do boleto<Input value={billDraft.boletoCode} onChange={(event) => setBillDraft({ ...billDraft, boletoCode: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Validade<Input type="date" value={billDraft.validUntil} onChange={(event) => setBillDraft({ ...billDraft, validUntil: event.target.value })} /></label>
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
                      {bill.recurringMonth && <Badge variant="outline">Mensal</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Vencimento: {new Date(`${bill.dueDate}T00:00:00`).toLocaleDateString('pt-BR')} · Valor: {formatCurrency(bill.amount)}</p>
                    {bill.boletoCode && <p className="break-all text-sm text-muted-foreground">Código: {bill.boletoCode}</p>}
                    {bill.validUntil && <p className="text-sm text-muted-foreground">Validade: {new Date(`${bill.validUntil}T00:00:00`).toLocaleDateString('pt-BR')}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => togglePaid(bill.id)}>
                      <Check className="mr-1 h-4 w-4" />{bill.paidAt ? 'Reabrir' : 'Marcar pago'}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Editar ${bill.description}`} onClick={() => beginEdit(bill)}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${bill.description}`} onClick={() => {
                      if (window.confirm(`Excluir a cobrança "${bill.description}"?`)) {
                        setFinances((current) => ({ ...current, bills: current.bills.filter((entry) => entry.id !== bill.id) }));
                      }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
