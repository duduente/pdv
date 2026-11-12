import { useEffect, useRef, useState } from 'react';
import { Ban, Bike, Bell, Check, ChevronDown, Clock3, Pencil, Plus, Printer, Truck, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useApp } from '@/store';
import { formatCurrency, menuItems as initialMenuItems } from '@/mockData';
import { PERSISTENT_STATE_ERROR_EVENT, syncPersistentState, usePersistentState } from '@/hooks/usePersistentState';
import { commitEmployeeRecords, type AtomicRecordOperation } from '@/lib/atomicEmployeeRecords';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { PaymentDialog } from '@/components/modules/PaymentDialog';
import { employeeSaleAttribution, type EmployeeRosterEntry } from '@/lib/employeeSettlement';
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
const STATUS_DETAILS: Record<DeliveryStatus, { label: string; textClassName: string; dotClassName: string }> = {
  production: { label: 'EM PRODUÇÃO', textClassName: 'text-amber-700 dark:text-amber-400', dotClassName: 'bg-amber-500' },
  dispatched: { label: 'DESPACHADO', textClassName: 'text-blue-700 dark:text-blue-400', dotClassName: 'bg-blue-600' },
  finalized: { label: 'FINALIZADO', textClassName: 'text-emerald-700 dark:text-emerald-400', dotClassName: 'bg-emerald-600' },
  cancelled: { label: 'CANCELADO', textClassName: 'text-red-700 dark:text-red-400', dotClassName: 'bg-red-600' },
};

const ORDER_TYPE_DETAILS = {
  pickup: { label: 'RETIRADA', textClassName: 'text-sky-700 dark:text-sky-400' },
  delivery: { label: 'ENTREGA', textClassName: 'text-violet-700 dark:text-violet-400' },
} as const;

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

function playOrderAlert(context: AudioContext) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.34);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

export function DeliveryModule() {
  const { selectedEstablishment } = useApp();
  const { user } = useAuth();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const ordersStorageKey = `menu-orders:${establishmentId}`;
  const [orders, setOrders, ordersLoaded, ordersSnapshot] = usePersistentState<MenuOrder[]>(ordersStorageKey, []);
  const [register, setRegister, registerLoaded, registerSnapshot] = usePersistentState<CashRegisterData>(`cash-register:${establishmentId}`, EMPTY_REGISTER);
  const [drivers] = usePersistentState<DeliveryDriver[]>(`delivery-drivers:${establishmentId}`, []);
  const [employeeRoster, , employeeRosterLoaded, rosterSnapshot] = usePersistentState<EmployeeRosterEntry[]>(
    `employee-roster:${establishmentId}`, [], { readOnly: true },
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [rosterError, setRosterError] = useState('');
  useEffect(() => {
    setRosterError('');
    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; message: string }>).detail;
      if (detail.key === `employee-roster:${establishmentId}`) setRosterError(detail.message);
    };
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, handleError);
    return () => window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, handleError);
  }, [establishmentId]);
  const [settings] = usePersistentState<DeliverySettings>(`delivery-settings:${establishmentId}`, DEFAULT_SETTINGS);
  const [menuItems] = usePersistentState<MenuItem[]>(
    `menu-items:${establishmentId}`,
    selectedEstablishment?.slug === 'burger-house' ? initialMenuItems : [],
  );
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderPaymentOpen, setNewOrderPaymentOpen] = useState(false);
  const [newOrderStep, setNewOrderStep] = useState<'customer' | 'products'>('customer');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [cancellationOrder, setCancellationOrder] = useState<MenuOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
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
  const orderAudioContext = useRef<AudioContext | null>(null);
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useEffect(() => {
    if (!registerLoaded || !ordersLoaded) return;
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
      if (data) syncPersistentState(ordersStorageKey, initialOrders);

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
  }, [establishmentId, ordersStorageKey, ordersLoaded, registerLoaded, setRegister, user]);

  useEffect(() => {
    if (!remoteNotificationsReady.current) return;
    const currentIds = new Set(orders.map((order) => order.id));
    const newOrders = seenOrderIds.current === null
      ? []
      : orders.filter((order) => !seenOrderIds.current?.has(order.id));
    seenOrderIds.current = currentIds;

    for (const order of newOrders) {
      toast.info(`Novo pedido recebido${order.customerName ? ` de ${order.customerName}` : ''}`);
      if (orderSoundEnabled && orderAudioContext.current) {
        const context = orderAudioContext.current;
        void context.resume().then(() => playOrderAlert(context)).catch(() => {
          setOrderSoundEnabled(false);
          toast.info('O som foi pausado pelo navegador. Ative novamente para ouvir novos pedidos.');
        });
      }
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
  }, [orderSoundEnabled, orders, setRegister]);

  useEffect(() => () => {
    const context = orderAudioContext.current;
    orderAudioContext.current = null;
    if (context && context.state !== 'closed') void context.close();
  }, []);

  if (!selectedEstablishment) return null;
  if (!registerLoaded || !ordersLoaded) return <p>Carregando pedidos e caixa...</p>;

  const accentBorderStyle = getAccentBorderStyle(selectedEstablishment.theme.accentColor);
  const deliveryOrders = orders
    .filter((order) => order.establishmentId === establishmentId)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
  const fee = deliveryFee;
  const editingOrder = orders.find((order) => order.id === editingOrderId);
  const canEditOrderContents = !editingOrder || (editingOrder.status !== 'paid' && !editingOrder.cashSaleId && editingOrder.deliveryStatus !== 'cancelled');
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

  const validateCustomer = () => {
    if (!customerName.trim() || !phone.trim() || !document.trim() || (orderType === 'delivery' && !address.trim())) {
      toast.error(orderType === 'delivery'
        ? 'Preencha nome, endereço, telefone e CPF/CNPJ do cliente'
        : 'Preencha nome, telefone e CPF/CNPJ do cliente');
      return false;
    }
    if (orderType === 'delivery' && (!Number.isFinite(fee) || fee < 0)) {
      toast.error('Informe um valor válido para a taxa de entrega');
      return false;
    }
    return true;
  };

  const createOrder = () => {
    if (!validateCustomer()) return;
    if (!cart.length) {
      toast.error('Adicione ao menos um item ao pedido');
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
    postalCodeLookupId.current += 1;
    setLookingUpPostalCode(false);
    setEditingOrderId(null);
    setNewOrderStep('customer');
    setOrderType('delivery');
    setCustomerName('');
    setAddress('');
    setPostalCode('');
    setPhone('');
    setDocument('');
    setDeliveryFee(settings.deliveryFee);
    setCart([]);
    setCustomName('');
    setCustomPrice(0);
    setNewOrderOpen(true);
  };

  const openEditOrder = (order: MenuOrder) => {
    if (order.deliveryStatus === 'cancelled') return;
    postalCodeLookupId.current += 1;
    setLookingUpPostalCode(false);
    setCustomName('');
    setCustomPrice(0);
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
    if (order.orderType !== 'pickup' && !drivers.some((driver) => driver.id === order.driverId && driver.active)) {
      toast.error('Selecione um entregador ativo antes de despachar o pedido.');
      return;
    }
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

  const confirmCancelOrder = () => {
    const reason = cancellationReason.trim();
    if (!cancellationOrder || !reason) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    if (cancellationOrder.status === 'paid' || cancellationOrder.cashSaleId) {
      toast.error('Não é possível cancelar um pedido já registrado no caixa.');
      return;
    }
    const cancelledAt = new Date().toISOString();
    setOrders((current) => current.map((order) => order.id === cancellationOrder.id
      ? { ...order, deliveryStatus: 'cancelled', cancelledAt, cancellationReason: reason }
      : order));
    const event = createAuditEvent(user, {
      entityType: 'order',
      entityId: cancellationOrder.id,
      action: 'status_changed',
      occurredAt: cancelledAt,
      summary: `Pedido cancelado. Motivo: ${reason}`,
    });
    setRegister((current) => appendAuditEvent(current, event));
    setCancellationOrder(null);
    setCancellationReason('');
    toast.success('Pedido cancelado.');
  };

  const openPaymentDialog = (order: MenuOrder) => {
    if (selectedEstablishment?.modules.employees && (!employeeRosterLoaded || rosterError)) {
      toast.error(rosterError ? `Não foi possível carregar funcionários: ${rosterError}` : 'Aguarde o carregamento dos funcionários.');
      return;
    }
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
    setSelectedEmployeeId('');
    setPaymentOrder(order);
  };

  const finalizePayment = async (splits: PaymentSplit[], change: number) => {
    if (!paymentOrder) return false;
    let attribution: ReturnType<typeof employeeSaleAttribution>;
    try {
      attribution = employeeSaleAttribution(selectedEmployeeId, employeeRoster);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a comissão.');
      return false;
    }
    const order = orders.find((entry) => entry.id === paymentOrder.id);
    if (!order || order.deliveryStatus !== 'dispatched' || order.status === 'paid' || order.cashSaleId
      || register.sales.some((sale) => sale.origin === 'delivery' && sale.sourceRecordId === order.id && sale.status !== 'cancelled')) {
      toast.error('Este pedido não está disponível para pagamento. Atualize os dados.');
      return false;
    }
    if (JSON.stringify(order) !== JSON.stringify(paymentOrder)) {
      toast.error('O pedido mudou. Abra o pagamento novamente para conferir os valores.');
      setPaymentOrder(null);
      return false;
    }
    const session = register.sessions.find((entry) => entry.id === register.activeSessionId && !entry.closedAt);
    if (!session) {
      toast.error('Abra uma sessão no caixa antes de finalizar o pagamento');
      setPaymentOrder(null);
      return false;
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
      ...attribution,
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
    const updatedRegister = appendAuditEvent(
      appendAuditEvent({ ...register, sales: [...register.sales, sale] }, saleEvent),
      orderEvent,
    );
    const updatedOrders: MenuOrder[] = orders.map((entry) => entry.id === order.id
      ? { ...entry, status: 'paid', deliveryStatus: 'finalized', cashSaleId: saleId }
      : entry);
    if (supabase && user && !user.isDemo) {
      const operations: AtomicRecordOperation[] = [
        { snapshot: { ...registerSnapshot, value: register }, value: updatedRegister, write: true },
        { snapshot: { ...ordersSnapshot, value: orders }, value: updatedOrders, write: true },
      ];
      if (attribution.employeeId) operations.push({ snapshot: { ...rosterSnapshot, value: employeeRoster }, write: false });
      try {
        await commitEmployeeRecords(establishmentId, operations);
        for (const operation of operations) if (operation.write) syncPersistentState(operation.snapshot.key, operation.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao salvar o pagamento.';
        window.dispatchEvent(new CustomEvent(PERSISTENT_STATE_ERROR_EVENT, {
          detail: { key: ordersStorageKey, message },
        }));
        return false;
      }
    } else {
      setRegister(updatedRegister);
      setOrders(updatedOrders);
    }
    setPaymentOrder(null);
    toast.success('Pagamento finalizado e registrado no caixa');
    return true;
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

  const enableOrderSound = async () => {
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      toast.error('Este navegador não oferece avisos sonoros.');
      return;
    }
    try {
      const context = orderAudioContext.current ?? new AudioContextConstructor();
      orderAudioContext.current = context;
      await context.resume();
      playOrderAlert(context);
      setOrderSoundEnabled(true);
      toast.success('Aviso sonoro ativado para novos pedidos.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Não foi possível ativar o som dos pedidos.');
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
            Os avisos aparecem nesta tela enquanto o Delivery estiver aberto. Ative o som para ouvir um alerta a cada novo pedido.
            {notificationPermission === 'granted' && ' Notificações do navegador estão ativadas.'}
            {notificationPermission === 'denied' && ' O navegador bloqueou notificações; altere essa permissão nas configurações.'}
          </p>
        </div>
        <Button
          type="button"
          variant={orderSoundEnabled ? 'secondary' : 'outline'}
          aria-pressed={orderSoundEnabled}
          onClick={() => orderSoundEnabled ? setOrderSoundEnabled(false) : void enableOrderSound()}
        >
          {orderSoundEnabled ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
          {orderSoundEnabled ? 'Desativar som' : 'Ativar som dos pedidos'}
        </Button>
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
            const orderTypeInfo = ORDER_TYPE_DETAILS[isPickup ? 'pickup' : 'delivery'];
            const driver = drivers.find((entry) => entry.id === order.driverId);
            const hasActiveDriver = drivers.some((entry) => entry.id === order.driverId && entry.active);
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
            const isExpanded = expandedOrderId === order.id;
            const canCancel = status !== 'cancelled' && status !== 'finalized' && order.status !== 'paid';
            const toggleExpanded = () => setExpandedOrderId((current) => current === order.id ? null : order.id);
            const startCancellation = () => {
              setCancellationReason('');
              setCancellationOrder(order);
            };
            return (
              <article key={order.id} className="overflow-hidden rounded-lg border" style={accentBorderStyle}>
                <div className="flex items-center gap-2 p-2 sm:p-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md p-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={isExpanded}
                    aria-controls={`delivery-order-details-${order.id}`}
                    onClick={toggleExpanded}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{order.customerName || 'Pedido do cardápio'}</span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusInfo.textClassName}`}>
                          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusInfo.dotClassName}`} />
                          {isPickup && status === 'dispatched' ? 'PRONTO PARA RETIRADA' : statusInfo.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">Pedido {order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleString('pt-BR')}{driver ? ` · ${driver.name}` : ''}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={`text-sm font-bold ${orderTypeInfo.textClassName}`}>{orderTypeInfo.label}</span>
                      <span className="whitespace-nowrap text-sm font-semibold">{formatCurrency(total)}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {!isPickup && status === 'production' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={hasActiveDriver ? 'Despachar pedido' : 'Abra os detalhes e selecione um entregador'}
                      aria-label={`Despachar pedido de ${order.customerName || 'cliente'}`}
                      disabled={!hasActiveDriver}
                      onClick={() => dispatchOrder(order)}
                    >
                      <Truck className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {isExpanded && (
                  <div id={`delivery-order-details-${order.id}`} className="space-y-3 border-t p-3 sm:p-4">
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
                    {status !== 'finalized' && status !== 'cancelled' && !isPickup && (
                      <label className="flex min-w-48 items-center gap-2 text-sm">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span className="shrink-0 font-medium">Entregador</span>
                        <select value={order.driverId ?? ''} onChange={(event) => updateOrderDriver(order.id, event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2">
                          <option value="">Selecione entregador</option>
                          {drivers.filter((entry) => entry.active || entry.id === order.driverId).map((entry) => <option key={entry.id} value={entry.id} disabled={!entry.active}>{entry.name}{entry.active ? '' : ' (inativo)'}</option>)}
                        </select>
                      </label>
                    )}
                    {status === 'cancelled' && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">Motivo do cancelamento: {order.cancellationReason || 'Não informado'}</p>}
                    {status === 'finalized' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Pagamento registrado no caixa.</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <div className="flex flex-wrap gap-2">
                        {canCancel && (
                          <>
                            <Button type="button" variant="ghost" size="icon" title="Editar pedido" aria-label={`Editar pedido de ${order.customerName || 'cliente'}`} onClick={() => openEditOrder(order)}><Pencil className="h-4 w-4" /></Button>
                            <Button type="button" variant="ghost" size="icon" title="Cancelar pedido" aria-label={`Cancelar pedido de ${order.customerName || 'cliente'}`} onClick={startCancellation}><Ban className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )}
                        {status === 'production' && !isPickup && <Button type="button" variant="ghost" size="icon" title="Despachar pedido" aria-label={`Despachar pedido de ${order.customerName || 'cliente'}`} disabled={!hasActiveDriver} onClick={() => dispatchOrder(order)}><Truck className="h-4 w-4" /></Button>}
                        {status === 'production' && isPickup && <Button type="button" variant="ghost" size="icon" title="Marcar pronto para retirada" aria-label="Marcar pedido pronto para retirada" onClick={() => dispatchOrder(order)}><Check className="h-4 w-4" /></Button>}
                        {status === 'dispatched' && <Button type="button" variant="ghost" size="icon" title="Finalizar pagamento" aria-label="Finalizar pagamento" onClick={() => openPaymentDialog(order)}><Check className="h-4 w-4" /></Button>}
                      </div>
                      <Button type="button" variant="outline" size="icon" title="Imprimir pedido" aria-label={`Imprimir pedido de ${order.customerName || 'cliente'}`} onClick={() => {
                        try {
                          printDeliveryOrder(order, selectedEstablishment?.name ?? 'Pedido', driver?.name);
                        } catch (reason) {
                          toast.error(reason instanceof Error ? reason.message : 'Não foi possível imprimir o pedido.');
                        }
                      }}><Printer className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </Card>

      <AuditHistory events={register.auditEvents ?? []} title="Histórico de pedidos e caixa" />

      <Dialog open={newOrderOpen} onOpenChange={(open) => {
        setNewOrderOpen(open);
        if (!open) {
          postalCodeLookupId.current += 1;
          setLookingUpPostalCode(false);
          setEditingOrderId(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" style={accentBorderStyle}>
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Editar pedido' : 'Novo pedido'}</DialogTitle>
            <DialogDescription>{editingOrder ? 'Corrija os dados do pedido.' : newOrderStep === 'customer' ? 'Etapa 1 de 3 · Dados do cliente' : 'Etapa 2 de 3 · Produtos do pedido'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(editingOrder || newOrderStep === 'customer') && <>
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
              {editingOrder && <p className="text-sm text-muted-foreground sm:col-span-2">Se você alterar itens ou valores, a forma de pagamento será informada novamente ao finalizar no caixa.</p>}
            </div>
            {editingOrder && !canEditOrderContents && <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Este pedido já foi pago. Os dados financeiros, os itens e a modalidade não podem ser alterados para preservar o registro do caixa.</p>}
            </>}
            {(editingOrder || newOrderStep === 'products') && <>
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
            </>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                postalCodeLookupId.current += 1;
                setLookingUpPostalCode(false);
                setNewOrderOpen(false);
                setEditingOrderId(null);
              }}>Cancelar</Button>
              {editingOrder ? <Button type="button" onClick={createOrder}>Salvar alterações</Button> : newOrderStep === 'customer' ? (
                <Button type="button" onClick={() => { if (validateCustomer()) setNewOrderStep('products'); }}>Próximo: produtos</Button>
              ) : <>
                <Button type="button" variant="outline" onClick={() => setNewOrderStep('customer')}>Voltar</Button>
                <Button type="button" onClick={createOrder}>Próximo: pagamento</Button>
              </>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(cancellationOrder)} onOpenChange={(open) => {
        if (!open) {
          setCancellationOrder(null);
          setCancellationReason('');
        }
      }}>
        <DialogContent className="max-w-lg" style={accentBorderStyle}>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>Informe o motivo. O pedido ficará marcado como cancelado no histórico e no acompanhamento do cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="delivery-cancellation-reason" className="text-sm font-medium">Motivo do cancelamento</label>
            <Textarea
              id="delivery-cancellation-reason"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder="Descreva por que este pedido está sendo cancelado"
              maxLength={500}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancellationOrder(null)}>Voltar</Button>
            <Button type="button" variant="destructive" onClick={confirmCancelOrder} disabled={!cancellationReason.trim()}>
              <Ban className="mr-2 h-4 w-4" />Confirmar cancelamento
            </Button>
          </DialogFooter>
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
        employeeSelection={selectedEstablishment?.modules.employees ? {
          employees: employeeRoster,
          selectedId: selectedEmployeeId,
          onChange: setSelectedEmployeeId,
        } : undefined}
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
