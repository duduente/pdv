import { CalendarClock, ClipboardList, Package, Receipt, WalletCards } from 'lucide-react';
import { useApp } from '@/store';
import { useAuth } from '@/auth/AuthContext';
import { hasStorePermission } from '@/auth/permissions';
import { usePersistentState } from '@/hooks/usePersistentState';
import { appointments as initialAppointments, products as initialProducts, formatCurrency } from '@/mockData';
import { EMPTY_STORE_FINANCES, type StoreFinances } from '@/lib/storeFinances';
import { ensureNextAdminMonthlyBill, loadAdminBilling } from '@/lib/adminBilling';
import { getPeriodRange } from '@/lib/criticalFlows';
import type { Appointment, CashRegisterData, Command, MenuOrder, Product } from '@/types';
import { Card } from '@/components/ui/card';

const EMPTY_REGISTER: CashRegisterData = { activeSessionId: null, sessions: [], sales: [], movements: [] };

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function withinPeriod(value: string, period: 'day' | 'week' | 'month') {
  const { start, end } = getPeriodRange(period, todayKey());
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date >= start && date < end;
}

function SummaryCard({ icon: Icon, title, children }: { icon: typeof CalendarClock; title: string; children: ReactNode }) {
  return <Card className="space-y-3 p-5"><h2 className="flex items-center gap-2 font-semibold"><Icon className="h-5 w-5 text-primary" />{title}</h2><div className="space-y-1 text-sm">{children}</div></Card>;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}

function AppointmentSummary() {
  const { selectedEstablishment: est } = useApp();
  const [appointments, , loaded] = usePersistentState<Appointment[]>(`appointments:${est?.id}`, est?.slug === 'barbearia-estilo' ? initialAppointments : [], { readOnly: true });
  const active = appointments.filter((appointment) => appointment.status !== 'cancelled');
  return <SummaryCard icon={CalendarClock} title="Agendamentos">
    {(['day', 'week', 'month'] as const).map((period, i) => <Row key={period} label={['Hoje', 'Esta semana', 'Este mês'][i]} value={loaded ? active.filter((entry) => withinPeriod(entry.date, period)).length : 'Carregando…'} />)}
    <Row label="A realizar hoje" value={loaded ? active.filter((entry) => entry.date === todayKey() && entry.status !== 'completed').length : 'Carregando…'} />
  </SummaryCard>;
}

function OrdersSummary() {
  const { selectedEstablishment: est } = useApp();
  const [orders, , loaded] = usePersistentState<MenuOrder[]>(`menu-orders:${est?.id}`, [], { readOnly: true });
  const valid = orders.filter((order) => !order.cancelledAt && order.deliveryStatus !== 'cancelled');
  return <SummaryCard icon={Receipt} title="Pedidos">
    {(['day', 'week', 'month'] as const).map((period, i) => <Row key={period} label={['Hoje', 'Esta semana', 'Este mês'][i]} value={loaded ? valid.filter((entry) => withinPeriod(entry.createdAt, period)).length : 'Carregando…'} />)}
    <Row label="Aguardando pagamento" value={loaded ? valid.filter((entry) => entry.status === 'pending').length : 'Carregando…'} />
    <Row label="Em produção ou entrega" value={loaded ? valid.filter((entry) => entry.deliveryStatus === 'production' || entry.deliveryStatus === 'dispatched').length : 'Carregando…'} />
  </SummaryCard>;
}

function FinanceSummary() {
  const { selectedEstablishment: est } = useApp();
  const [finances, , loaded] = usePersistentState(`store-finances:${est?.id}`, EMPTY_STORE_FINANCES, { readOnly: true });
  const unpaid = finances.bills.filter((bill) => !bill.paidAt);
  return <SummaryCard icon={WalletCards} title="Contas da loja">
    <Row label="Em aberto" value={loaded ? unpaid.length : 'Carregando…'} />
    <Row label="Vencidas" value={loaded ? unpaid.filter((bill) => bill.dueDate && bill.dueDate < todayKey()).length : 'Carregando…'} />
    {(['day', 'week', 'month'] as const).map((period, i) => <Row key={period} label={['Vencem hoje', 'Vencem esta semana', 'Vencem este mês'][i]} value={loaded ? unpaid.filter((bill) => withinPeriod(bill.dueDate, period)).length : 'Carregando…'} />)}
  </SummaryCard>;
}

function KitoSummary() {
  const { selectedEstablishment: est } = useApp();
  const { user } = useAuth();
  const establishmentId = est?.id;
  const [billing, setBilling] = useState<StoreFinances | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!establishmentId) return;
    let active = true;
    let requestId = 0;
    const refresh = async () => {
      const current = ++requestId;
      try {
        const result = await loadAdminBilling(establishmentId, Boolean(user?.isDemo));
        if (!active || current !== requestId) return;
        const latest = result.bills.filter((bill) => bill.recurringMonth)
          .sort((a, b) => (b.recurringMonth ?? '').localeCompare(a.recurringMonth ?? ''))[0];
        setBilling(latest?.paidAt ? ensureNextAdminMonthlyBill(result, latest, () => `preview-next-${latest.recurringMonth}`) : result);
        setError('');
      } catch (reason) {
        if (active && current === requestId) setError(reason instanceof Error ? reason.message : 'Falha ao carregar cobranças.');
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [establishmentId, user?.isDemo]);
  const unpaid = billing?.bills.filter((bill) => !bill.paidAt) ?? [];
  return <SummaryCard icon={WalletCards} title="Cobranças Kito">
    {error ? <p role="alert" className="text-destructive">Não foi possível carregar: {error}</p> : <>
      <Row label="Em aberto" value={billing ? unpaid.length : 'Carregando…'} />
      <Row label="Vencidas" value={billing ? unpaid.filter((bill) => bill.dueDate && bill.dueDate < todayKey()).length : 'Carregando…'} />
      {(['day', 'week', 'month'] as const).map((period, i) => <Row key={period} label={['Vencem hoje', 'Vencem esta semana', 'Vencem este mês'][i]} value={billing ? unpaid.filter((bill) => withinPeriod(bill.dueDate, period)).length : 'Carregando…'} />)}
    </>}
  </SummaryCard>;
}

function SalesSummary() {
  const { selectedEstablishment: est } = useApp();
  const [register, , loaded] = usePersistentState<CashRegisterData>(`cash-register:${est?.id}`, EMPTY_REGISTER, { readOnly: true });
  const sales = register.sales.filter((sale) => sale.status !== 'cancelled');
  return <SummaryCard icon={Receipt} title="Vendas">
    {(['day', 'week', 'month'] as const).map((period, i) => <Row key={period} label={['Hoje', 'Esta semana', 'Este mês'][i]} value={loaded ? formatCurrency(sales.filter((sale) => withinPeriod(sale.createdAt, period)).reduce((sum, sale) => sum + sale.total, 0)) : 'Carregando…'} />)}
  </SummaryCard>;
}

function InventorySummary() {
  const { selectedEstablishment: est } = useApp();
  const [products, , loaded] = usePersistentState<Product[]>(`inventory:${est?.id}`, est?.slug === 'mercadinho-central' ? initialProducts : [], { readOnly: true });
  return <SummaryCard icon={Package} title="Estoque">
    <Row label="Produtos com estoque baixo" value={loaded ? products.filter((product) => product.stock <= (product.minimumStock ?? 24)).length : 'Carregando…'} />
    <Row label="Produtos sem estoque" value={loaded ? products.filter((product) => product.stock <= 0).length : 'Carregando…'} />
  </SummaryCard>;
}

function CommandsSummary() {
  const { selectedEstablishment: est } = useApp();
  const [commands, , loaded] = usePersistentState<Command[]>(`commands:${est?.id}`, [], { readOnly: true });
  return <SummaryCard icon={ClipboardList} title="Comandas"><Row label="Abertas" value={loaded ? commands.filter((command) => command.status === 'open').length : 'Carregando…'} /></SummaryCard>;
}

export function OperationalDashboard() {
  const { selectedEstablishment: est } = useApp();
  const { user } = useAuth();
  if (!est) return null;
  const has = (permission: Parameters<typeof hasStorePermission>[2]) => hasStorePermission(user, est.id, permission);
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {est.modules.pdv && has('pdv-reports') && <SalesSummary />}
    {est.modules.agendamento && has('agendamento') && <AppointmentSummary />}
    {((est.modules.cardapio && has('cardapio')) || (est.modules.delivery && has('delivery')) || (est.modules.pdv && has('pdv-sales'))) && <OrdersSummary />}
    {est.modules.finance && has('finance') && <><FinanceSummary /><KitoSummary /></>}
    {est.modules.estoque && has('estoque') && <InventorySummary />}
    {est.modules.comandas && has('comandas') && <CommandsSummary />}
  </div>;
}
import { useEffect, useState, type ReactNode } from 'react';
