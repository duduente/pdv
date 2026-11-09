import { useEffect, useRef, useState } from 'react';
import { Bike, Bell, Check, Clock3, Pencil, Plus, Printer, Truck, UserRound, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useApp } from '@/store';
import { formatCurrency, menuItems as initialMenuItems } from '@/mockData';
import { syncPersistentState, usePersistentState } from '@/hooks/usePersistentState';
import { supabase } from '@/lib/supabase';
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
import { AuditHistory } from '@/components/modules/AuditHistory';
import { toast } from 'sonner';
import { digitsOnly, formatPostalCode, lookupPostalAddress } from '@/lib/brazil';
import { applyDeliveryOrderEdits } from '@/lib/criticalFlows';
import { appendAuditEvent, createAuditEvent, describeOrderChanges } from '@/lib/auditLog';
import { printDeliveryOrder } from '@/lib/orderPrinting';

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

function parseOrders(value: unknown): MenuOrder[] {
  if (!Array.isArray(value)) throw new Error('Os pedidos recebidos do servidor estão em formato inválido.');
  return value.filter((order): order is MenuOrder => (
    typeof order === 'object'
    && order !== null
    && 'id' in order
    && typeof order.id === 'string'
  ));
}

function getAccentBorderStyle(accentColor: string) {
  return { borderColor: `color-mix(in srgb, ${accentColor} 32%, transparent)` };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DeliveryModule() {
  const { selectedEstablishment } = useApp();
  const { user } = useAuth();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const ordersStorageKey = `menu-orders:${establishmentId}`;
  const [orders, setOrders] = usePersistentState<MenuOrder[]>(ordersStorageKey, []);
  const [register, setRegister] = usePersistentState<CashRegisterData>(`cash-register:${establishmentId}`, EMPTY_REGISTER);
  const [drivers] = usePersistentState<DeliveryDriver[]>(`delivery-drivers:${establishmentId}`, []);
  const [settings] = usePersistentState<DeliverySettings>(`delivery-settings:${establishmentId}`, DEFAULT_SETTINGS);
  const [menuItems] = usePersistentState<MenuItem[]>(
    `menu-items:${establishmentId}`,
    selectedEstablishment?.slug === 'burger-house' ? initialMenuItems : [],
  );
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderPaymentOpen, setNewOrderPaymentOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<MenuOrder | null>(null);
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery');
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
  const seenOrderIds = useRef<Set<string> | null>(null);
  const latestOrders = useRef(orders);
  latestOrders.current = orders;
  const remoteNotificationsReady = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useEffect(() => {
    let active = true;
    const recordUndocumentedWebsiteOrders = (currentOrders: MenuOrder[]) => {
      const events = currentOrders
        .filter((order) => order.channel === 'website')
        .map((order) => ({
          id: createId(),
          entityType: 'order' as const,
          entityId: order.id,
          action: 'created' as const,
          actorId: null,
          actorName: order.customerName || 'Cliente pelo cardápio digital',
          occurredAt: order.createdAt,
          summary: `Pedido recebido pelo cardápio digital: ${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'}, total ${formatCurrency(order.total + (order.deliveryFee ?? 0))}.`,
        }));
      if (events.length) {
        setRegister((current) => {
          const loggedIds = new Set((current.auditEvents ?? [])
            .filter((event) => event.entityType === 'order' && event.action === 'created')
            .map((event) => event.entityId));
          return events.reduce((updated, event) => loggedIds.has(event.entityId)
            ? updated
            : appendAuditEvent(updated, event), current);
        });
      }
    };
    const client = supabase;
    const usesRemoteStorage = Boolean(client && user && !user.isDemo);
    if (!usesRemoteStorage || !client) {
      seenOrderIds.current = new Set(latestOrders.current.map((order) => order.id));
      remoteNotificationsReady.current = true;
      recordUndocumentedWebsiteOrders(latestOrders.current);
      return;
    }

    remoteNotificationsReady.current = false;

    const initializeAndSubscribe = async () => {
      const { data, error } = await client
        .from('tenant_records')
        .select('value')
        .eq('storage_key', ordersStorageKey)
        .maybeSingle();

      if (!active) return;
      if (error) {
        toast.error(`Não foi possível sincronizar os novos pedidos: ${error.message}`);
        return;
      }
      let initialOrders: MenuOrder[] = [];
      try {
        initialOrders = parseOrders(data?.value ?? []);
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : 'Os pedidos recebidos do servidor estão em formato inválido.');
        return;
      }
      seenOrderIds.current = new Set(initialOrders.map((order) => order.id));
      remoteNotificationsReady.current = true;
      recordUndocumentedWebsiteOrders(initialOrders);
      syncPersistentState(ordersStorageKey, initialOrders);

      const channel = client
        .channel(`delivery-orders:${establishmentId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'tenant_records',
          filter: `storage_key=eq.${ordersStorageKey}`,
        }, (payload) => {
          if (!active || !('value' in payload.new)) return;
          try {
            const currentOrders = parseOrders(payload.new.value);
            syncPersistentState(ordersStorageKey, currentOrders);
          } catch (reason) {
            toast.error(reason instanceof Error ? reason.message : 'Não foi possível atualizar os pedidos recebidos.');
          }
        })
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            toast.error(error?.message ?? 'Não foi possível acompanhar os novos pedidos em tempo real.');
          }
        });

      return channel;
    };

    let subscribedChannel: ReturnType<typeof client.channel> | undefined;
    void initializeAndSubscribe().then((channel) => {
      if (channel && active) subscribedChannel = channel;
      else if (channel) void client.removeChannel(channel);
    }).catch((reason: unknown) => {
      if (active) {
        toast.error(reason instanceof Error ? reason.message : 'Não foi possível iniciar os avisos de pedidos.');
      }
    });

    return () => {
      active = false;
      if (subscribedChannel) void client.removeChannel(subscribedChannel);
    };
  }, [establishmentId, ordersStorageKey, setRegister, user]);

  useEffect(() => {
    if (!remoteNotificationsReady.current) return;
    const currentIds = new Set(orders.map((order) => order.id));
    const newOrders = seenOrderIds.current === null
      ? []
      : orders.filter((order) => !seenOrderIds.current?.has(order.id));
    seenOrderIds.current = currentIds;

    for (const order of newOrders) {
      toast.info(`Novo pedido recebido${order.customerName ? ` de ${order.customerName}` : ''}`);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Novo pedido no Delivery', {
            body: order.customerName ? `Pedido de ${order.customerName}` : 'Um novo pedido foi recebido.',
            tag: `delivery-order-${order.id}`,
          });
        } catch {
          toast.error('O navegador não conseguiu exibir a notificação do novo pedido.');
        }
      }
    }
    const publicOrderEvents = newOrders
      .filter((order) => order.channel === 'website')
      .map((order) => ({
        id: createId(),
        entityType: 'order' as const,
        entityId: order.id,
        action: 'created' as const,
        actorId: null,
        actorName: order.customerName || 'Cliente pelo cardápio digital',
        occurredAt: order.createdAt,
        summary: `Pedido recebido pelo cardápio digital: ${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'}, total ${formatCurrency(order.total + (order.deliveryFee ?? 0))}.`,
      }));
    if (publicOrderEvents.length) {
      setRegister((current) => publicOrderEvents.reduce((updated, event) => appendAuditEvent(updated, event), current));
    }
  }, [orders, setRegister]);

  if (!selectedEstablishment) return null;

  const accentBorderStyle = getAccentBorderStyle(selectedEstablishment.theme.accentColor);
  const deliveryOrders = orders
    .filter((order) => order.establishmentId === establishmentId)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
  const fee = deliveryFee;
  const editingOrder = orders.find((order) => order.id === editingOrderId);
  const canEditOrderContents = !editingOrder || (editingOrder.status !== 'paid' && !editingOrder.cashSaleId);
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
    if (!customerName.trim() || !phone.trim() || !document.trim() || (orderType === 'delivery' && !address.trim())) {
      toast.error(orderType === 'delivery'
        ? 'Preencha nome, endereço, telefone e CPF/CNPJ do cliente'
        : 'Preencha nome, telefone e CPF/CNPJ do cliente');
      return;
    }
    if (!cart.length) {
      toast.error('Adicione ao menos um item ao pedido');
      return;
    }
    if (orderType === 'delivery' && (!Number.isFinite(fee) || fee < 0)) {
      toast.error('Informe um valor válido para a taxa de entrega');
      return;
    }
    if (editingOrder) {
      const updatedOrder = applyDeliveryOrderEdits(editingOrder, {
        orderType,
        customerName: customerName.trim(),
        address: orderType === 'delivery' ? address.trim() : '',
        postalCode: orderType === 'delivery' ? digitsOnly(postalCode) : '',
        phone: phone.trim(),
        document: digitsOnly(document),
        items: cart,
        total: subtotal,
        deliveryFee: orderType === 'delivery' ? Math.round(fee * 100) / 100 : 0,
        driverId: editingOrder.driverId,
        deliveryStatus: editingOrder.deliveryStatus,
      });
      const changedFields = describeOrderChanges(editingOrder, updatedOrder);
      setOrders((current) => current.map((order) => order.id === editingOrder.id ? updatedOrder : order));
      if (changedFields.length) {
        const event = createAuditEvent(user, {
          entityType: 'order',
          entityId: editingOrder.id,
          action: 'edited',
          occurredAt: new Date().toISOString(),
          summary: `Pedido editado: ${changedFields.join(', ')}.`,
        });
        setRegister((current) => appendAuditEvent(current, event));
      }
      setNewOrderOpen(false);
      setEditingOrderId(null);
      toast.success('Pedido atualizado');
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
      orderType,
      customerName: customerName.trim(),
      address: orderType === 'delivery' ? address.trim() : '',
      postalCode: orderType === 'delivery' ? digitsOnly(postalCode) : '',
      phone: phone.trim(),
      document: digitsOnly(document),
      deliveryFee: orderType === 'delivery' ? Math.round(fee * 100) / 100 : 0,
      paymentMethod: splits[0].method,
      paymentSplits: splits,
      deliveryStatus: 'production',
    };
    setOrders((current) => [...current, order]);
    const auditEvent = createAuditEvent(user, {
      entityType: 'order',
      entityId: order.id,
      action: 'created',
      occurredAt: order.createdAt,
      summary: `Pedido criado: ${order.orderType === 'pickup' ? 'retirada' : 'entrega'}, ${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'}, total ${formatCurrency(order.total + (order.deliveryFee ?? 0))}.`,
    });
    setRegister((current) => appendAuditEvent(current, auditEvent));
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
    setEditingOrderId(null);
    toast.success('Pedido criado e enviado para produção');
  };

  const openNewOrder = () => {
    setEditingOrderId(null);
    setOrderType('delivery');
    setCustomerName('');
    setAddress('');
    setPostalCode('');
    setPhone('');
    setDocument('');
    setDeliveryFee(settings.deliveryFee);
    setCart([]);
    setNewOrderOpen(true);
  };

  const openEditOrder = (order: MenuOrder) => {
    setEditingOrderId(order.id);
    setOrderType(order.orderType ?? 'delivery');
    setCustomerName(order.customerName ?? '');
    setAddress(order.address ?? '');
    setPostalCode(order.postalCode ?? '');
    setPhone(order.phone ?? '');
    setDocument(order.document ?? '');
    setDeliveryFee(order.deliveryFee ?? settings.deliveryFee);
    setCart(order.items.map((item) => ({ ...item })));
    setNewOrderOpen(true);
  };

  const dispatchOrder = (order: MenuOrder) => {
    if ((order.deliveryStatus ?? 'production') !== 'production') return;
    setOrders((current) => current.map((entry) => entry.id === order.id
      ? { ...entry, deliveryStatus: 'dispatched' }
      : entry));
    const event = createAuditEvent(user, {
      entityType: 'order',
      entityId: order.id,
      action: 'status_changed',
      occurredAt: new Date().toISOString(),
      summary: order.orderType === 'pickup' ? 'Pedido marcado como pronto para retirada.' : 'Pedido despachado para entrega.',
    });
    setRegister((current) => appendAuditEvent(current, event));
    toast.success(order.orderType === 'pickup' ? 'Pedido pronto para retirada' : 'Pedido despachado para entrega');
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
      ...order.items.map((item) => ({
        ...item,
        unitCost: item.unitCost ?? menuItems.find((menuItem) => menuItem.id === item.productId)?.unitCost,
        sourceRecordId: order.id,
      })),
      ...(deliveryFeeValue > 0 ? [{
        productId: `delivery-fee:${order.id}`,
        name: 'Taxa de entrega',
        price: deliveryFeeValue,
        unitCost: 0,
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
    const occurredAt = new Date().toISOString();
    const saleEvent = createAuditEvent(user, {
      entityType: 'sale',
      entityId: sale.id,
      action: 'created',
      occurredAt,
      summary: `Venda de delivery registrada no caixa: ${formatCurrency(sale.total)}.`,
    });
    const orderEvent = createAuditEvent(user, {
      entityType: 'order',
      entityId: order.id,
      action: 'status_changed',
      occurredAt,
      summary: 'Pedido finalizado e pagamento registrado no caixa.',
    });
    setRegister((current) => appendAuditEvent(
      appendAuditEvent({ ...current, sales: [...current.sales, sale] }, saleEvent),
      orderEvent,
    ));
    setOrders((current) => current.map((entry) => entry.id === order.id
      ? { ...entry, status: 'paid', deliveryStatus: 'finalized', cashSaleId: saleId }
      : entry));
    setPaymentOrder(null);
    toast.success('Pagamento finalizado e registrado no caixa');
  };

  const updateOrderDriver = (orderId: string, driverId: string) => {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order || order.driverId === (driverId || undefined)) return;
    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...order, driverId: driverId || undefined }
      : order));
    const driverName = drivers.find((driver) => driver.id === driverId)?.name;
    const event = createAuditEvent(user, {
      entityType: 'order',
      entityId: orderId,
      action: 'edited',
      occurredAt: new Date().toISOString(),
      summary: driverName ? `Entregador definido: ${driverName}.` : 'Entregador removido do pedido.',
    });
    setRegister((current) => appendAuditEvent(current, event));
  };

  const enableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Este navegador não oferece notificações de sistema.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') toast.success('Avisos do navegador ativados para novos pedidos.');
      else toast.info('Os avisos continuarão aparecendo nesta tela. Você pode permitir notificações nas configurações do navegador.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Não foi possível solicitar permissão para notificações.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bike className="h-6 w-6 text-primary" />Delivery</h1>
          <p className="text-muted-foreground">Acompanhe pedidos para entrega ou retirada, da produção ao pagamento.</p>
        </div>
        <Button type="button" onClick={openNewOrder}><Plus className="mr-2 h-4 w-4" />Novo pedido</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4" style={accentBorderStyle}><p className="text-sm text-muted-foreground">Pedidos</p><p className="text-2xl font-bold">{deliveryOrders.length}</p></Card>
        <Card className="p-4" style={accentBorderStyle}><p className="text-sm text-muted-foreground">Em produção</p><p className="text-2xl font-bold text-yellow-700">{inProduction}</p></Card>
        <Card className="p-4" style={accentBorderStyle}><p className="text-sm text-muted-foreground">Em rota / prontos para retirada</p><p className="text-2xl font-bold text-red-700">{dispatched}</p></Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4" style={accentBorderStyle}>
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" />Avisos de novos pedidos</h2>
          <p className="text-sm text-muted-foreground">
            Os avisos aparecem nesta tela enquanto o Delivery estiver aberto.
            {notificationPermission === 'granted' && ' Notificações do navegador estão ativadas.'}
            {notificationPermission === 'denied' && ' O navegador bloqueou notificações; altere essa permissão nas configurações.'}
          </p>
        </div>
        {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
          <Button type="button" variant="outline" onClick={() => void enableBrowserNotifications()}>
            Ativar notificações do navegador
          </Button>
        )}
      </Card>

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
            const isPickup = order.orderType === 'pickup';
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={isPickup ? 'border-blue-300 bg-blue-100 text-blue-900' : 'border-violet-300 bg-violet-100 text-violet-900'}>{isPickup ? 'RETIRADA' : 'ENTREGA'}</Badge>
                    <Badge variant="outline" className={statusInfo.className}>{isPickup && status === 'dispatched' ? 'PRONTO PARA RETIRADA' : statusInfo.label}</Badge>
                  </div>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {isPickup
                    ? <p className="font-semibold text-blue-800">Cliente irá retirar no estabelecimento</p>
                    : <p><span className="font-medium">Endereço de entrega:</span> {order.address || 'Não informado'}</p>}
                  {!isPickup && order.postalCode && <p><span className="font-medium">CEP:</span> {formatPostalCode(order.postalCode)}</p>}
                  <p><span className="font-medium">Telefone:</span> {order.phone || 'Não informado'}</p>
                  <p><span className="font-medium">CPF/CNPJ:</span> {order.document || 'Não informado'}</p>
                  <p><span className="font-medium">Pagamento:</span> {recordedPayment || plannedPayment || PAYMENT_OPTIONS.find((option) => option.value === order.paymentMethod)?.label || 'Não informado'}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  {order.items.map((item, index) => <div key={`${order.id}-${index}`} className="flex justify-between gap-2"><span>{item.quantity}× {item.name}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}
                  {!isPickup && <div className="mt-2 flex justify-between border-t pt-2 text-muted-foreground"><span>Taxa de entrega</span><span>{formatCurrency(order.deliveryFee ?? 0)}</span></div>}
                  <div className="mt-1 flex justify-between font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    try {
                      printDeliveryOrder(order, selectedEstablishment?.name ?? 'Pedido', driver?.name);
                    } catch (reason) {
                      toast.error(reason instanceof Error ? reason.message : 'Não foi possível imprimir o pedido.');
                    }
                  }}><Printer className="mr-2 h-4 w-4" />Imprimir pedido</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => openEditOrder(order)}><Pencil className="mr-2 h-4 w-4" />Editar pedido</Button>
                </div>
                {status !== 'finalized' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {status === 'production' && !isPickup ? (
                      <label className="flex min-w-48 flex-1 items-center gap-2 text-sm">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <select value={order.driverId ?? ''} onChange={(event) => updateOrderDriver(order.id, event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2">
                          <option value="">Sem entregador</option>
                          {drivers.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                        </select>
                      </label>
                    ) : status === 'production' ? <p className="text-sm text-muted-foreground">Pedido para retirada no estabelecimento</p>
                      : !isPickup ? <p className="text-sm text-muted-foreground">{driver ? `Entregador: ${driver.name}` : 'Entregador não informado'}</p> : null}
                    {status === 'production'
                      ? <Button type="button" onClick={() => dispatchOrder(order)}>{isPickup ? <Check className="mr-2 h-4 w-4" /> : <Truck className="mr-2 h-4 w-4" />}{isPickup ? 'Marcar pronto para retirada' : 'Despachar'}</Button>
                      : <Button type="button" onClick={() => openPaymentDialog(order)}><Check className="mr-2 h-4 w-4" />Finalizar pagamento</Button>}
                  </div>
                )}
                {status === 'finalized' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Pagamento registrado no caixa.</p>}
              </article>
            );
          })}
        </div>
      </Card>

      <AuditHistory events={register.auditEvents ?? []} title="Histórico de pedidos e caixa" />

      <Dialog open={newOrderOpen} onOpenChange={(open) => {
        setNewOrderOpen(open);
        if (!open) setEditingOrderId(null);
      }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" style={accentBorderStyle}>
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Editar pedido' : 'Novo pedido'}</DialogTitle>
            <DialogDescription>{editingOrder ? 'Corrija os dados do pedido.' : 'Preencha os dados e os itens. O pedido entrará em produção ao salvar.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-muted/10 p-4 sm:grid-cols-2" style={accentBorderStyle}>
              <fieldset disabled={!canEditOrderContents} className="contents">
                <legend className="sr-only">Modalidade do pedido</legend>
                <div className="sm:col-span-2">
                  <p className="mb-2 text-sm font-medium">Como o cliente receberá o pedido?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={orderType === 'delivery' ? 'default' : 'outline'} onClick={() => setOrderType('delivery')}>ENTREGA</Button>
                    <Button type="button" variant={orderType === 'pickup' ? 'default' : 'outline'} onClick={() => { setOrderType('pickup'); setDeliveryFee(0); }}>RETIRADA</Button>
                  </div>
                </div>
              </fieldset>
              <label className="space-y-1 text-sm font-medium">Nome<Input style={accentBorderStyle} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label className="space-y-1 text-sm font-medium">Telefone<Input style={accentBorderStyle} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              {orderType === 'delivery' && <label className="space-y-1 text-sm font-medium">CEP<Input style={accentBorderStyle} inputMode="numeric" autoComplete="postal-code" value={postalCode} onChange={(event) => void searchPostalCode(event.target.value)} placeholder="00000-000" /></label>}
              {orderType === 'delivery' && <label className="space-y-1 text-sm font-medium sm:col-span-2">Endereço de entrega<Input style={accentBorderStyle} autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Confira e informe número/complemento" /></label>}
              <label className="space-y-1 text-sm font-medium">CPF ou CNPJ<Input style={accentBorderStyle} inputMode="numeric" maxLength={14} value={document} onChange={(event) => setDocument(digitsOnly(event.target.value).slice(0, 14))} /></label>
              {orderType === 'delivery' && <label className="space-y-1 text-sm font-medium">Valor da entrega (R$)<CurrencyInput style={accentBorderStyle} value={deliveryFee} onValueChange={(value) => setDeliveryFee(value ?? 0)} disabled={!canEditOrderContents} /></label>}
              {lookingUpPostalCode && <p className="text-xs text-muted-foreground sm:col-span-2">Buscando endereço pelo CEP...</p>}
              <p className="text-sm text-muted-foreground sm:col-span-2">{editingOrder ? 'Se você alterar itens ou valores, a forma de pagamento será informada novamente ao finalizar no caixa.' : 'Ao salvar, informe uma ou mais formas de pagamento e os respectivos valores.'}</p>
            </div>
            {editingOrder && !canEditOrderContents && <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Este pedido já foi pago. Os dados financeiros, os itens e a modalidade não podem ser alterados para preservar o registro do caixa.</p>}
            {canEditOrderContents && !!menuItems.length && <div>
              <h3 className="mb-2 text-sm font-semibold">Adicionar do cardápio</h3>
              <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {menuItems.map((item) => (
                  <button type="button" key={item.id} onClick={() => addItem(item)} className="flex items-center justify-between gap-2 rounded-md border p-2 text-left text-sm hover:border-primary/50 hover:bg-primary/5" style={accentBorderStyle}>
                    <span className="truncate">{item.name}</span><span className="shrink-0 font-medium">{formatCurrency(item.price)} <Plus className="inline h-3 w-3" /></span>
                  </button>
                ))}
              </div>
            </div>}
            {canEditOrderContents && <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
              <Input style={accentBorderStyle} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Outro item" />
              <CurrencyInput style={accentBorderStyle} value={customPrice} onValueChange={(value) => setCustomPrice(value ?? 0)} placeholder="Valor (R$)" />
              <Button type="button" variant="outline" onClick={addCustomItem}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </div>}
            {cart.length > 0 && <div className="space-y-2 rounded-md border p-3" style={accentBorderStyle}>
              {cart.map((item) => (
                <div key={item.productId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.quantity}× {item.name}</span>
                  <span className="flex items-center gap-2 font-medium">
                    {formatCurrency(item.price * item.quantity)}
                    {canEditOrderContents && <button type="button" aria-label={`Remover ${item.name}`} onClick={() => setCart((current) => current.filter((entry) => entry.productId !== item.productId))}><X className="h-4 w-4 text-muted-foreground" /></button>}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 text-sm">
                <div className="flex justify-between"><span>Itens</span><span>{formatCurrency(subtotal)}</span></div>
                {orderType === 'delivery' && <div className="flex justify-between"><span>Taxa de entrega</span><span>{formatCurrency(Number.isFinite(fee) ? fee : 0)}</span></div>}
                <div className="mt-1 flex justify-between font-bold"><span>Total</span><span>{formatCurrency(subtotal + (orderType === 'delivery' && Number.isFinite(fee) ? fee : 0))}</span></div>
              </div>
            </div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewOrderOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={createOrder}>{editingOrder ? 'Salvar alterações' : 'Salvar pedido'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PaymentDialog
        open={newOrderPaymentOpen}
        total={Math.round((subtotal + (orderType === 'delivery' && Number.isFinite(fee) ? fee : 0)) * 100) / 100}
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
          setSettings((current) => ({ ...current, deliveryFee: value ?? 0 }));
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
