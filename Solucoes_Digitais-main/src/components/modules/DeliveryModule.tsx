import { useRef, useState } from 'react';
import { Bike, Check, Clock3, Plus, Truck, UserRound, X } from 'lucide-react';
import { useApp } from '@/store';
import { formatCurrency, menuItems as initialMenuItems } from '@/mockData';
import { usePersistentState } from '@/hooks/usePersistentState';
import type {
  CashRegisterData, CashSale, DeliveryDriver, DeliverySettings, DeliveryStatus,
  MenuItem, MenuOrder, PaymentMethod, PaymentSplit, SaleItem,
} from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaymentDialog } from '@/components/modules/PaymentDialog';
import { toast } from 'sonner';
import { digitsOnly, formatPostalCode, lookupPostalAddress } from '@/lib/brazil';

const EMPTY_REGISTER: CashRegisterData = { activeSessionId: null, sessions: [], sales: [], movements: [] };
const DEFAULT_SETTINGS: DeliverySettings = { deliveryFee: 0 };
const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'credito', label: 'Cartão de crédito' },
  { value: 'debito', label: 'Cartão de débito' },
  { value: 'outro', label: 'Outro' },
];
const STATUS_DETAILS: Record<DeliveryStatus, { label: string; className: string }> = {
  production: { label: 'EM PRODUÇÃO', className: 'border-yellow-300 bg-yellow-100 text-yellow-900' },
  dispatched: { label: 'DESPACHADO', className: 'border-red-300 bg-red-100 text-red-900' },
  finalized: { label: 'FINALIZADO', className: 'border-slate-300 bg-slate-200 text-slate-700' },
};

function getAccentBorderStyle(accentColor: string) {
  return { borderColor: `color-mix(in srgb, ${accentColor} 32%, transparent)` };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DeliveryModule() {
  const { selectedEstablishment } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [orders, setOrders] = usePersistentState<MenuOrder[]>(`menu-orders:${establishmentId}`, []);
  const [register, setRegister] = usePersistentState<CashRegisterData>(`cash-register:${establishmentId}`, EMPTY_REGISTER);
  const [drivers] = usePersistentState<DeliveryDriver[]>(`delivery-drivers:${establishmentId}`, []);
  const [settings] = usePersistentState<DeliverySettings>(`delivery-settings:${establishmentId}`, DEFAULT_SETTINGS);
  const [menuItems] = usePersistentState<MenuItem[]>(
    `menu-items:${establishmentId}`,
    selectedEstablishment?.slug === 'burger-house' ? initialMenuItems : [],
  );
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderPaymentOpen, setNewOrderPaymentOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<MenuOrder | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const postalCodeLookupId = useRef(0);
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(settings.deliveryFee);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState(0);

  if (!selectedEstablishment) return null;

  const accentBorderStyle = getAccentBorderStyle(selectedEstablishment.theme.accentColor);
  const deliveryOrders = orders
    .filter((order) => order.establishmentId === establishmentId)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
  const fee = deliveryFee;
  const inProduction = deliveryOrders.filter((order) => (order.deliveryStatus ?? 'production') === 'production').length;
  const dispatched = deliveryOrders.filter((order) => order.deliveryStatus === 'dispatched').length;

  const addItem = (item: MenuItem) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.productId === item.id);
      return existing
        ? current.map((entry) => entry.productId === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry)
        : [...current, { productId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const addCustomItem = () => {
    if (!customName.trim() || !Number.isFinite(customPrice) || customPrice <= 0) {
      toast.error('Informe o nome do item e um valor maior que zero');
      return;
    }
    setCart((current) => [...current, {
      productId: createId(), name: customName.trim(), price: Math.round(customPrice * 100) / 100, quantity: 1,
    }]);
    setCustomName('');
    setCustomPrice(0);
  };

  const searchPostalCode = async (value: string) => {
    const lookupId = ++postalCodeLookupId.current;
    const digits = digitsOnly(value);
    setPostalCode(formatPostalCode(value));
    if (digits.length !== 8) {
      setLookingUpPostalCode(false);
      return;
    }

    setLookingUpPostalCode(true);
    try {
      const foundAddress = await lookupPostalAddress(digits);
      if (lookupId === postalCodeLookupId.current) setAddress(foundAddress);
    } catch (reason) {
      if (lookupId === postalCodeLookupId.current) {
        toast.error(reason instanceof Error ? reason.message : 'Não foi possível consultar o CEP');
      }
    } finally {
      if (lookupId === postalCodeLookupId.current) setLookingUpPostalCode(false);
    }
  };

  const createOrder = () => {
    if (!customerName.trim() || !address.trim() || !phone.trim() || !document.trim()) {
      toast.error('Preencha nome, endereço, telefone e CPF/CNPJ do cliente');
      return;
    }
    if (!cart.length) {
      toast.error('Adicione ao menos um item ao pedido');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error('Informe um valor válido para a taxa de entrega');
      return;
    }
    setNewOrderPaymentOpen(true);
  };

  const saveOrder = (splits: PaymentSplit[]) => {
    const order: MenuOrder = {
      id: createId(),
      establishmentId,
      createdAt: new Date().toISOString(),
      items: cart,
      total: subtotal,
      status: 'pending',
      channel: 'delivery',
      customerName: customerName.trim(),
      address: address.trim(),
      postalCode: digitsOnly(postalCode),
      phone: phone.trim(),
      document: digitsOnly(document),
      deliveryFee: Math.round(fee * 100) / 100,
      paymentMethod: splits[0].method,
      paymentSplits: splits,
      deliveryStatus: 'production',
    };
    setOrders((current) => [...current, order]);
    setPaymentMethod(splits[0].method);
    setCustomerName('');
    setAddress('');
    setPostalCode('');
    postalCodeLookupId.current += 1;
    setLookingUpPostalCode(false);
    setPhone('');
    setDocument('');
    setCart([]);
    setNewOrderOpen(false);
    toast.success('Pedido criado e enviado para produção');
  };

  const dispatchOrder = (order: MenuOrder) => {
    if ((order.deliveryStatus ?? 'production') !== 'production') return;
    setOrders((current) => current.map((entry) => entry.id === order.id
      ? { ...entry, deliveryStatus: 'dispatched' }
      : entry));
    toast.success('Pedido despachado para entrega');
  };

  const openPaymentDialog = (order: MenuOrder) => {
    if (order.deliveryStatus !== 'dispatched') return;
    if (order.status === 'paid' || order.cashSaleId) {
      toast.error('Este pedido já foi registrado no caixa');
      return;
    }
    const session = register.sessions.find((entry) => entry.id === register.activeSessionId && !entry.closedAt);
    if (!session) {
      toast.error('Abra uma sessão no caixa antes de finalizar o pagamento');
      return;
    }
    setPaymentOrder(order);
  };

  const finalizePayment = (splits: PaymentSplit[], change: number) => {
    if (!paymentOrder) return;
    const order = paymentOrder;
    const session = register.sessions.find((entry) => entry.id === register.activeSessionId && !entry.closedAt);
    if (!session) {
      toast.error('Abra uma sessão no caixa antes de finalizar o pagamento');
      setPaymentOrder(null);
      return;
    }
    const deliveryFeeValue = Math.max(0, order.deliveryFee ?? 0);
    const total = Math.round((order.total + deliveryFeeValue) * 100) / 100;
    const saleId = createId();
    const saleItems: SaleItem[] = [
      ...order.items.map((item) => ({ ...item, sourceRecordId: order.id })),
      ...(deliveryFeeValue > 0 ? [{
        productId: `delivery-fee:${order.id}`,
        name: 'Taxa de entrega',
        price: deliveryFeeValue,
        quantity: 1,
        sourceRecordId: order.id,
      }] : []),
    ];
    const sale: CashSale = {
      id: saleId,
      establishmentId,
      sessionId: session.id,
      createdAt: new Date().toISOString(),
      items: saleItems,
      total,
      subtotal: order.total,
      origin: 'delivery',
      sourceRecordId: order.id,
      paymentMethod: splits[0].method,
      paymentSplits: splits,
      amountReceived: total + change,
      change,
    };
    setRegister((current) => ({ ...current, sales: [...current.sales, sale] }));
    setOrders((current) => current.map((entry) => entry.id === order.id
      ? { ...entry, status: 'paid', deliveryStatus: 'finalized', cashSaleId: saleId }
      : entry));
    setPaymentOrder(null);
    toast.success('Pagamento finalizado e registrado no caixa');
  };

  const updateOrderDriver = (orderId: string, driverId: string) => {
    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...order, driverId: driverId || undefined }
      : order));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bike className="h-6 w-6 text-primary" />Delivery</h1>
          <p className="text-muted-foreground">Acompanhe pedidos do site e da loja, da produção ao pagamento.</p>
        </div>
        <Button type="button" onClick={() => setNewOrderOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo pedido</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4" style={accentBorderStyle}><p className="text-sm text-muted-foreground">Pedidos</p><p className="text-2xl font-bold">{deliveryOrders.length}</p></Card>
        <Card className="p-4" style={accentBorderStyle}><p className="text-sm text-muted-foreground">Em produção</p><p className="text-2xl font-bold text-yellow-700">{inProduction}</p></Card>
        <Card className="p-4" style={accentBorderStyle}><p className="text-sm text-muted-foreground">Despachados</p><p className="text-2xl font-bold text-red-700">{dispatched}</p></Card>
      </div>

      <Card className="p-5" style={accentBorderStyle}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Pedidos</h2><p className="text-sm text-muted-foreground">Pedidos do site e lançados pela equipe.</p></div>
          <Badge variant="secondary">{deliveryOrders.length} total</Badge>
        </div>
        <div className="space-y-3">
          {!deliveryOrders.length && <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum pedido recebido ainda. Os pedidos do site aparecerão aqui.</p>}
          {deliveryOrders.map((order) => {
            const status = order.deliveryStatus ?? (order.status === 'paid' ? 'finalized' : 'production');
            const statusInfo = STATUS_DETAILS[status];
            const driver = drivers.find((entry) => entry.id === order.driverId);
            const total = order.total + (order.deliveryFee ?? 0);
            const recordedSale = order.cashSaleId ? register.sales.find((sale) => sale.id === order.cashSaleId) : undefined;
            const recordedPayment = recordedSale?.paymentSplits?.map((split) => {
              const label = PAYMENT_OPTIONS.find((option) => option.value === split.method)?.label ?? split.method;
              return `${label}: ${formatCurrency(split.amount)}`;
            }).join(' · ');
            const plannedPayment = order.paymentSplits?.map((split) => {
              const label = PAYMENT_OPTIONS.find((option) => option.value === split.method)?.label ?? split.method;
              return `${label}: ${formatCurrency(split.amount)}`;
            }).join(' · ');
            return (
              <article key={order.id} className="space-y-3 rounded-lg border p-4" style={accentBorderStyle}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="font-semibold">{order.customerName || 'Pedido do cardápio'}</h3><p className="text-xs text-muted-foreground">Pedido {order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleString('pt-BR')}</p></div>
                  <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="font-medium">Endereço:</span> {order.address || 'Não informado'}</p>
                  {order.postalCode && <p><span className="font-medium">CEP:</span> {formatPostalCode(order.postalCode)}</p>}
                  <p><span className="font-medium">Telefone:</span> {order.phone || 'Não informado'}</p>
                  <p><span className="font-medium">CPF/CNPJ:</span> {order.document || 'Não informado'}</p>
                  <p><span className="font-medium">Pagamento:</span> {recordedPayment || plannedPayment || PAYMENT_OPTIONS.find((option) => option.value === order.paymentMethod)?.label || 'Não informado'}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  {order.items.map((item, index) => <div key={`${order.id}-${index}`} className="flex justify-between gap-2"><span>{item.quantity}× {item.name}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}
                  <div className="mt-2 flex justify-between border-t pt-2 text-muted-foreground"><span>Entrega</span><span>{formatCurrency(order.deliveryFee ?? 0)}</span></div>
                  <div className="mt-1 flex justify-between font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
                </div>
                {status !== 'finalized' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {status === 'production' ? (
                      <label className="flex min-w-48 flex-1 items-center gap-2 text-sm">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <select value={order.driverId ?? ''} onChange={(event) => updateOrderDriver(order.id, event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2">
                          <option value="">Sem entregador</option>
                          {drivers.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                        </select>
                      </label>
                    ) : <p className="text-sm text-muted-foreground">{driver ? `Entregador: ${driver.name}` : 'Entregador não informado'}</p>}
                    {status === 'production'
                      ? <Button type="button" onClick={() => dispatchOrder(order)}><Truck className="mr-2 h-4 w-4" />Despachar</Button>
                      : <Button type="button" onClick={() => openPaymentDialog(order)}><Check className="mr-2 h-4 w-4" />Finalizar pagamento</Button>}
                  </div>
                )}
                {status === 'finalized' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Pagamento registrado no caixa.</p>}
              </article>
            );
          })}
        </div>
      </Card>

      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" style={accentBorderStyle}>
          <DialogHeader>
            <DialogTitle>Novo pedido</DialogTitle>
            <DialogDescription>Preencha os dados e os itens. O pedido entrará em produção ao salvar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-muted/10 p-4 sm:grid-cols-2" style={accentBorderStyle}>
              <label className="space-y-1 text-sm font-medium">Nome<Input style={accentBorderStyle} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label className="space-y-1 text-sm font-medium">Telefone<Input style={accentBorderStyle} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              <label className="space-y-1 text-sm font-medium">CEP<Input style={accentBorderStyle} inputMode="numeric" autoComplete="postal-code" value={postalCode} onChange={(event) => void searchPostalCode(event.target.value)} placeholder="00000-000" /></label>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">Endereço de entrega<Input style={accentBorderStyle} autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Confira e informe número/complemento" /></label>
              <label className="space-y-1 text-sm font-medium">CPF ou CNPJ<Input style={accentBorderStyle} inputMode="numeric" maxLength={14} value={document} onChange={(event) => setDocument(digitsOnly(event.target.value).slice(0, 14))} /></label>
              <label className="space-y-1 text-sm font-medium">Valor da entrega (R$)<CurrencyInput style={accentBorderStyle} value={deliveryFee} onValueChange={setDeliveryFee} /></label>
              {lookingUpPostalCode && <p className="text-xs text-muted-foreground sm:col-span-2">Buscando endereço pelo CEP...</p>}
              <p className="text-sm text-muted-foreground sm:col-span-2">Ao salvar, informe uma ou mais formas de pagamento e os respectivos valores.</p>
            </div>
            {!!menuItems.length && <div>
              <h3 className="mb-2 text-sm font-semibold">Adicionar do cardápio</h3>
              <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {menuItems.map((item) => (
                  <button type="button" key={item.id} onClick={() => addItem(item)} className="flex items-center justify-between gap-2 rounded-md border p-2 text-left text-sm hover:border-primary/50 hover:bg-primary/5" style={accentBorderStyle}>
                    <span className="truncate">{item.name}</span><span className="shrink-0 font-medium">{formatCurrency(item.price)} <Plus className="inline h-3 w-3" /></span>
                  </button>
                ))}
              </div>
            </div>}
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
              <Input style={accentBorderStyle} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Outro item" />
              <CurrencyInput style={accentBorderStyle} value={customPrice} onValueChange={setCustomPrice} placeholder="Valor (R$)" />
              <Button type="button" variant="outline" onClick={addCustomItem}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </div>
            {cart.length > 0 && <div className="space-y-2 rounded-md border p-3" style={accentBorderStyle}>
              {cart.map((item) => (
                <div key={item.productId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.quantity}× {item.name}</span>
                  <span className="flex items-center gap-2 font-medium">
                    {formatCurrency(item.price * item.quantity)}
                    <button type="button" aria-label={`Remover ${item.name}`} onClick={() => setCart((current) => current.filter((entry) => entry.productId !== item.productId))}><X className="h-4 w-4 text-muted-foreground" /></button>
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 text-sm">
                <div className="flex justify-between"><span>Itens</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between"><span>Entrega</span><span>{formatCurrency(Number.isFinite(fee) ? fee : 0)}</span></div>
                <div className="mt-1 flex justify-between font-bold"><span>Total</span><span>{formatCurrency(subtotal + (Number.isFinite(fee) ? fee : 0))}</span></div>
              </div>
            </div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewOrderOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={createOrder}>Salvar pedido</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PaymentDialog
        open={newOrderPaymentOpen}
        total={Math.round((subtotal + (Number.isFinite(fee) ? fee : 0)) * 100) / 100}
        defaultMethod={paymentMethod}
        mode="select"
        onOpenChange={setNewOrderPaymentOpen}
        onConfirm={(splits) => saveOrder(splits)}
      />
      <PaymentDialog
        open={Boolean(paymentOrder)}
        total={paymentOrder ? Math.round((paymentOrder.total + (paymentOrder.deliveryFee ?? 0)) * 100) / 100 : 0}
        defaultMethod={paymentOrder?.paymentMethod ?? 'dinheiro'}
        defaultSplits={paymentOrder?.paymentSplits}
        onOpenChange={(open) => { if (!open) setPaymentOrder(null); }}
        onConfirm={finalizePayment}
      />
    </div>
  );
}

export function DeliveryStoreSettings({ establishmentId }: { establishmentId: string }) {
  const { selectedEstablishment } = useApp();
  const [drivers, setDrivers] = usePersistentState<DeliveryDriver[]>(`delivery-drivers:${establishmentId}`, []);
  const [settings, setSettings] = usePersistentState<DeliverySettings>(`delivery-settings:${establishmentId}`, DEFAULT_SETTINGS);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const accentBorderStyle = getAccentBorderStyle(selectedEstablishment?.theme.accentColor ?? '#1e3a5f');

  const addDriver = () => {
    if (!driverName.trim() || !driverPhone.trim()) {
      toast.error('Informe o nome e telefone do entregador');
      return;
    }
    setDrivers((current) => [...current, {
      id: createId(), name: driverName.trim(), phone: driverPhone.trim(), active: true,
    }]);
    setDriverName('');
    setDriverPhone('');
    toast.success('Entregador cadastrado');
  };

  return (
    <Card className="space-y-4 p-6" style={accentBorderStyle}>
      <div><h2 className="text-lg font-semibold">Configurações do Delivery</h2><p className="text-sm text-muted-foreground">Cadastre entregadores e defina a taxa padrão da loja.</p></div>
      <label className="block max-w-sm space-y-1 text-sm font-medium">Valor padrão da entrega (R$)
        <CurrencyInput style={accentBorderStyle} value={settings.deliveryFee} onValueChange={(value) => {
          setSettings((current) => ({ ...current, deliveryFee: value }));
        }} />
      </label>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input style={accentBorderStyle} value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Nome do entregador" />
        <Input style={accentBorderStyle} value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} placeholder="Telefone" />
        <Button type="button" onClick={addDriver}><Plus className="mr-2 h-4 w-4" />Adicionar entregador</Button>
      </div>
      <div className="space-y-2">
        {!drivers.length && <p className="text-sm text-muted-foreground">Nenhum entregador cadastrado.</p>}
        {drivers.map((driver) => (
          <div key={driver.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3" style={accentBorderStyle}>
            <div><p className="font-medium">{driver.name}</p><p className="text-sm text-muted-foreground">{driver.phone}</p></div>
            <div className="flex items-center gap-2">
              <Badge variant={driver.active ? 'secondary' : 'outline'}>{driver.active ? 'Ativo' : 'Inativo'}</Badge>
              <Button type="button" size="sm" variant="outline" onClick={() => setDrivers((current) => current.map((entry) => entry.id === driver.id ? { ...entry, active: !entry.active } : entry))}>{driver.active ? 'Desativar' : 'Ativar'}</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
