import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PaymentMethod, PaymentSplit } from '@/types';
import { formatCurrency } from '@/mockData';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { EmployeeRosterEntry } from '@/lib/employeeSettlement';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'credito', label: 'Cartão de crédito' },
  { value: 'debito', label: 'Cartão de débito' },
  { value: 'outro', label: 'Outro' },
];

type PaymentDialogProps = {
  open: boolean;
  total: number;
  defaultMethod: PaymentMethod;
  defaultSplits?: PaymentSplit[];
  mode?: 'receive' | 'select';
  onOpenChange: (open: boolean) => void;
  onConfirm: (splits: PaymentSplit[], change: number) => void | boolean | Promise<void | boolean>;
  employeeSelection?: {
    employees: EmployeeRosterEntry[];
    selectedId: string;
    onChange: (id: string) => void;
  };
};

function toCents(value: number) {
  return Math.round(value * 100);
}

export function PaymentDialog({
  open, total, defaultMethod, defaultSplits, mode = 'receive', onOpenChange, onConfirm, employeeSelection,
}: PaymentDialogProps) {
  const initialSplits = useMemo(
    () => defaultSplits?.length ? defaultSplits.map((split) => ({ ...split })) : [{ method: defaultMethod, amount: total }],
    [defaultMethod, defaultSplits, total],
  );
  const [splits, setSplits] = useState<PaymentSplit[]>(initialSplits);
  const [cashReceived, setCashReceived] = useState(total);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const totalCents = toCents(total);
  const allocatedCents = useMemo(() => splits.reduce((sum, split) => sum + toCents(split.amount), 0), [splits]);
  const cashAmount = splits.find((split) => split.method === 'dinheiro')?.amount ?? 0;
  const remaining = (totalCents - allocatedCents) / 100;
  const change = cashAmount > 0 ? Math.max(0, Math.round((cashReceived - cashAmount) * 100) / 100) : 0;
  const cashTenderShort = cashReceived < cashAmount;
  const exactTotal = allocatedCents === totalCents;
  const hasInvalidSplit = splits.some((split) => !Number.isFinite(split.amount) || split.amount < 0);

  useEffect(() => {
    if (open) {
      setSplits(initialSplits);
      setCashReceived(initialSplits.find((split) => split.method === 'dinheiro')?.amount ?? 0);
    }
  }, [open, initialSplits]);

  const updateSplit = (index: number, update: Partial<PaymentSplit>) => {
    setSplits((current) => {
      const next = current.map((split, position) => position === index ? { ...split, ...update } : split);
      if (current[index].method === 'dinheiro' || update.method === 'dinheiro') {
        setCashReceived(next.find((split) => split.method === 'dinheiro')?.amount ?? 0);
      }
      return next;
    });
  };

  const removeSplit = (index: number) => {
    setSplits((current) => {
      const next = current.filter((_, position) => position !== index);
      setCashReceived(next.find((split) => split.method === 'dinheiro')?.amount ?? 0);
      return next;
    });
  };

  const addSplit = () => {
    const availableMethod = METHODS.find((method) => !splits.some((split) => split.method === method.value));
    if (!availableMethod) return;
    setSplits((current) => [...current, { method: availableMethod.value, amount: 0 }]);
  };

  const confirm = async () => {
    if (savingRef.current) return;
    if (hasInvalidSplit || splits.some((split) => split.amount <= 0)) {
      toast.error('Informe um valor maior que zero para cada forma de pagamento');
      return;
    }
    if (!exactTotal) {
      toast.error(`A divisão deve totalizar ${formatCurrency(total)}`);
      return;
    }
    if (cashTenderShort) {
      toast.error('O valor recebido em dinheiro não pode ser menor que a parte em dinheiro');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await onConfirm(splits, change);
      if (result !== false) onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar o pagamento.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!savingRef.current) onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'receive' ? 'Receber pagamento' : 'Informar pagamento'}</DialogTitle>
          <DialogDescription>
            {mode === 'receive'
              ? 'Divida o valor entre uma ou mais formas de pagamento.'
              : 'Informe como o cliente pretende dividir o pagamento.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {employeeSelection && (
            <label className="block space-y-1 text-sm font-medium">Funcionário responsável
              <select value={employeeSelection.selectedId} onChange={(event) => employeeSelection.onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal">
                <option value="">Sem funcionário</option>
                {employeeSelection.employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </label>
          )}
          <div className="rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">Valor total</p>
            <p className="text-3xl font-bold">{formatCurrency(total)}</p>
          </div>
          <div className="space-y-3">
            {splits.map((split, index) => (
              <div key={split.method} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="space-y-1 text-sm font-medium">
                  Forma de pagamento
                  <select
                    value={split.method}
                    onChange={(event) => updateSplit(index, { method: event.target.value as PaymentMethod })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                  >
                    {METHODS.map((method) => (
                      <option key={method.value} value={method.value} disabled={splits.some((entry, position) => position !== index && entry.method === method.value)}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Valor
                  <CurrencyInput value={split.amount} onValueChange={(amount) => updateSplit(index, { amount: amount ?? 0 })} />
                </label>
                {splits.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover forma de pagamento" onClick={() => removeSplit(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {splits.length < METHODS.length && (
              <Button type="button" variant="outline" size="sm" onClick={addSplit}>
                <Plus className="mr-2 h-4 w-4" />Adicionar forma de pagamento
              </Button>
            )}
          </div>
          <div className={`flex justify-between rounded-md p-3 text-sm ${exactTotal ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
            <span>{exactTotal ? 'Total dividido' : remaining > 0 ? 'Falta receber' : 'Valor excedente'}</span>
            <span className="font-semibold">{formatCurrency(Math.abs(remaining))}</span>
          </div>
          {mode === 'receive' && cashAmount > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm font-medium">
                Dinheiro recebido
                <CurrencyInput value={cashReceived} onValueChange={(amount) => setCashReceived(amount ?? 0)} />
              </label>
              <div className="space-y-1 text-sm font-medium">
                Troco
                <div className="flex h-10 items-center rounded-md border bg-muted px-3">{formatCurrency(change)}</div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={saving || !exactTotal || hasInvalidSplit || (mode === 'receive' && cashTenderShort) || splits.some((split) => split.amount <= 0)}>
            {saving ? 'Salvando...' : mode === 'receive' ? 'Confirmar pagamento' : 'Continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
