import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '@/store';
import { useAuth, type AppUser } from '@/auth/AuthContext';
import { hasStorePermission } from '@/auth/permissions';
import { usePersistentState, syncPersistentState, PERSISTENT_STATE_ERROR_EVENT } from '@/hooks/usePersistentState';
import { commitEmployeeRecords, type AtomicRecordOperation } from '@/lib/atomicEmployeeRecords';
import { supabase } from '@/lib/supabase';
import { calculateEmployeeMonthlySettlement, calculateEmployeeSettlement, employeeSalesFromCashRegister, type EmployeeMonthlySettlement, type EmployeeProfile, type EmployeeRecords, type EmployeeRosterEntry } from '@/lib/employeeSettlement';
import { EMPTY_STORE_FINANCES, type StoreFinances } from '@/lib/storeFinances';
import { writeLocalProfessionalProjection } from '@/lib/localEmployeeIntegration';
import type { CashRegisterData, InventoryMovement, MenuItem, Product } from '@/types';
import { formatCurrency, menuItems as initialMenuItems, products as initialProducts } from '@/mockData';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const EMPTY_EMPLOYEES: EmployeeRecords = { employees: [], consumptions: [], settlements: [] };
const EMPTY_REGISTER: CashRegisterData = { activeSessionId: null, sessions: [], sales: [], movements: [] };
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validPercent(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export function EmployeesModule() {
  const { selectedEstablishment } = useApp();
  const { user, listStoreUsers } = useAuth();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const canUseStock = Boolean(selectedEstablishment?.modules.estoque && hasStorePermission(user, establishmentId, 'estoque'));
  const canUseMenu = Boolean(selectedEstablishment?.modules.cardapio && hasStorePermission(user, establishmentId, 'cardapio'));
  const canManageUsers = hasStorePermission(user, establishmentId, 'manage-users');
  const atomicRemote = Boolean(supabase && user && !user.isDemo);
  const [finances, setFinances, financesLoaded, financesSnapshot] = usePersistentState<StoreFinances>(`store-finances:${establishmentId}`, EMPTY_STORE_FINANCES, { readOnly: atomicRemote });
  const [roster, setRoster, rosterLoaded, rosterSnapshot] = usePersistentState<EmployeeRosterEntry[]>(`employee-roster:${establishmentId}`, [], { readOnly: atomicRemote });
  const [register, , registerLoaded, registerSnapshot] = usePersistentState<CashRegisterData>(`cash-register:${establishmentId}`, EMPTY_REGISTER, { readOnly: true });
  const [products, setProducts, productsLoaded, productsSnapshot] = usePersistentState<Product[]>(`inventory:${establishmentId}`, selectedEstablishment?.slug === 'mercadinho-central' ? initialProducts : [], { readOnly: atomicRemote || !canUseStock });
  const [movements, setMovements, movementsLoaded, movementsSnapshot] = usePersistentState<InventoryMovement[]>(`inventory-movements:${establishmentId}`, [], { readOnly: atomicRemote || !canUseStock });
  const [menuItems, , menuLoaded] = usePersistentState<MenuItem[]>(`menu-items:${establishmentId}`, selectedEstablishment?.slug === 'burger-house' ? initialMenuItems : [], { readOnly: true });
  const [users, setUsers] = useState<AppUser[]>([]);
  const [storageError, setStorageError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [salary, setSalary] = useState(0);
  const [commission, setCommission] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [active, setActive] = useState(true);
  const [source, setSource] = useState<'manual' | 'inventory' | 'menu'>('manual');
  const [itemId, setItemId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [quantity, setQuantity] = useState('1');
  const [consumptionDate, setConsumptionDate] = useState(() => localDate(new Date()));
  const [month, setMonth] = useState(() => localDate(new Date()).slice(0, 7));
  const [dueDate, setDueDate] = useState(() => localDate(new Date()));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const records = finances.employees ?? EMPTY_EMPLOYEES;
  const employee = records.employees.find((entry) => entry.id === selectedId);
  let preview: EmployeeMonthlySettlement | null = null;
  let previewError = '';
  if (employee && registerLoaded && financesLoaded) {
    try {
      preview = calculateEmployeeMonthlySettlement({
        employeeId: employee.id, month, salaryCents: employee.salaryCents,
        sales: employeeSalesFromCashRegister(register.sales, establishmentId),
        consumptions: records.consumptions,
        previousSettlements: records.settlements.filter((entry) => entry.employeeId === employee.id),
      });
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Não foi possível calcular o fechamento.';
    }
  }

  useEffect(() => {
    const keys = new Set([`store-finances:${establishmentId}`, `employee-roster:${establishmentId}`, `cash-register:${establishmentId}`]);
    if (canUseStock) { keys.add(`inventory:${establishmentId}`); keys.add(`inventory-movements:${establishmentId}`); }
    if (canUseMenu) keys.add(`menu-items:${establishmentId}`);
    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; message: string }>).detail;
      if (keys.has(detail.key)) {
        setStorageError(`Falha ao carregar ou salvar ${detail.key}: ${detail.message}`);
      }
    };
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, handleError);
    return () => {
      window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, handleError);
    };
  }, [establishmentId, canUseStock, canUseMenu]);

  useEffect(() => {
    if (!canManageUsers) return;
    let active = true;
    void listStoreUsers(establishmentId).then((result) => {
      if (active) setUsers(result);
    }).catch((error: unknown) => {
      if (active) toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os subusuários.');
    });
    return () => { active = false; };
  }, [canManageUsers, establishmentId, listStoreUsers]);

  const ready = financesLoaded && rosterLoaded && registerLoaded && !storageError && !saving;
  const commit = async (operations: AtomicRecordOperation[], applyLocal: () => void) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      if (atomicRemote) {
        await commitEmployeeRecords(establishmentId, operations);
        for (const operation of operations) {
          if (operation.write) syncPersistentState(operation.snapshot.key, operation.value);
        }
      } else {
        applyLocal();
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar os dados.';
      setStorageError(message);
      toast.error(message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveEmployee = async (event: FormEvent) => {
    event.preventDefault();
    const commissionValue = Number(commission);
    const discountValue = Number(discount);
    const salaryCents = Math.round(salary * 100);
    if (!ready) { toast.error('Aguarde os dados ou resolva o erro de armazenamento.'); return; }
    if (!name.trim() || !Number.isSafeInteger(salaryCents) || salaryCents < 0
      || !validPercent(commissionValue) || !validPercent(discountValue)) {
      toast.error('Informe nome, salário válido e percentuais de 0 a 100 com até duas casas decimais.'); return;
    }
    const existing = records.employees.find((entry) => entry.id === editingId);
    if (userId && userId !== existing?.userId && !users.some((entry) => entry.id === userId)) { toast.error('Subusuário indisponível.'); return; }
    if (userId && records.employees.some((entry) => entry.id !== editingId && entry.userId === userId)) {
      toast.error('Este subusuário já está vinculado a outro funcionário.'); return;
    }
    const saved: EmployeeProfile = {
      ...existing, id: existing?.id ?? crypto.randomUUID(), name: name.trim(), userId: userId || undefined,
      salaryCents, commissionPercent: commissionValue, consumptionDiscountPercent: discountValue,
      active,
    };
    const updatedEmployees = existing
      ? records.employees.map((entry) => entry.id === saved.id ? saved : entry)
      : [...records.employees, saved];
    const updatedFinances: StoreFinances = { ...finances, employees: { ...records, employees: updatedEmployees } };
    const updatedRoster = [...roster.filter((entry) => entry.id !== saved.id), {
      id: saved.id, name: saved.name, commissionPercent: saved.commissionPercent, active: saved.active,
    }];
    const savedSuccessfully = await commit([
      { snapshot: { ...financesSnapshot, value: finances }, value: updatedFinances, write: true },
      { snapshot: { ...rosterSnapshot, value: roster }, value: updatedRoster, write: true },
    ], () => {
      writeLocalProfessionalProjection(establishmentId, updatedEmployees);
      setFinances(updatedFinances); setRoster(updatedRoster);
    });
    if (!savedSuccessfully) return;
    setSelectedId(saved.id);
    setEditingId(''); setName(''); setUserId(''); setSalary(0); setCommission('0'); setDiscount('0'); setActive(true);
  };

  const startEditing = (entry: EmployeeProfile) => {
    setEditingId(entry.id); setName(entry.name); setUserId(entry.userId ?? '');
    setSalary(entry.salaryCents / 100); setCommission(String(entry.commissionPercent)); setDiscount(String(entry.consumptionDiscountPercent)); setActive(entry.active);
  };

  const addConsumption = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !employee || !employee.active) { toast.error('Selecione um funcionário ativo e aguarde os dados.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consumptionDate)) { toast.error('Informe a data do consumo.'); return; }
    if (records.settlements.some((entry) => entry.employeeId === employee.id && entry.month >= consumptionDate.slice(0, 7))) {
      toast.error('O mês deste consumo ou um mês posterior já foi fechado.'); return;
    }
    const count = Number(quantity);
    if (!Number.isFinite(count) || count <= 0) { toast.error('Informe uma quantidade maior que zero.'); return; }
    const product = source === 'inventory' ? products.find((entry) => entry.id === itemId) : undefined;
    const menuItem = source === 'menu' ? menuItems.find((entry) => entry.id === itemId) : undefined;
    if (source === 'inventory' && (!canUseStock || !productsLoaded || !movementsLoaded || !product || product.stock < count)) {
      toast.error('Produto indisponível ou estoque insuficiente.'); return;
    }
    if (source === 'menu' && (!canUseMenu || !menuLoaded || !menuItem)) { toast.error('Item do cardápio indisponível.'); return; }
    const label = source === 'manual' ? description.trim() : product?.name ?? menuItem?.name ?? '';
    const unitPrice = source === 'manual' ? amount : product?.price ?? menuItem?.price ?? 0;
    const amountCents = Math.round(unitPrice * count * 100);
    if (!label || !Number.isSafeInteger(amountCents) || amountCents <= 0) { toast.error('Informe descrição e valor válidos.'); return; }
    const updatedFinances: StoreFinances = { ...finances, employees: {
      ...records,
      consumptions: [...records.consumptions, {
        consumptionId: crypto.randomUUID(), employeeId: employee.id, month: consumptionDate.slice(0, 7),
        amountCents, discountPercent: employee.consumptionDiscountPercent,
        description: `${label} × ${count}`, createdAt: consumptionDate,
      }],
    } };
    const operations: AtomicRecordOperation[] = [
      { snapshot: { ...financesSnapshot, value: finances }, value: updatedFinances, write: true },
    ];
    let updatedProducts = products;
    let updatedMovements = movements;
    if (product) {
      updatedProducts = products.map((entry) => entry.id === product.id ? { ...entry, stock: entry.stock - count } : entry);
      updatedMovements = [...movements, {
        id: crypto.randomUUID(), productId: product.id, productName: product.name, type: 'adjustment',
        quantity: count, unit: product.unit, reason: `Consumo de funcionário: ${employee.name}`, createdAt: new Date().toISOString(),
      }];
      operations.push(
        { snapshot: { ...productsSnapshot, value: products }, value: updatedProducts, write: true },
        { snapshot: { ...movementsSnapshot, value: movements }, value: updatedMovements, write: true },
      );
    }
    const savedSuccessfully = await commit(operations, () => {
      setFinances(updatedFinances);
      if (product) { setProducts(updatedProducts); setMovements(updatedMovements); }
    });
    if (!savedSuccessfully) return;
    setDescription(''); setAmount(0); setQuantity('1'); setItemId('');
  };

  const closeMonth = async () => {
    if (savingRef.current) return;
    if (!ready || !employee || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { toast.error('Selecione funcionário e vencimento e aguarde os dados.'); return; }
    if (month >= localDate(new Date()).slice(0, 7)) { toast.error('Feche o mês somente após seu término.'); return; }
    if (!preview) { toast.error(previewError || 'Não foi possível calcular o fechamento.'); return; }
    if (!window.confirm(`Fechar ${month} para ${employee.name}, com ${formatCurrency(preview.payableCents / 100)} a pagar?`)) return;
    try {
      const settlement = calculateEmployeeMonthlySettlement({
        employeeId: employee.id, month, salaryCents: employee.salaryCents,
        sales: employeeSalesFromCashRegister(register.sales, establishmentId),
        consumptions: records.consumptions,
        previousSettlements: records.settlements.filter((entry) => entry.employeeId === employee.id),
      });
      const updatedFinances: StoreFinances = {
        ...finances,
        employees: { ...records, settlements: [...records.settlements, settlement] },
        bills: settlement.payableCents > 0 ? [...finances.bills, {
          id: crypto.randomUUID(), description: `Funcionário ${employee.name} · ${month}`, amount: settlement.payableCents / 100,
          dueDate, boletoCode: '', validUntil: '', source: 'employee-settlement',
        }] : finances.bills,
      };
      await commit([
        { snapshot: { ...financesSnapshot, value: finances }, value: updatedFinances, write: true },
        { snapshot: { ...registerSnapshot, value: register }, write: false },
      ], () => setFinances(updatedFinances));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível fechar o mês.');
    }
  };

  const cancelConsumption = async (consumptionId: string) => {
    const consumption = records.consumptions.find((entry) => entry.consumptionId === consumptionId);
    if (!ready || !consumption || consumption.cancelled) return;
    if (records.settlements.some((entry) => entry.employeeId === consumption.employeeId && entry.month >= consumption.month)) {
      toast.error('O mês deste consumo ou um mês posterior já foi fechado.'); return;
    }
    if (!window.confirm('Cancelar consumo? Se houve baixa de estoque, ajuste o estoque manualmente.')) return;
    const updatedFinances: StoreFinances = { ...finances, employees: {
      ...records,
      consumptions: records.consumptions.map((entry) => entry.consumptionId === consumptionId ? { ...entry, cancelled: true } : entry),
    } };
    await commit([{ snapshot: { ...financesSnapshot, value: finances }, value: updatedFinances, write: true }], () => setFinances(updatedFinances));
  };

  if (!selectedEstablishment) return null;
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-semibold">Funcionários</h2><p className="text-sm text-muted-foreground">Cadastros, consumos, comissões e fechamentos desta loja.</p></div>
      {!atomicRemote && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Modo demonstração: dados locais não possuem controle transacional entre dispositivos.</p>}
      {storageError && <p role="alert" className="text-sm text-destructive">{storageError} Recarregue a página antes de tentar novamente.</p>}
      <Tabs defaultValue="employees">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="employees">Funcionários</TabsTrigger><TabsTrigger value="consumption">Consumos</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger><TabsTrigger value="settlement">Fechamento</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="space-y-4">
          <Card className="p-4"><form onSubmit={saveEmployee} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Nome<Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label className="space-y-1 text-sm">Subusuário opcional<select className={selectClass} value={userId} disabled={!canManageUsers} onChange={(event) => setUserId(event.target.value)}><option value="">Sem vínculo</option>{userId && !users.some((entry) => entry.id === userId) && <option value={userId}>Vínculo existente</option>}{users.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName} · @{entry.username}</option>)}</select></label>
            <label className="space-y-1 text-sm">Salário mensal<CurrencyInput value={salary} onValueChange={(value) => setSalary(value ?? 0)} /></label>
            <label className="space-y-1 text-sm">Comissão (%)<Input type="number" min="0" max="100" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} required /></label>
            <label className="space-y-1 text-sm">Desconto no consumo (%)<Input type="number" min="0" max="100" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} required /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Ativo para vendas e agendamentos</label>
            <div className="flex items-end gap-2"><Button disabled={!ready} type="submit">{editingId ? 'Salvar funcionário' : 'Cadastrar funcionário'}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(''); setName(''); setUserId(''); setSalary(0); setCommission('0'); setDiscount('0'); setActive(true); }}>Cancelar</Button>}</div>
          </form></Card>
          <Card className="divide-y p-4">{records.employees.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-2"><span>{entry.name} · {entry.commissionPercent}% comissão · {entry.consumptionDiscountPercent}% desconto{!entry.active && ' · Inativo'}</span><Button type="button" size="sm" variant="outline" onClick={() => startEditing(entry)}>Editar</Button></div>)}{!records.employees.length && <p className="text-sm text-muted-foreground">Nenhum funcionário cadastrado.</p>}</Card>
        </TabsContent>
        <TabsContent value="consumption" className="space-y-4">
          <Card className="p-4"><form onSubmit={addConsumption} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Funcionário<select className={selectClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required><option value="">Selecione</option>{records.employees.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            <label className="space-y-1 text-sm">Origem<select className={selectClass} value={source} onChange={(event) => { setSource(event.target.value as typeof source); setItemId(''); }}><option value="manual">Manual</option>{canUseStock && <option value="inventory">Estoque</option>}{canUseMenu && <option value="menu">Cardápio</option>}</select></label>
            {source === 'manual' ? <><label className="space-y-1 text-sm">Descrição<Input value={description} onChange={(event) => setDescription(event.target.value)} required /></label><label className="space-y-1 text-sm">Valor unitário<CurrencyInput value={amount} onValueChange={(value) => setAmount(value ?? 0)} /></label></> : <label className="space-y-1 text-sm">Item<select className={selectClass} value={itemId} onChange={(event) => setItemId(event.target.value)} required><option value="">Selecione</option>{(source === 'inventory' ? products : menuItems).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {formatCurrency(entry.price)}</option>)}</select></label>}
            <label className="space-y-1 text-sm">Quantidade<Input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
            <label className="space-y-1 text-sm">Data<Input type="date" value={consumptionDate} onChange={(event) => setConsumptionDate(event.target.value)} required /></label>
            {source === 'menu' && <p className="text-xs text-muted-foreground">Itens do cardápio não baixam estoque automaticamente.</p>}
            <Button type="submit" disabled={!ready}>Lançar consumo</Button>
          </form></Card>
          <Card className="divide-y p-4">{records.consumptions.filter((entry) => !selectedId || entry.employeeId === selectedId).map((entry) => {
            const net = calculateEmployeeSettlement({ salaryCents: 0, sales: [], consumptions: [entry], cancelledCommissions: [], carriedDebtCents: 0 }).consumptionCents;
            return <div key={entry.consumptionId} className="flex items-center justify-between gap-3 py-2 text-sm"><div><p>{entry.description} · {entry.createdAt} · {records.employees.find((item) => item.id === entry.employeeId)?.name} {entry.cancelled && '· Cancelado'}</p><p className="text-muted-foreground">{formatCurrency(entry.amountCents / 100)} · desconto {entry.discountPercent}% · líquido {formatCurrency(net / 100)}</p></div>{!entry.cancelled && <Button type="button" size="sm" variant="outline" disabled={!ready} onClick={() => cancelConsumption(entry.consumptionId)}>Cancelar</Button>}</div>;
          })}{!records.consumptions.length && <p className="text-sm text-muted-foreground">Nenhum consumo lançado.</p>}</Card>
        </TabsContent>
        <TabsContent value="commissions" className="space-y-4">
          <Card className="p-4"><p className="text-sm text-muted-foreground">Selecione o funcionário responsável ao registrar a venda no caixa ou finalizar o pagamento do delivery. A comissão usa o percentual registrado no momento da venda.</p>
            <div className="mt-3 divide-y">{register.sales.filter((sale) => sale.employeeId).map((sale) => <div key={sale.id} className="py-2 text-sm">{records.employees.find((entry) => entry.id === sale.employeeId)?.name ?? 'Funcionário'} · {new Date(sale.createdAt).toLocaleDateString('pt-BR')} · {formatCurrency(sale.total)} · {sale.employeeCommissionPercent}% {sale.status === 'cancelled' && '· Cancelada'}</div>)}</div>
          </Card>
        </TabsContent>
        <TabsContent value="settlement" className="space-y-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Funcionário<select className={selectClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione</option>{records.employees.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            <label className="space-y-1 text-sm">Mês<Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
            <label className="space-y-1 text-sm">Vencimento da conta<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <div className="flex items-end"><Button type="button" disabled={!ready || !preview} onClick={closeMonth}>{saving ? 'Salvando...' : 'Fechar mês e gerar conta'}</Button></div>
            {previewError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{previewError}</p>}
            {preview && <p className="text-sm sm:col-span-2">Salário {formatCurrency(preview.salaryCents / 100)} + comissões {formatCurrency(preview.commissionCents / 100)} − estornos {formatCurrency(preview.cancelledCommissionCents / 100)} − consumos {formatCurrency(preview.consumptionCents / 100)} − saldo anterior {formatCurrency(preview.carriedDebtCents / 100)} = <strong>{formatCurrency(preview.payableCents / 100)} a pagar</strong>. Saldo seguinte: {formatCurrency(preview.nextCarriedDebtCents / 100)}.</p>}
            <p className="text-xs text-muted-foreground sm:col-span-2">Feche somente após o término do mês. O fechamento soma salário e comissões, desconta consumos e transfere eventual saldo negativo ao mês seguinte. A conta gerada fica pendente em Finanças.</p>
          </Card>
          <Card className="divide-y p-4">{records.settlements.filter((entry) => !selectedId || entry.employeeId === selectedId).map((entry) => <div key={`${entry.employeeId}:${entry.month}`} className="py-3 text-sm"><p className="font-semibold">{records.employees.find((item) => item.id === entry.employeeId)?.name} · {entry.month}</p><p>Salário {formatCurrency(entry.salaryCents / 100)} · Comissões {formatCurrency(entry.commissionCents / 100)} · Estornos {formatCurrency(entry.cancelledCommissionCents / 100)} · Consumos {formatCurrency(entry.consumptionCents / 100)}</p><p>A pagar {formatCurrency(entry.payableCents / 100)} · Saldo para o próximo mês {formatCurrency(entry.nextCarriedDebtCents / 100)}</p></div>)}</Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
