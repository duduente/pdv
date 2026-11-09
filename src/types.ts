export type ModuleKey = 'agendamento' | 'cardapio' | 'pdv' | 'estoque' | 'comandas' | 'delivery';
export type AppPermission =
  | 'dashboard'
  | 'agendamento'
  | 'cardapio'
  | 'estoque'
  | 'comandas'
  | 'delivery'
  | 'pdv-sales'
  | 'pdv-movements'
  | 'pdv-reports'
  | 'pdv-sessions'
  | 'store-settings'
  | 'manage-users';
export type StorePermission = AppPermission | '*';

export const STORE_PERMISSIONS: AppPermission[] = [
  'dashboard',
  'agendamento',
  'cardapio',
  'estoque',
  'comandas',
  'delivery',
  'pdv-sales',
  'pdv-movements',
  'pdv-reports',
  'pdv-sessions',
  'store-settings',
  'manage-users',
];

export type ViewProfile =
  | 'super-admin'
  | 'barbearia-estilo'
  | 'burger-house'
  | 'mercadinho-central'
  | 'loja-completa'
  | (string & {});

export type EstablishmentTemplate = 'barbershop' | 'restaurant' | 'grocery' | 'complete' | 'custom';

export interface Establishment {
  id: string;
  slug: string;
  name: string;
  owner: string;
  email: string;
  plan: string;
  monthlyRevenue: number;
  status: 'active' | 'inactive';
  modules: Record<ModuleKey, boolean>;
  theme: EstablishmentTheme;
  whatsapp: string;
  template?: EstablishmentTemplate;
}

export interface EstablishmentTheme {
  name: string;
  logo: string;
  accentColor: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
}

export interface Professional {
  id: string;
  name: string;
  role: string;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type AppointmentPaymentStatus = 'unpaid' | 'paid';

export interface Appointment {
  id: string;
  clientName: string;
  service: string;
  professional: string;
  date: string;
  time: string;
  whatsapp: string;
  status?: AppointmentStatus;
  paymentStatus?: AppointmentPaymentStatus;
}

export interface WorkingHours {
  day: string;
  enabled: boolean;
  start: string;
  end: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
}

export interface MenuCategory {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  unit: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  sourceRecordId?: string;
  professional?: string;
}

export type PaymentMethod = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outro';
export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}
export type SaleOrigin = 'agendamento' | 'cardapio' | 'delivery' | 'produto_estoque' | 'comanda' | 'avulso';
export type DeliveryStatus = 'production' | 'dispatched' | 'finalized';

export interface DeliveryDriver {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export interface DeliverySettings {
  deliveryFee: number;
}

export interface CashSale {
  id: string;
  establishmentId: string;
  sessionId: string;
  createdAt: string;
  items: SaleItem[];
  total: number;
  origin: SaleOrigin;
  sourceRecordId?: string;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  amountReceived: number;
  change: number;
  status?: 'paid' | 'cancelled';
  cancelledAt?: string;
  subtotal?: number;
  serviceCharge?: number;
  commandId?: string;
  commandNumber?: number;
}

export interface Command {
  id: string;
  establishmentId: string;
  number: number;
  createdAt: string;
  items: SaleItem[];
  total: number;
  status: 'open' | 'paid';
}

export interface MenuOrder {
  id: string;
  establishmentId: string;
  createdAt: string;
  items: SaleItem[];
  total: number;
  status: 'pending' | 'paid';
  channel?: 'website' | 'delivery';
  customerName?: string;
  address?: string;
  postalCode?: string;
  phone?: string;
  document?: string;
  deliveryFee?: number;
  paymentMethod?: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  deliveryStatus?: DeliveryStatus;
  driverId?: string;
  cashSaleId?: string;
}

export interface CashMovement {
  id: string;
  establishmentId: string;
  sessionId: string;
  createdAt: string;
  type: 'supply' | 'withdrawal';
  amount: number;
  note: string;
}

export interface CashSession {
  id: string;
  establishmentId: string;
  openedAt: string;
  openingAmount: number;
  closedAt?: string;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
}

export interface CashRegisterData {
  activeSessionId: string | null;
  sessions: CashSession[];
  sales: CashSale[];
  movements: CashMovement[];
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  notes?: string;
}
