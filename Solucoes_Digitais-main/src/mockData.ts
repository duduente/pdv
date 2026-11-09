import type {
  Establishment,
  Service,
  Professional,
  Appointment,
  WorkingHours,
  MenuItem,
  MenuCategory,
  Product,
} from './types';

export const MODULE_LABELS: Record<string, string> = {
  agendamento: 'Agendamento Online',
  cardapio: 'Cardápio Digital',
  pdv: 'Frente de Caixa (PDV)',
  estoque: 'Controle de Estoque & Clientes',
  comandas: 'Comandas',
  delivery: 'Delivery',
};

export const MODULE_ICONS: Record<string, string> = {
  agendamento: 'CalendarClock',
  cardapio: 'UtensilsCrossed',
  pdv: 'Calculator',
  estoque: 'Package',
  delivery: 'Bike',
};

export const establishments: Establishment[] = [
  {
    id: '1',
    slug: 'barbearia-estilo',
    name: 'Barbearia Estilo',
    owner: 'Carlos Mendes',
    email: 'carlos@barbeariaestilo.com',
    plan: 'Plano Essencial',
    monthlyRevenue: 99,
    status: 'active',
    modules: {
      agendamento: true,
      cardapio: false,
      pdv: true,
      estoque: false,
      comandas: false,
      delivery: false,
    },
    theme: {
      name: 'Barbearia Estilo',
      logo: '',
      accentColor: '#1e3a5f',
    },
    whatsapp: '5511987654321',
  },
  {
    id: '2',
    slug: 'burger-house',
    name: 'Burger House',
    owner: 'Ana Ribeiro',
    email: 'ana@burgerhouse.com',
    plan: 'Plano Profissional',
    monthlyRevenue: 199,
    status: 'active',
    modules: {
      agendamento: false,
      cardapio: true,
      pdv: true,
      estoque: false,
      comandas: true,
      delivery: true,
    },
    theme: {
      name: 'Burger House',
      logo: '',
      accentColor: '#d97706',
    },
    whatsapp: '5511987654322',
  },
  {
    id: '3',
    slug: 'mercadinho-central',
    name: 'Mercadinho Central',
    owner: 'José Pereira',
    email: 'jose@mercadinhocentral.com',
    plan: 'Plano Profissional',
    monthlyRevenue: 199,
    status: 'active',
    modules: {
      agendamento: false,
      cardapio: false,
      pdv: true,
      estoque: true,
      comandas: false,
      delivery: false,
    },
    theme: {
      name: 'Mercadinho Central',
      logo: '',
      accentColor: '#059669',
    },
    whatsapp: '5511987654323',
  },
  {
    id: '4',
    slug: 'loja-completa',
    name: 'Loja Completa',
    owner: 'Mariana Costa',
    email: 'mariana@lojacompleta.com',
    plan: 'Plano Premium',
    monthlyRevenue: 299,
    status: 'active',
    modules: {
      agendamento: true,
      cardapio: true,
      pdv: true,
      estoque: true,
      comandas: true,
      delivery: true,
    },
    theme: {
      name: 'Loja Completa',
      logo: '',
      accentColor: '#4f46e5',
    },
    whatsapp: '5511987654324',
  },
];

export const workingHours: WorkingHours[] = [
  { day: 'Segunda', enabled: true, start: '09:00', end: '18:00' },
  { day: 'Terça', enabled: true, start: '09:00', end: '18:00' },
  { day: 'Quarta', enabled: true, start: '09:00', end: '18:00' },
  { day: 'Quinta', enabled: true, start: '09:00', end: '18:00' },
  { day: 'Sexta', enabled: true, start: '09:00', end: '20:00' },
  { day: 'Sábado', enabled: true, start: '08:00', end: '16:00' },
  { day: 'Domingo', enabled: false, start: '09:00', end: '14:00' },
];

export const services: Service[] = [
  { id: 's1', name: 'Corte de Cabelo', price: 45, duration: 30 },
  { id: 's2', name: 'Barba', price: 35, duration: 20 },
  { id: 's3', name: 'Corte + Barba', price: 70, duration: 50 },
  { id: 's4', name: 'Sobrancelha', price: 20, duration: 15 },
  { id: 's5', name: 'Pigmentação', price: 60, duration: 40 },
];

export const professionals: Professional[] = [
  { id: 'p1', name: 'Carlos Mendes', role: 'Barbeiro Sênior' },
  { id: 'p2', name: 'Ricardo Alves', role: 'Barbeiro' },
  { id: 'p3', name: 'Pedro Silva', role: 'Barbeiro Júnior' },
];

export const appointments: Appointment[] = [
  { id: 'a1', clientName: 'João Oliveira', service: 'Corte + Barba', professional: 'Carlos Mendes', date: '2026-10-01', time: '09:00', whatsapp: '5511900000001' },
  { id: 'a2', clientName: 'Felipe Souza', service: 'Corte de Cabelo', professional: 'Ricardo Alves', date: '2026-10-01', time: '10:30', whatsapp: '5511900000002' },
  { id: 'a3', clientName: 'Bruno Lima', service: 'Barba', professional: 'Pedro Silva', date: '2026-10-01', time: '14:00', whatsapp: '5511900000003' },
  { id: 'a4', clientName: 'Marcos Dias', service: 'Corte + Barba', professional: 'Carlos Mendes', date: '2026-10-02', time: '11:00', whatsapp: '5511900000004' },
  { id: 'a5', clientName: 'Lucas Ferreira', service: 'Pigmentação', professional: 'Ricardo Alves', date: '2026-10-03', time: '15:00', whatsapp: '5511900000005' },
];

export const menuCategories: MenuCategory[] = [
  { id: 'c1', name: 'Burgers' },
  { id: 'c2', name: 'Acompanhamentos' },
  { id: 'c3', name: 'Bebidas' },
  { id: 'c4', name: 'Sobremesas' },
];

export const menuItems: MenuItem[] = [
  { id: 'm1', name: 'Cheeseburger Clássico', description: 'Pão brioche, blend 160g, cheddar, alface, tomate e molho da casa', price: 28.9, category: 'Burgers', image: 'https://images.pexels.com/photos/3727243/pexels-photo-3727243.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm2', name: 'Bacon Cheeseburger', description: 'Pão, blend 180g, bacon crocante, cheddar duplo e cebola caramelizada', price: 34.9, category: 'Burgers', image: 'https://images.pexels.com/photos/8305725/pexels-photo-8305725.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm3', name: 'Double Cheeseburger', description: 'Dois blends 120g, cheddar, picles e molho especial', price: 39.9, category: 'Burgers', image: 'https://images.pexels.com/photos/15476368/pexels-photo-15476368.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm4', name: 'Burger Gourmet Especial', description: 'Pão australiano, blend 200g, gruyère, rúcula e geleia de bacon', price: 45.9, category: 'Burgers', image: 'https://images.pexels.com/photos/15146667/pexels-photo-15146667.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm5', name: 'Combo Bacon Duplo', description: 'Dois burgers com bacon, cheddar e molho barbecue', price: 52.9, category: 'Burgers', image: 'https://images.pexels.com/photos/8305748/pexels-photo-8305748.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm6', name: 'Batata Frita Crocante', description: 'Porção generosa de batatas fritas com sal e ervas', price: 16.9, category: 'Acompanhamentos', image: 'https://images.pexels.com/photos/115740/pexels-photo-115740.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm7', name: 'Batata com Cheddar e Bacon', description: 'Batatas cobertas com cheddar cremoso e bacon', price: 24.9, category: 'Acompanhamentos', image: 'https://images.pexels.com/photos/7479383/pexels-photo-7479383.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm8', name: 'Refrigerante Lata', description: '350ml - Coca, Guaraná, Fanta ou Sprite', price: 7.0, category: 'Bebidas', image: 'https://images.pexels.com/photos/5860659/pexels-photo-5860659.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm9', name: 'Refrigerante 2L', description: 'Garrafa 2 litros - Coca ou Guaraná', price: 14.0, category: 'Bebidas', image: 'https://images.pexels.com/photos/6920721/pexels-photo-6920721.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm10', name: 'Milkshake de Chocolate', description: 'Cremoso milkshake com calda e chantilly', price: 18.9, category: 'Sobremesas', image: 'https://images.pexels.com/photos/32469289/pexels-photo-32469289.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'm11', name: 'Milkshake Mix', description: 'Dois sabores à escolha, com chantilly e cobertura', price: 22.9, category: 'Sobremesas', image: 'https://images.pexels.com/photos/6463666/pexels-photo-6463666.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
];

export const products: Product[] = [
  { id: 'pr1', name: 'Arroz 5kg', price: 32.9, stock: 48, category: 'Mercearia', unit: 'pct' },
  { id: 'pr2', name: 'Feijão 1kg', price: 8.9, stock: 30, category: 'Mercearia', unit: 'pct' },
  { id: 'pr3', name: 'Leite Integral 1L', price: 6.5, stock: 60, category: 'Laticínios', unit: 'un' },
  { id: 'pr4', name: 'Pão Francês', price: 0.9, stock: 120, category: 'Padaria', unit: 'un' },
  { id: 'pr5', name: 'Refrigerante 2L', price: 14.0, stock: 24, category: 'Bebidas', unit: 'un' },
  { id: 'pr6', name: 'Detergente', price: 3.5, stock: 40, category: 'Limpeza', unit: 'un' },
  { id: 'pr7', name: 'Sabão em Pó 1kg', price: 15.9, stock: 18, category: 'Limpeza', unit: 'un' },
  { id: 'pr8', name: 'Macarrão 500g', price: 4.5, stock: 80, category: 'Mercearia', unit: 'pct' },
  { id: 'pr9', name: 'Óleo de Soja 900ml', price: 9.9, stock: 35, category: 'Mercearia', unit: 'un' },
  { id: 'pr10', name: 'Café 500g', price: 18.9, stock: 22, category: 'Mercearia', unit: 'pct' },
];

export const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30',
];

export const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
