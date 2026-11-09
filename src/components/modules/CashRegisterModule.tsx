import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Banknote, BarChart3, Calculator, ClipboardList,
  CreditCard, DollarSign, LockKeyhole, Plus, Receipt, Search,
  Smartphone, Trash2, TrendingUp, UnlockKeyhole, Wallet, Undo2,
} from 'lucide-react';
import { products as initialProducts, formatCurrency } from '@/mockData';
import { appointments as initialAppointments, menuItems as initialMenuItems, professionals as initialProfessionals, services as initialServices } from '@/mockData';
import { useApp } from '@/store';
import { useAuth } from '@/auth/AuthContext';
import { hasStorePermission } from '@/auth/permissions';
import { usePersistentState } from '@/hooks/usePersistentState';
import type {
  Appointment, CashMovement, CashRegisterData, CashSale, CashSession,
  MenuItem, MenuOrder, ModuleKey, PaymentMethod, PaymentSplit, Product, Professional, SaleItem, SaleOrigin, Service,
  Command,
} from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { PaymentDialog } from '@/components/modules/PaymentDialog';

type Period = 'day' | 'week' | 'month';

const EMPTY_REGISTER: CashRegisterData = { activeSessionId: null, sessions: [], sales: [], movements: [] };
const PERIOD_LABELS: Record<Period, string> = { day: 'Hoje', week: 'Esta semana', month: 'Este mês' };
const SOURCE_LABELS: Record<SaleOrigin, string> = {
  agendamento: 'Agendamento / serviço',
  cardapio: 'Cardápio / comanda',
  produto_estoque: 'Produto de estoque',
  avulso: 'Venda avulsa',
  comanda: 'Comanda',
  delivery: 'Delivery',
};
const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'pix', label: 'Pix', icon: Smartphone },
  { value: 'credito', label: 'Cartão de crédito', icon: CreditCard },
  { value: 'debito', label: 'Cartão de débito', icon: CreditCard },
  { value: 'outro', label: 'Outro', icon: Wallet },
];

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(value: number) {
  return formatCurrency(value);
}

function periodStart(period: Period) {
  const now = new Date();
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function isInPeriod(date: string, period: Period) {
  return new Date(date) >= periodStart(period);
}

function summarize(sales: CashSale[]) {
  const activeSales = sales.filter((sale) => sale.status !== 'cancelled');
  const activeTotal = activeSales.reduce((sum, sale) => sum + sale.total, 0);
  return {
    total: activeTotal,
    count: activeSales.length,
    average: activeSales.length ? activeTotal / activeSales.length : 0,
    byMethod: PAYMENT_METHODS.map((method) => ({
      ...method,
      total: activeSales.reduce((sum, sale) => sum + paymentAmount(sale, method.value), 0),
    })),
  };
}

function paymentAmount(sale: CashSale, method: PaymentMethod) {
  const splits = sale.paymentSplits;
  return splits?.length
    ? splits.filter((split) => split.method === method).reduce((sum, split) => sum + split.amount, 0)
    : sale.paymentMethod === method ? sale.total : 0;
}

function paymentLabel(sale: CashSale) {
  if (!sale.paymentSplits?.length) {
    return PAYMENT_METHODS.find((method) => method.value === sale.paymentMethod)?.label ?? 'Pagamento';
  }
  return sale.paymentSplits.map((split) => {
    const label = PAYMENT_METHODS.find((method) => method.value === split.method)?.label ?? split.method;
    return `${label}: ${money(split.amount)}`;
  }).join(' · ');
}

export function CashRegisterModule() {
  const { selectedEstablishment } = useApp();
  const { user } = useAuth();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const canViewSales = hasStorePermission(user, establishmentId, 'pdv-sales');
  const canViewMovements = hasStorePermission(user, establishmentId, 'pdv-movements');
  const canViewReports = hasStorePermission(user, establishmentId, 'pdv-reports');
  const canViewSessions = hasStorePermission(user, establishmentId, 'pdv-sessions');
  const [register, setRegister] = usePersistentState<CashRegisterData>(`cash-register:${establishmentId}`, EMPTY_REGISTER);
  const [products, setProducts] = usePersistentState<Product[]>(
    `inventory:${establishmentId}`,
    selectedEstablishment?.modules.estoque && selectedEstablishment.slug === 'mercadinho-central' ? initialProducts : [],
  );
  const [menuItems] = usePersistentState<MenuItem[]>(
    `menu-items:${establishmentId}`,
    selectedEstablishment?.modules.cardapio && selectedEstablishment.slug === 'burger-house' ? initialMenuItems : [],
  );
  const [orders, setOrders] = usePersistentState<MenuOrder[]>(`menu-orders:${establishmentId}`, []);
  const [commands, setCommands] = usePersistentState<Command[]>(`commands:${establishmentId}`, []);
  const [services] = usePersistentState<Service[]>(
    `services:${establishmentId}`,
    selectedEstablishment?.modules.agendamento && selectedEstablishment.slug === 'barbearia-estilo' ? initialServices : [],
  );
  const [professionals] = usePersistentState<Professional[]>(
    `professionals:${establishmentId}`,
    selectedEstablishment?.modules.agendamento && selectedEstablishment.slug === 'barbearia-estilo' ? initialProfessionals : [],
  );
  const [appointments, setAppointments] = usePersistentState<Appointment[]>(
    `appointments:${establishmentId}`,
    selectedEstablishment?.modules.agendamento && selectedEstablishment.slug === 'barbearia-estilo' ? initialAppointments : [],
  );
  const [tab, setTab] = useState(() => canViewReports ? 'reports'
    : canViewSales ? 'sales'
      : canViewMovements ? 'movements'
        : 'session');
  const activeSession = register.sessions.find((session) => session.id === register.activeSessionId) ?? null;

  const cancelSale = (sale: CashSale) => {
    if (sale.status === 'cancelled') return;
    if (!window.confirm(`Cancelar a venda de ${money(sale.total)}? O estoque/pedido/agendamento relacionado será estornado.`)) return;
    const cancelledAt = new Date().toISOString();
    setRegister((current) => {
      const sales = current.sales.map((item) => item.id === sale.id ? { ...item, status: 'cancelled' as const, cancelledAt } : item);
      return {
        ...current,
        sales,
        sessions: current.sessions.map((session) => {
          if (session.id !== sale.sessionId || !session.closedAt) return session;
          const expected = expectedCash(session, sales, current.movements);
          return { ...session, expectedCash: expected, difference: (session.countedCash ?? 0) - expected };
        }),
      };
    });

    if (sale.origin === 'produto_estoque') {
      setProducts((current) => current.map((product) => {
        const returned = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
        return returned ? { ...product, stock: product.stock + returned } : product;
      }));
    }
    const sourceIds = new Set(sale.items.map((item) => item.sourceRecordId).filter((id): id is string => Boolean(id)));
    if (sale.origin === 'cardapio' || sale.origin === 'delivery') {
      setOrders((current) => current.map((order) => sourceIds.has(order.id)
        ? sale.origin === 'delivery'
          ? { ...order, status: 'pending', deliveryStatus: 'dispatched', cashSaleId: undefined }
          : { ...order, status: 'pending' }
        : order));
    }
    if (sale.origin === 'agendamento') {
      setAppointments((current) => current.map((appointment) => sourceIds.has(appointment.id)
        ? { ...appointment, status: 'confirmed', paymentStatus: 'unpaid' }
        : appointment));
    }
    if (sale.commandId) {
      setCommands((current) => current.map((command) => command.id === sale.commandId ? { ...command, status: 'open' } : command));
    }
    toast.success('Venda cancelada e estornada');
  };

  const deleteSale = (sale: CashSale) => {
    const alreadyReversed = sale.status === 'cancelled';
    const warning = alreadyReversed
      ? `Excluir definitivamente o registro cancelado de ${money(sale.total)}?`
      : `Excluir definitivamente a venda de ${money(sale.total)}? Itens relacionados serão estornados.`;
    if (!window.confirm(`${warning} Esta ação não pode ser desfeita.`)) return;
    setRegister((current) => {
      const sales = current.sales.filter((item) => item.id !== sale.id);
      return {
        ...current,
        sales,
        sessions: current.sessions.map((session) => {
          if (session.id !== sale.sessionId || !session.closedAt) return session;
          const expected = expectedCash(session, sales, current.movements);
          return { ...session, expectedCash: expected, difference: (session.countedCash ?? 0) - expected };
        }),
      };
    });
    if (!alreadyReversed && sale.origin === 'produto_estoque') {
      setProducts((current) => current.map((product) => {
        const returned = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
        return returned ? { ...product, stock: product.stock + returned } : product;
      }));
    }
    const sourceIds = new Set(sale.items.map((item) => item.sourceRecordId).filter((id): id is string => Boolean(id)));
    if (!alreadyReversed && (sale.origin === 'cardapio' || sale.origin === 'delivery')) {
      setOrders((current) => current.map((order) => sourceIds.has(order.id)
        ? sale.origin === 'delivery'
          ? { ...order, status: 'pending', deliveryStatus: 'dispatched', cashSaleId: undefined }
          : { ...order, status: 'pending' }
        : order));
    }
    if (!alreadyReversed && sale.origin === 'agendamento') {
      setAppointments((current) => current.map((appointment) => sourceIds.has(appointment.id)
        ? { ...appointment, status: 'confirmed', paymentStatus: 'unpaid' }
        : appointment));
    }
    if (!alreadyReversed && sale.commandId) {
      setCommands((current) => current.map((command) => command.id === sale.commandId ? { ...command, status: 'open' } : command));
    }
    toast.success('Venda excluída e itens relacionados estornados');
  };

  if (!selectedEstablishment) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Calculator className="h-6 w-6 text-primary" />Frente de Caixa</h1>
          <p className="text-muted-foreground">{selectedEstablishment.name}</p>
        </div>
        <Badge variant="outline" className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-none ${activeSession ? 'border-emerald-200/60 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
          <span className={`h-2 w-2 rounded-full ${activeSession ? 'bg-emerald-300' : 'bg-muted-foreground'}`} />
          {activeSession ? 'Caixa aberto' : 'Caixa fechado'}
        </Badge>
      </div>
      <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Dados separados por estabelecimento e salvos neste navegador. Ainda não há sincronização com servidor ou outros dispositivos.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {canViewReports && <TabsTrigger value="dashboard">Dashboard</TabsTrigger>}
          {canViewSales && <TabsTrigger value="sales">Vendas</TabsTrigger>}
          {canViewMovements && <TabsTrigger value="movements">Movimentações e extratos</TabsTrigger>}
          {canViewReports && <TabsTrigger value="reports">Relatórios</TabsTrigger>}
          {canViewSessions && <TabsTrigger value="session">Abertura e fechamento</TabsTrigger>}
        </TabsList>
        {canViewReports && <TabsContent value="dashboard" className="mt-4"><DashboardTab sales={register.sales} movements={register.movements} /></TabsContent>}
        {canViewSales && <TabsContent value="sales" className="mt-4">
          <SalesTab
            establishmentId={establishmentId}
            modules={selectedEstablishment.modules}
            session={activeSession}
            products={products}
            setProducts={setProducts}
            menuItems={menuItems}
            orders={orders}
            setOrders={setOrders}
            commands={commands}
            setCommands={setCommands}
            services={services}
            professionals={professionals}
            appointments={appointments}
            setAppointments={setAppointments}
            register={register}
            setRegister={setRegister}
          />
        </TabsContent>}
        {canViewMovements && <TabsContent value="movements" className="mt-4">
          <MovementsTab establishmentId={establishmentId} session={activeSession} register={register} setRegister={setRegister} />
        </TabsContent>}
        {canViewReports && <TabsContent value="reports" className="mt-4"><ReportsTab sales={register.sales} movements={register.movements} canManageSales={canViewSales} onCancelSale={cancelSale} onDeleteSale={deleteSale} /></TabsContent>}
        {canViewSessions && <TabsContent value="session" className="mt-4">
          <CashSessionTab establishmentId={establishmentId} register={register} setRegister={setRegister} activeSession={activeSession} />
        </TabsContent>}
      </Tabs>
    </div>
  );
}

function PeriodSelector({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div className="inline-flex rounded-md border p-1" role="group" aria-label="Período">
      {(['day', 'week', 'month'] as const).map((period) => (
        <Button key={period} type="button" size="sm" variant={value === period ? 'default' : 'ghost'} onClick={() => onChange(period)}>
          {PERIOD_LABELS[period]}
        </Button>
      ))}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="truncate text-lg font-bold">{value}</p></div>
      </div>
    </Card>
  );
}

function PaymentBreakdown({ sales }: { sales: CashSale[] }) {
  const summary = summarize(sales);
  const max = Math.max(...summary.byMethod.map((method) => method.total), 0);
  return (
    <div className="space-y-3">
      {summary.byMethod.map((method) => {
        const Icon = method.icon;
        const width = max ? (method.total / max) * 100 : 0;
        return (
          <div key={method.value}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{method.label}</span>
              <span className="font-medium">{money(method.total)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function SourceBreakdown({ sales }: { sales: CashSale[] }) {
  const origins: SaleOrigin[] = ['agendamento', 'cardapio', 'delivery', 'produto_estoque', 'comanda', 'avulso'];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {origins.map((origin) => {
        const total = sales
          .filter((sale) => sale.status !== 'cancelled' && (sale.origin ?? 'produto_estoque') === origin)
          .reduce((sum, sale) => sum + sale.total, 0);
        return <Metric key={origin} icon={Receipt} label={SOURCE_LABELS[origin]} value={money(total)} />;
      })}
    </div>
  );
}

function DashboardTab({ sales, movements }: { sales: CashSale[]; movements: CashMovement[] }) {
  const [period, setPeriod] = useState<Period>('day');
  const selectedSales = sales.filter((sale) => sale.status !== 'cancelled' && isInPeriod(sale.createdAt, period));
  const selectedMovements = movements.filter((movement) => isInPeriod(movement.createdAt, period));
  const summary = summarize(selectedSales);
  const supplies = selectedMovements.filter((movement) => movement.type === 'supply').reduce((sum, movement) => sum + movement.amount, 0);
  const withdrawals = selectedMovements.filter((movement) => movement.type === 'withdrawal').reduce((sum, movement) => sum + movement.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Resumo do caixa</h2><p className="text-sm text-muted-foreground">Vendas do período selecionado</p></div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={DollarSign} label={`Vendas · ${PERIOD_LABELS[period]}`} value={money(summary.total)} />
        <Metric icon={Receipt} label="Vendas registradas" value={String(summary.count)} />
        <Metric icon={TrendingUp} label="Ticket médio" value={money(summary.average)} />
        <Metric icon={Wallet} label="Suprimentos · sangrias" value={`${money(supplies)} · ${money(withdrawals)}`} />
      </div>
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h3 className="font-semibold">Faturamento por forma de pagamento</h3></div><PaymentBreakdown sales={selectedSales} /></Card>
      <Card className="space-y-4 p-5"><h3 className="font-semibold">Faturamento por origem</h3><SourceBreakdown sales={selectedSales} /></Card>
      {!selectedSales.length && <p className="py-5 text-center text-sm text-muted-foreground">Ainda não há vendas neste período.</p>}
    </div>
  );
}

function SalesTab({
  establishmentId, modules, session, products, setProducts, menuItems, orders, setOrders, commands, setCommands, services, professionals, appointments, setAppointments, register, setRegister,
}: {
  establishmentId: string;
  modules: Record<ModuleKey, boolean>;
  session: CashSession | null;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  menuItems: MenuItem[];
  orders: MenuOrder[];
  setOrders: Dispatch<SetStateAction<MenuOrder[]>>;
  commands: Command[];
  setCommands: Dispatch<SetStateAction<Command[]>>;
  services: Service[];
  professionals: Professional[];
  appointments: Appointment[];
  setAppointments: Dispatch<SetStateAction<Appointment[]>>;
  register: CashRegisterData;
  setRegister: Dispatch<SetStateAction<CashRegisterData>>;
}) {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState<SaleOrigin>('avulso');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedCommandId, setSelectedCommandId] = useState('');
  const [includeServiceCharge, setIncludeServiceCharge] = useState(false);
  const origins: SaleOrigin[] = [
    ...(modules.agendamento ? ['agendamento' as const] : []),
    ...(modules.cardapio ? ['cardapio' as const] : []),
    ...(modules.estoque ? ['produto_estoque' as const] : []),
    ...(modules.comandas ? ['comanda' as const] : []),
    'avulso',
  ];
  const origin = origins.includes(selectedOrigin) ? selectedOrigin : origins[0];
  const soldAppointments = new Set(register.sales.flatMap((sale) => sale.items.map((item) => item.sourceRecordId).filter((id): id is string => Boolean(id))));
  const pendingOrders = orders.filter((order) => order.establishmentId === establishmentId && order.status === 'pending' && order.channel !== 'delivery' && !order.deliveryStatus);
  const openCommands = commands.filter((command) => command.establishmentId === establishmentId && command.status === 'open');
  const selectedCommand = openCommands.find((command) => command.id === selectedCommandId);
  const catalog: SaleItem[] = origin === 'produto_estoque'
    ? products.map((product) => ({ productId: product.id, name: product.name, price: product.price, quantity: 1 }))
    : origin === 'cardapio'
      ? menuItems.map((item) => ({ productId: `menu:${item.id}`, name: item.name, price: item.price, quantity: 1 }))
      : origin === 'agendamento'
        ? [
            ...services.map((service) => ({ productId: `service:${service.id}`, name: service.name, price: service.price, quantity: 1 })),
            ...appointments.flatMap((appointment) => {
              if (appointment.status === 'cancelled' || appointment.status === 'completed' || appointment.paymentStatus === 'paid') return [];
              const service = services.find((item) => item.name === appointment.service);
              if (!service || soldAppointments.has(appointment.id)) return [];
              return [{
                productId: `appointment:${appointment.id}`,
                sourceRecordId: appointment.id,
                name: `${appointment.service} · ${appointment.clientName} · ${appointment.date} ${appointment.time}`,
                price: service.price,
                quantity: 1,
              }];
            }),
          ]
        : [];
  const filtered = catalog.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
  const serviceCharge = origin === 'comanda' && includeServiceCharge ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = Math.round((subtotal + serviceCharge) * 100) / 100;

  const addItem = (item: SaleItem) => {
    if (origin === 'produto_estoque') {
      const product = products.find((candidate) => candidate.id === item.productId);
      const quantity = cart.find((entry) => entry.productId === item.productId)?.quantity ?? 0;
      if (!product || quantity >= product.stock) { toast.error('Quantidade maior que o estoque disponível'); return; }
    }
    if (item.sourceRecordId && soldAppointments.has(item.sourceRecordId)) {
      toast.error('Este agendamento já foi cobrado'); return;
    }
    if (item.sourceRecordId && cart.some((entry) => entry.sourceRecordId === item.sourceRecordId)) {
      toast.error('Este agendamento já está na venda atual'); return;
    }
    const appointment = item.sourceRecordId ? appointments.find((entry) => entry.id === item.sourceRecordId) : undefined;
    if (origin === 'agendamento' && appointment && professionals.some((professional) => professional.name === appointment.professional)) {
      setSelectedProfessional(appointment.professional);
    }
    setCart((current) => {
      const existing = current.find((entry) => entry.productId === item.productId);
      return existing
        ? current.map((entry) => entry.productId === item.productId ? { ...entry, quantity: entry.quantity + 1 } : entry)
        : [...current, item];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    const item = cart.find((entry) => entry.productId === productId);
    const product = origin === 'produto_estoque' ? products.find((entry) => entry.id === productId) : null;
    if (delta > 0 && item?.sourceRecordId) return;
    setCart((current) => current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0 && (!product || item.quantity <= product.stock)));
  };

  const changeOrigin = (nextOrigin: SaleOrigin) => {
    if (!origins.includes(nextOrigin)) return;
    setSelectedOrigin(nextOrigin);
    setCart([]);
    setSearch('');
    setSelectedProfessional('');
    setSelectedCommandId('');
    setIncludeServiceCharge(false);
  };

  const addCommandToCart = (command: Command) => {
    if (!command.items.length) { toast.error(`A comanda ${command.number} não tem consumo registrado`); return; }
    setSelectedCommandId(command.id);
    setIncludeServiceCharge(false);
    setCart(command.items);
  };

  const addOrderToCart = (order: MenuOrder) => {
    if (cart.some((item) => item.sourceRecordId === order.id)) { toast.error('Este pedido já está na venda atual'); return; }
    const orderItems = order.items.map((item, index) => ({
      ...item,
      productId: `order:${order.id}:${index}:${item.productId}`,
      sourceRecordId: order.id,
    }));
    setCart((current) => [...current, ...orderItems]);
  };

  const addManualItem = () => {
    const price = Number(manualPrice);
    if (!manualName.trim() || !Number.isFinite(price) || price <= 0) {
      toast.error('Informe a descrição e um valor maior que zero'); return;
    }
    addItem({ productId: createId(), name: manualName.trim(), price: Math.round(price * 100) / 100, quantity: 1 });
    setManualName(''); setManualPrice('');
  };

  const checkout = () => {
    if (!session) { toast.error('Abra o caixa antes de registrar vendas'); return; }
    if (!cart.length) { toast.error('Adicione produtos à venda'); return; }
    if (origin === 'agendamento' && !selectedProfessional) { toast.error('Selecione o profissional que realizou o serviço'); return; }
    if (origin === 'produto_estoque' && !modules.estoque) { toast.error('O módulo de estoque não está ativo'); return; }
    if (origin === 'cardapio' && !modules.cardapio) { toast.error('O módulo de cardápio não está ativo'); return; }
    if (origin === 'agendamento' && !modules.agendamento) { toast.error('O módulo de agendamento não está ativo'); return; }
    if (origin === 'comanda' && !modules.comandas) { toast.error('O módulo de comandas não está ativo'); return; }
    if (origin === 'comanda' && (!selectedCommand || selectedCommand.items.length === 0)) { toast.error('Selecione uma comanda aberta com consumo registrado'); return; }
    if (origin === 'produto_estoque' && cart.some((item) => (products.find((product) => product.id === item.productId)?.stock ?? 0) < item.quantity)) {
      toast.error('O estoque mudou. Revise as quantidades da venda'); return;
    }
    if (origin === 'cardapio' && cart.some((item) => item.sourceRecordId && !pendingOrders.some((order) => order.id === item.sourceRecordId))) {
      toast.error('Um dos pedidos selecionados não está mais pendente'); return;
    }
    if (origin === 'agendamento' && cart.some((item) => item.sourceRecordId && soldAppointments.has(item.sourceRecordId))) {
      toast.error('Um dos agendamentos já foi cobrado'); return;
    }
    setPaymentDialogOpen(true);
  };

  const confirmPayment = (splits: PaymentSplit[], change: number) => {
    if (!session) { toast.error('Abra o caixa antes de registrar vendas'); return; }
    const sale: CashSale = {
      id: createId(), establishmentId, sessionId: session.id, createdAt: new Date().toISOString(),
      items: origin === 'agendamento' ? cart.map((item) => ({ ...item, professional: selectedProfessional })) : cart,
      total, subtotal, serviceCharge, origin,
      sourceRecordId: origin === 'comanda' ? selectedCommand?.id : cart.length === 1 ? cart[0].sourceRecordId : undefined,
      commandId: origin === 'comanda' ? selectedCommand?.id : undefined,
      commandNumber: origin === 'comanda' ? selectedCommand?.number : undefined,
      paymentMethod: splits[0].method,
      paymentSplits: splits,
      amountReceived: total + change,
      change,
    };
    setRegister((current) => ({ ...current, sales: [...current.sales, sale] }));
    if (origin === 'cardapio') {
      const chargedOrders = new Set(cart.map((item) => item.sourceRecordId).filter((id): id is string => Boolean(id)));
      setOrders((current) => current.map((order) => chargedOrders.has(order.id) ? { ...order, status: 'paid' } : order));
    }
    if (origin === 'agendamento') {
      const chargedAppointments = new Set(cart.map((item) => item.sourceRecordId).filter((id): id is string => Boolean(id)));
      setAppointments((current) => current.map((appointment) => chargedAppointments.has(appointment.id)
        ? { ...appointment, status: 'completed', paymentStatus: 'paid' }
        : appointment));
    }
    if (origin === 'comanda' && selectedCommand) {
      setCommands((current) => current.map((command) => command.id === selectedCommand.id ? { ...command, status: 'paid' } : command));
    }
    if (origin === 'produto_estoque') {
      setProducts((current) => current.map((product) => {
        const sold = cart.find((item) => item.productId === product.id);
        return sold ? { ...product, stock: product.stock - sold.quantity } : product;
      }));
    }
    setCart([]); setSelectedCommandId(''); setIncludeServiceCharge(false);
    setPaymentMethod(splits[0].method);
    if (origin === 'agendamento') setSelectedProfessional('');
    toast.success(`Venda registrada${change ? ` · troco ${money(change)}` : ''}`);
  };

  return (
    <div className="space-y-4">
      {!session && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Abra uma sessão de caixa antes de iniciar vendas.</p>}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">Origem da venda</h3></div>
          <select value={origin} onChange={(event) => changeOrigin(event.target.value as SaleOrigin)} className="mb-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {origins.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
          </select>
          {origin === 'avulso' ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
              <Input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Descrição do item ou serviço" />
              <Input type="number" min="0.01" step="0.01" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} placeholder="Valor (R$)" />
              <Button type="button" onClick={addManualItem}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </div>
          ) : (
            <>
              {origin === 'agendamento' && (
                <label className="mb-3 block space-y-1 text-sm font-medium">Profissional que realizou o serviço
                  <select value={selectedProfessional} onChange={(event) => setSelectedProfessional(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal" required>
                    <option value="">Selecione o profissional</option>
                    {professionals.map((professional) => <option key={professional.id} value={professional.name}>{professional.name}</option>)}
                  </select>
                </label>
              )}
              {origin === 'cardapio' && pendingOrders.length > 0 && (
                <div className="mb-4 space-y-2">
                  <h4 className="text-sm font-semibold">Pedidos pendentes</h4>
                  {pendingOrders.map((order) => (
                    <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium">Pedido · {new Date(order.createdAt).toLocaleString('pt-BR')}</p><p className="truncate text-xs text-muted-foreground">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p></div>
                      <span className="font-semibold">{money(order.total)}</span>
                      <Button type="button" size="sm" variant={cart.some((item) => item.sourceRecordId === order.id) ? 'secondary' : 'outline'} disabled={!session || cart.some((item) => item.sourceRecordId === order.id)} onClick={() => addOrderToCart(order)}>
                        {cart.some((item) => item.sourceRecordId === order.id) ? 'Adicionado' : 'Cobrar pedido'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {origin === 'comanda' ? (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4" />Selecione a comanda para cobrar</h4>
                  {openCommands.map((command) => (
                    <div key={command.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${selectedCommand?.id === command.id ? 'border-primary bg-primary/5' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Comanda {command.number}</p>
                        <p className="truncate text-xs text-muted-foreground">{command.items.map((item) => `${item.quantity}× ${item.name}`).join(', ') || 'Sem consumo'}</p>
                      </div>
                      <span className="font-semibold">{money(command.total)}</span>
                      <Button type="button" size="sm" variant={selectedCommand?.id === command.id ? 'secondary' : 'outline'} disabled={!session || !command.items.length} onClick={() => addCommandToCart(command)}>
                        {selectedCommand?.id === command.id ? 'Selecionada' : 'Cobrar comanda'}
                      </Button>
                    </div>
                  ))}
                  {!openCommands.length && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma comanda aberta. Crie uma no módulo Comandas.</p>}
                </div>
              ) : (
                <>
                  <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar ${SOURCE_LABELS[origin].toLowerCase()}...`} className="pl-9" /></div>
                  <div className="grid max-h-[440px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                    {filtered.map((item) => {
                      const product = origin === 'produto_estoque' ? products.find((candidate) => candidate.id === item.productId) : null;
                      return (
                        <button type="button" key={item.productId} disabled={!session || (product != null && product.stock <= 0)} onClick={() => addItem(item)} className="flex min-h-28 flex-col items-start rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
                          <span className="line-clamp-2 text-sm font-medium">{item.name}</span><span className="mt-auto pt-2 font-bold text-primary">{money(item.price)}</span>
                          {product && <span className="text-xs text-muted-foreground">Estoque: {product.stock} {product.unit}</span>}
                        </button>
                      );
                    })}
                    {!filtered.length && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Nenhum item disponível neste módulo.</p>}
                  </div>
                </>
              )}
            </>
          )}
        </Card>

        <Card className="flex flex-col p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4" />Venda atual ({cart.length})</h3>
          <div className="mb-3 max-h-[255px] flex-1 space-y-2 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{money(item.price)} cada</p></div>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={origin === 'comanda'} onClick={() => updateQuantity(item.productId, -1)} aria-label={`Remover unidade de ${item.name}`}><Trash2 className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={origin === 'comanda'} onClick={() => updateQuantity(item.productId, 1)} aria-label={`Adicionar unidade de ${item.name}`}><Plus className="h-3 w-3" /></Button>
                <span className="w-20 text-right text-sm font-semibold">{money(item.price * item.quantity)}</span>
              </div>
            ))}
            {!cart.length && <p className="py-8 text-center text-sm text-muted-foreground">Selecione produtos para iniciar uma venda.</p>}
          </div>
          <div className="space-y-3 border-t pt-3">
            {origin === 'comanda' && (
              <>
                <div className="flex items-center justify-between text-sm"><span>Consumo da comanda</span><span>{money(subtotal)}</span></div>
                <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm font-medium">
                  <span><span className="block">Adicionar 10% do garçom</span><span className="text-xs font-normal text-muted-foreground">Adicional de {money(serviceCharge)}</span></span>
                  <Switch checked={includeServiceCharge} onCheckedChange={setIncludeServiceCharge} disabled={!cart.length} aria-label="Adicionar 10% do garçom" />
                </label>
              </>
            )}
            <div className="flex items-center justify-between text-lg font-bold"><span>Total</span><span className="text-primary">{money(total)}</span></div>
            <Button type="button" className="w-full" onClick={checkout} disabled={!cart.length || !session}>Informar pagamento · {money(total)}</Button>
          </div>
        </Card>
      </div>
      <PaymentDialog
        open={paymentDialogOpen}
        total={total}
        defaultMethod={paymentMethod}
        onOpenChange={setPaymentDialogOpen}
        onConfirm={confirmPayment}
      />
    </div>
  );
}

function MovementsTab({
  establishmentId, session, register, setRegister,
}: {
  establishmentId: string;
  session: CashSession | null;
  register: CashRegisterData;
  setRegister: Dispatch<SetStateAction<CashRegisterData>>;
}) {
  const [type, setType] = useState<CashMovement['type']>('supply');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const addMovement = () => {
    const value = Number(amount);
    if (!session) { toast.error('Abra o caixa antes de registrar movimentações'); return; }
    if (!Number.isFinite(value) || value <= 0) { toast.error('Informe um valor maior que zero'); return; }
    if (!note.trim()) { toast.error('Informe o motivo da movimentação'); return; }
    const movement: CashMovement = {
      id: createId(), establishmentId, sessionId: session.id, createdAt: new Date().toISOString(),
      type, amount: Math.round(value * 100) / 100, note: note.trim(),
    };
    setRegister((current) => ({ ...current, movements: [...current.movements, movement] }));
    setAmount(''); setNote(''); toast.success(type === 'supply' ? 'Suprimento registrado' : 'Sangria registrada');
  };
  const movements = [...register.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.7fr)_1.3fr]">
      <Card className="space-y-4 p-5">
        <div><h2 className="font-semibold">Nova movimentação</h2><p className="text-sm text-muted-foreground">Registre entradas e retiradas em dinheiro.</p></div>
        {!session && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Abra uma sessão para registrar movimentações.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={type === 'supply' ? 'default' : 'outline'} onClick={() => setType('supply')}><ArrowDownCircle className="mr-2 h-4 w-4" />Suprimento</Button>
          <Button type="button" variant={type === 'withdrawal' ? 'default' : 'outline'} onClick={() => setType('withdrawal')}><ArrowUpCircle className="mr-2 h-4 w-4" />Sangria</Button>
        </div>
        <label className="block space-y-1 text-sm font-medium">Valor (R$)<Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></label>
        <label className="block space-y-1 text-sm font-medium">Motivo<Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: reforço de troco" /></label>
        <Button type="button" onClick={addMovement} disabled={!session}>Registrar movimentação</Button>
      </Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold">Histórico de movimentações</h2><MovementList movements={movements} /></Card>
    </div>
  );
}

function MovementList({ movements }: { movements: CashMovement[] }) {
  if (!movements.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>;
  return <div className="divide-y">{movements.map((movement) => (
    <div key={movement.id} className="flex items-center gap-3 py-3">
      {movement.type === 'supply' ? <ArrowDownCircle className="h-4 w-4 shrink-0 text-emerald-600" /> : <ArrowUpCircle className="h-4 w-4 shrink-0 text-amber-600" />}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{movement.note}</p><p className="text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleString('pt-BR')}</p></div>
      <span className={`text-sm font-semibold ${movement.type === 'supply' ? 'text-emerald-700' : 'text-amber-700'}`}>{movement.type === 'supply' ? '+' : '−'}{money(movement.amount)}</span>
    </div>
  ))}</div>;
}

function ReportsTab({ sales, movements, canManageSales, onCancelSale, onDeleteSale }: {
  sales: CashSale[];
  movements: CashMovement[];
  canManageSales: boolean;
  onCancelSale: (sale: CashSale) => void;
  onDeleteSale: (sale: CashSale) => void;
}) {
  const [period, setPeriod] = useState<Period>('day');
  const periodSales = sales.filter((sale) => isInPeriod(sale.createdAt, period)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const periodMovements = movements.filter((movement) => isInPeriod(movement.createdAt, period));
  const summary = summarize(periodSales);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Relatório de caixa</h2><p className="text-sm text-muted-foreground">Consolidado de vendas e pagamentos</p></div><PeriodSelector value={period} onChange={setPeriod} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><Metric icon={DollarSign} label="Faturamento" value={money(summary.total)} /><Metric icon={Receipt} label="Número de vendas" value={String(summary.count)} /><Metric icon={Wallet} label="Movimentações" value={String(periodMovements.length)} /></div>
      <Card className="p-5"><h3 className="mb-4 font-semibold">Por forma de pagamento</h3><PaymentBreakdown sales={periodSales} /></Card>
      <Card className="space-y-4 p-5"><h3 className="font-semibold">Por origem</h3><SourceBreakdown sales={periodSales} /></Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Vendas do período</h3>
        {periodSales.length ? <div className="divide-y">{periodSales.map((sale) => (
          <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm font-medium">{sale.commandNumber ? `Comanda ${sale.commandNumber} · ` : ''}{sale.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p>
              {sale.origin === 'agendamento' && sale.items.map((item) => item.professional && <p key={`${sale.id}-${item.productId}`} className="text-xs text-muted-foreground">{item.name}: {item.professional}</p>)}
              {sale.serviceCharge ? <p className="text-xs text-muted-foreground">10% do garçom: {money(sale.serviceCharge)}</p> : null}
              <p className="text-xs text-muted-foreground">{new Date(sale.createdAt).toLocaleString('pt-BR')}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right"><p className="font-semibold">{money(sale.total)}</p><p className="text-xs text-muted-foreground">{paymentLabel(sale)}</p></div>
              <Badge variant="outline" className={sale.status === 'cancelled' ? 'rounded-full border-rose-200/70 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700' : 'rounded-full border-emerald-200/60 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'}>{sale.status === 'cancelled' ? 'Cancelada' : 'Concluída'}</Badge>
              {canManageSales && <>
                <Button type="button" size="sm" variant="outline" disabled={sale.status === 'cancelled'} onClick={() => onCancelSale(sale)} aria-label={`Cancelar venda de ${money(sale.total)}`}><Undo2 className="mr-1 h-4 w-4" />Estornar</Button>
                <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => onDeleteSale(sale)} aria-label={`Excluir venda de ${money(sale.total)}`} title="Excluir venda definitivamente"><Trash2 className="h-4 w-4" /></Button>
              </>}
            </div>
          </div>
        ))}</div> : <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda neste período.</p>}
      </Card>
    </div>
  );
}

function expectedCash(session: CashSession, sales: CashSale[], movements: CashMovement[]) {
  const cashSales = sales.filter((sale) => sale.status !== 'cancelled' && sale.sessionId === session.id)
    .reduce((sum, sale) => sum + paymentAmount(sale, 'dinheiro'), 0);
  const sessionMovements = movements.filter((movement) => movement.sessionId === session.id);
  const supplies = sessionMovements.filter((movement) => movement.type === 'supply').reduce((sum, movement) => sum + movement.amount, 0);
  const withdrawals = sessionMovements.filter((movement) => movement.type === 'withdrawal').reduce((sum, movement) => sum + movement.amount, 0);
  return Math.round((session.openingAmount + cashSales + supplies - withdrawals) * 100) / 100;
}

function CashSessionTab({
  establishmentId, register, setRegister, activeSession,
}: {
  establishmentId: string;
  register: CashRegisterData;
  setRegister: Dispatch<SetStateAction<CashRegisterData>>;
  activeSession: CashSession | null;
}) {
  const [openingAmount, setOpeningAmount] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const expected = activeSession ? expectedCash(activeSession, register.sales, register.movements) : 0;
  const open = () => {
    const value = Number(openingAmount) || 0;
    if (value < 0) { toast.error('O saldo inicial não pode ser negativo'); return; }
    const session: CashSession = { id: createId(), establishmentId, openedAt: new Date().toISOString(), openingAmount: Math.round(value * 100) / 100 };
    setRegister((current) => ({ ...current, activeSessionId: session.id, sessions: [...current.sessions, session] }));
    setOpeningAmount(''); toast.success('Caixa aberto');
  };
  const close = () => {
    if (!activeSession) return;
    if (countedAmount === '' || !Number.isFinite(Number(countedAmount))) { toast.error('Informe o valor contado no caixa'); return; }
    const counted = Math.round(Number(countedAmount) * 100) / 100;
    if (counted < 0) { toast.error('O valor contado não pode ser negativo'); return; }
    setRegister((current) => ({
      ...current,
      activeSessionId: null,
      sessions: current.sessions.map((session) => session.id === activeSession.id
        ? { ...session, closedAt: new Date().toISOString(), expectedCash: expected, countedCash: counted, difference: Math.round((counted - expected) * 100) / 100 }
        : session),
    }));
    setCountedAmount(''); toast.success('Caixa fechado e fechamento registrado');
  };
  const closedSessions = [...register.sessions].filter((session) => session.closedAt).reverse();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2"><div className={`flex h-9 w-9 items-center justify-center rounded-md ${activeSession ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{activeSession ? <UnlockKeyhole className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}</div><div><h2 className="font-semibold">{activeSession ? 'Sessão aberta' : 'Caixa fechado'}</h2><p className="text-xs text-muted-foreground">{activeSession ? `Desde ${new Date(activeSession.openedAt).toLocaleString('pt-BR')}` : 'Abra uma sessão para começar a vender.'}</p></div></div>
        {!activeSession ? <>
          <label className="block space-y-1 text-sm font-medium">Saldo inicial (R$)<Input type="number" min="0" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} placeholder="0,00" /></label>
          <Button type="button" onClick={open}><UnlockKeyhole className="mr-2 h-4 w-4" />Abrir caixa</Button>
        </> : <>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Saldo esperado em dinheiro</p><p className="text-xl font-bold">{money(expected)}</p></div>
          <label className="block space-y-1 text-sm font-medium">Valor contado (R$)<Input type="number" min="0" step="0.01" value={countedAmount} onChange={(event) => setCountedAmount(event.target.value)} placeholder="Informe a contagem" /></label>
          {countedAmount !== '' && <p className="text-sm text-muted-foreground">Diferença: <strong className={Number(countedAmount) === expected ? 'text-emerald-700' : 'text-amber-700'}>{money(Number(countedAmount) - expected)}</strong></p>}
          <Button type="button" variant="destructive" onClick={close}><LockKeyhole className="mr-2 h-4 w-4" />Fechar caixa</Button>
        </>}
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Sessões anteriores</h2>
        {closedSessions.length ? <div className="divide-y">{closedSessions.map((session) => (
          <div key={session.id} className="grid grid-cols-2 gap-2 py-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Abertura</p><p>{new Date(session.openedAt).toLocaleString('pt-BR')}</p></div>
            <div><p className="text-xs text-muted-foreground">Fechamento</p><p>{session.closedAt ? new Date(session.closedAt).toLocaleString('pt-BR') : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Esperado / contado</p><p>{money(session.expectedCash ?? 0)} / {money(session.countedCash ?? 0)}</p></div>
            <div><p className="text-xs text-muted-foreground">Diferença</p><p className="font-semibold">{money(session.difference ?? 0)}</p></div>
          </div>
        ))}</div> : <p className="py-8 text-center text-sm text-muted-foreground">Nenhum fechamento registrado.</p>}
      </Card>
    </div>
  );
}