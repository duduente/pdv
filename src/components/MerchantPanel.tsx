import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock, UtensilsCrossed, Calculator, Package,
  Settings, Home, ExternalLink, Copy, Check,
  Upload, ClipboardList, Bike, WalletCards, Users, BarChart3,
} from 'lucide-react';
import { useApp } from '@/store';
import { useAuth } from '@/auth/AuthContext';
import { UserMenu } from '@/components/UserMenu';
import { supabase } from '@/lib/supabase';
import { appointments as initialAppointments, MODULE_LABELS, formatCurrency } from '@/mockData';
import { PERSISTENT_STATE_ERROR_EVENT, usePersistentState } from '@/hooks/usePersistentState';
import { isAtomicEmployeeRecord } from '@/lib/atomicEmployeeRecords';
import type { Appointment, CashRegisterData, Establishment, ModuleKey } from '@/types';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AppointmentModule, AppointmentSettings, ProfessionalRevenueTab } from './modules/AppointmentModule';
import { MenuModule } from './modules/MenuModule';
import { CashRegisterModule } from './modules/CashRegisterModule';
import { InventoryModule } from './modules/InventoryModule';
import { CommandsModule } from './modules/CommandsModule';
import { DeliveryModule, DeliveryStoreSettings } from './modules/DeliveryModule';
import { StoreUserManagement } from './StoreUserManagement';
import { hasStorePermission } from '@/auth/permissions';
import type { AppPermission } from '@/types';
import { SupportChat } from '@/components/SupportChat';
import { FinanceModule } from '@/components/modules/FinanceModule';
import { EmployeesModule } from '@/components/modules/EmployeesModule';
import { OperationalDashboard } from '@/components/modules/OperationalDashboard';
import { ChartTypeSelector } from '@/components/ChartTypeSelector';
import type { ChartType } from '@/components/ChartTypeSelector';

const MODULE_ICONS: Record<ModuleKey, typeof CalendarClock> = {
  agendamento: CalendarClock,
  cardapio: UtensilsCrossed,
  pdv: Calculator,
  estoque: Package,
  comandas: ClipboardList,
  delivery: Bike,
  finance: WalletCards,
  employees: Users,
};

const EMPTY_CASH_REGISTER: CashRegisterData = {
  activeSessionId: null,
  sessions: [],
  sales: [],
  movements: [],
};

type MerchantView = 'dashboard' | 'settings' | 'reports' | ModuleKey;
type DashboardPeriod = 'day' | 'week' | 'month' | 'year';

const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  day: 'Diário',
  week: 'Semanal',
  month: 'Mensal',
  year: 'Anual',
};

export function MerchantPanel() {
  const { selectedEstablishment, viewPublicPage, updateEstablishment } = useApp();
  const { user } = useAuth();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [view, setView] = useState<MerchantView>('dashboard');
  const [storageFailure, setStorageFailure] = useState('');
  useEffect(() => {
    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; message: string }>).detail;
      if (detail && isAtomicEmployeeRecord(detail.key) && detail.key.endsWith(`:${establishmentId}`)) {
        setStorageFailure(detail.message);
      }
    };
    window.addEventListener(PERSISTENT_STATE_ERROR_EVENT, handleError);
    return () => window.removeEventListener(PERSISTENT_STATE_ERROR_EVENT, handleError);
  }, [establishmentId]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEstablishment) return;
    const establishment = selectedEstablishment;
    const canAccessModule = (module: ModuleKey) => module === 'pdv'
      ? (['pdv-sales', 'pdv-movements', 'pdv-sessions'] as AppPermission[])
        .some((permission) => hasStorePermission(user, establishment.id, permission))
      : hasStorePermission(user, establishment.id, module === 'employees' ? 'finance' : module);
    const modules = (Object.keys(establishment.modules) as ModuleKey[])
      .filter((module) => establishment.modules[module] && canAccessModule(module));
    const settingsAllowed = hasStorePermission(user, establishment.id, 'store-settings')
      || hasStorePermission(user, establishment.id, 'manage-users')
      || (establishment.modules.delivery && hasStorePermission(user, establishment.id, 'delivery'))
      || (establishment.modules.agendamento && hasStorePermission(user, establishment.id, 'agendamento'));
    const allowedViews: MerchantView[] = [
      ...(hasStorePermission(user, establishment.id, 'dashboard') ? ['dashboard' as const] : []),
      ...(settingsAllowed ? ['settings' as const] : []),
      ...((establishment.modules.pdv && hasStorePermission(user, establishment.id, 'pdv-reports'))
        || (establishment.modules.agendamento && hasStorePermission(user, establishment.id, 'agendamento')) ? ['reports' as const] : []),
      ...modules,
    ];
    setView((current) => allowedViews.includes(current) ? current : allowedViews[0] ?? 'dashboard');
  }, [selectedEstablishment, user]);

  if (!selectedEstablishment) return null;
  const est = selectedEstablishment;
  const canAccessModule = (module: ModuleKey) => module === 'pdv'
    ? (['pdv-sales', 'pdv-movements', 'pdv-sessions'] as AppPermission[])
      .some((permission) => hasStorePermission(user, est.id, permission))
    : hasStorePermission(user, est.id, module === 'employees' ? 'finance' : module);
  const activeModules = (Object.keys(est.modules) as ModuleKey[]).filter((module) => est.modules[module] && canAccessModule(module));
  const canViewDashboard = hasStorePermission(user, est.id, 'dashboard');
  const canViewSettings = hasStorePermission(user, est.id, 'store-settings')
    || hasStorePermission(user, est.id, 'manage-users')
    || (est.modules.delivery && hasStorePermission(user, est.id, 'delivery'))
    || (est.modules.agendamento && hasStorePermission(user, est.id, 'agendamento'));
  const canViewFinance = est.modules.finance && hasStorePermission(user, est.id, 'finance');
  const canViewCashReports = hasStorePermission(user, est.id, 'pdv-reports');
  const canViewCash = canAccessModule('pdv');
  const canViewReports = (est.modules.pdv && canViewCashReports) || (est.modules.agendamento && canAccessModule('agendamento'));
  const copyPublicLink = (type: 'agendar' | 'cardapio') => {
    const link = `${type}/${est.slug}`;
    navigator.clipboard?.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
    toast.success('Link copiado!');
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
      {storageFailure && <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
        <Card className="max-w-lg space-y-3 p-6">
          <h2 className="text-lg font-semibold">Não foi possível confirmar os dados</h2>
          <p>Uma alteração pode não ter sido salva. {storageFailure}</p>
          <p>Recarregue e confira os dados antes de repetir qualquer operação.</p>
          <Button type="button" onClick={() => window.location.reload()}>Recarregar página</Button>
        </Card>
      </div>}
      {/* Sidebar */}
      <aside className="flex h-full min-h-0 w-16 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 md:w-64">
        <div className="border-b border-border/70 p-3 md:p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground"
            >
              {est.theme.logo ? <img src={est.theme.logo} alt={`Logo de ${est.name}`} className="h-full w-full rounded-lg object-cover" /> : est.name.charAt(0)}
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="font-semibold text-sm truncate">{est.name}</p>
              <p className="text-xs text-muted-foreground truncate">{est.plan}</p>
            </div>
          </div>
        </div>

        <nav className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2 md:p-3">
          {canViewDashboard && <SidebarItem
            icon={Home}
            label="Dashboard"
            active={view === 'dashboard'}
            onClick={() => setView('dashboard')}
          />}
          {canViewReports && <SidebarItem icon={BarChart3} label="Relatórios" active={view === 'reports'} onClick={() => setView('reports')} />}
          {canViewSettings && <SidebarItem
            icon={Settings}
            label="Configurações da loja"
            active={view === 'settings'}
            onClick={() => setView('settings')}
          />}
          <div className="my-2 h-px bg-border" />
          <p className="mb-1 hidden px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:block">
            Módulos Ativos
          </p>
          {activeModules.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nenhum módulo ativo ou permitido para este usuário.
            </p>
          )}
          {activeModules.map((mod) => (
            <SidebarItem
              key={mod}
              icon={MODULE_ICONS[mod]}
              label={MODULE_LABELS[mod]}
              active={view === mod}
              onClick={() => setView(mod)}
            />
          ))}
        </nav>

        <div className="hidden space-y-1 border-t border-border/70 p-3 md:block">
          {est.modules.agendamento && canAccessModule('agendamento') && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => viewPublicPage(est.slug, 'booking')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver página de agendamento
            </Button>
          )}
          {est.modules.cardapio && canAccessModule('cardapio') && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => viewPublicPage(est.slug, 'menu')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver cardápio digital
            </Button>
          )}
        </div>
        <div className="shrink-0 border-t border-border/70 p-1.5 md:p-3"><UserMenu /></div>
      </aside>

      {/* Main content */}
      <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 animate-fade-in">
          {view === 'dashboard' && canViewDashboard && <DashboardView />}
          {view === 'reports' && canViewReports && <div className="space-y-6">
            <div><h1 className="text-2xl font-bold">Relatórios</h1><p className="text-muted-foreground">Consulte os resultados por assunto.</p></div>
            <Tabs key={est.id} defaultValue={est.modules.pdv && canViewCashReports ? 'cash' : 'professionals'} className="space-y-4">
              <TabsList className="flex h-auto flex-wrap justify-start" aria-label="Categorias de relatórios">
                {est.modules.pdv && canViewCashReports && <TabsTrigger value="cash">Vendas e despesas</TabsTrigger>}
                {est.modules.pdv && canViewCashReports && <TabsTrigger value="movements">Movimentações do caixa</TabsTrigger>}
                {est.modules.agendamento && canAccessModule('agendamento') && <TabsTrigger value="professionals">Profissionais</TabsTrigger>}
              </TabsList>
              {est.modules.pdv && canViewCashReports && <TabsContent value="cash"><CashRegisterModule key={`reports-${est.id}`} mode="reports" /></TabsContent>}
              {est.modules.pdv && canViewCashReports && <TabsContent value="movements"><ReportsCharts est={est} kind="activity" /></TabsContent>}
              {est.modules.agendamento && canAccessModule('agendamento') && <TabsContent value="professionals" className="space-y-4">
                {canViewCashReports && <ReportsCharts est={est} kind="professional" />}
                <Card className="p-5"><ProfessionalRevenueTab /></Card>
              </TabsContent>}
            </Tabs>
          </div>}
          {view === 'settings' && canViewSettings && <SettingsView />}
          {view === 'finance' && canViewFinance && <FinanceModule key={est.id} />}
          {view === 'employees' && est.modules.employees && canAccessModule('employees') && <EmployeesModule key={est.id} />}
          {view === 'agendamento' && canAccessModule('agendamento') && <AppointmentModule key={est.id} />}
          {view === 'cardapio' && canAccessModule('cardapio') && <MenuModule key={est.id} />}
          {view === 'pdv' && canViewCash && <CashRegisterModule key={est.id} />}
          {view === 'estoque' && canAccessModule('estoque') && <InventoryModule key={est.id} />}
          {view === 'comandas' && canAccessModule('comandas') && <CommandsModule key={est.id} />}
          {view === 'delivery' && canAccessModule('delivery') && <DeliveryModule key={est.id} />}
          {!canViewDashboard && !canViewSettings && !canViewFinance && !canViewReports && activeModules.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">Esta conta não tem permissões ativas nesta loja. Solicite acesso ao responsável.</Card>
          )}
        </div>
      </main>
      <SupportChat establishmentId={est.id} establishmentName={est.name} />
    </div>
  );

  function DashboardView() {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bem-vindo, {est.owner}!</h1>
          <p className="text-muted-foreground">Visão geral do seu estabelecimento</p>
        </div>

        <OperationalDashboard />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {activeModules.map((mod) => {
            const Icon = MODULE_ICONS[mod];
            return (
            <Card key={mod} className="p-6 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView(mod)}>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{MODULE_LABELS[mod]}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {mod === 'agendamento' && 'Gerencie serviços, profissionais e agendamentos'}
                    {mod === 'cardapio' && 'Cadastre produtos e receba pedidos via WhatsApp'}
                    {mod === 'pdv' && 'Frente de caixa com cálculo de troco e fechamento'}
                    {mod === 'estoque' && 'Controle de produtos e estoque'}
                    {mod === 'comandas' && 'Abra comandas e registre o consumo dos clientes'}
                    {mod === 'delivery' && 'Gerencie pedidos, entregadores e pagamentos de delivery'}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
            );
          })}
        </div>

        {((est.modules.agendamento && canAccessModule('agendamento')) || (est.modules.cardapio && canAccessModule('cardapio'))) && (
          <Card className="space-y-4 p-6">
            <div>
              <h3 className="font-semibold">Links Públicos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Pré-visualize as páginas ou copie o endereço para compartilhar com seus clientes.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {est.modules.agendamento && canAccessModule('agendamento') && (
                <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-slate-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <CalendarClock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">Agendamento online</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">Permita que seus clientes escolham um serviço e horário.</p>
                    </div>
                  </div>
                  <code className="block break-all rounded-md border bg-white px-3 py-2 text-sm text-slate-700">agendar/{est.slug}</code>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyPublicLink('agendar')}>
                      {copiedLink === `agendar/${est.slug}` ? <Check className="mr-2 h-4 w-4 text-emerald-600" /> : <Copy className="mr-2 h-4 w-4" />}
                      Copiar link
                    </Button>
                    <Button size="sm" onClick={() => viewPublicPage(est.slug, 'booking')}>
                      <ExternalLink className="mr-2 h-4 w-4" />Pré-visualizar
                    </Button>
                  </div>
                </div>
              )}
              {est.modules.cardapio && canAccessModule('cardapio') && (
                <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-slate-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <UtensilsCrossed className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">Cardápio digital</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">Mostre seus produtos e receba pedidos online.</p>
                    </div>
                  </div>
                  <code className="block break-all rounded-md border bg-white px-3 py-2 text-sm text-slate-700">cardapio/{est.slug}</code>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyPublicLink('cardapio')}>
                      {copiedLink === `cardapio/${est.slug}` ? <Check className="mr-2 h-4 w-4 text-emerald-600" /> : <Copy className="mr-2 h-4 w-4" />}
                      Copiar link
                    </Button>
                    <Button size="sm" onClick={() => viewPublicPage(est.slug, 'menu')}>
                      <ExternalLink className="mr-2 h-4 w-4" />Pré-visualizar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  function SettingsView() {
    const canEditIdentity = hasStorePermission(user, est.id, 'store-settings');
    const canConfigureDelivery = est.modules.delivery && hasStorePermission(user, est.id, 'delivery');
    const canManageTeam = hasStorePermission(user, est.id, 'manage-users');
    const canConfigureAppointments = est.modules.agendamento && hasStorePermission(user, est.id, 'agendamento');
    const [name, setName] = useState(est.theme.name);
    const [accent, setAccent] = useState(est.theme.accentColor);
    const [logo, setLogo] = useState(est.theme.logo);
    const [whatsapp, setWhatsapp] = useState(est.whatsapp);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    const colorOptions = ['#1e3a5f', '#d97706', '#059669', '#4f46e5', '#dc2626', '#7c3aed', '#0891b2', '#be185d'];

    const saveIdentity = async () => {
      const normalizedName = name.trim();
      if (!normalizedName) {
        toast.error('Informe o nome do estabelecimento');
        return;
      }

      try {
        await updateEstablishment(est.id, {
          name: normalizedName,
          whatsapp: whatsapp.replace(/\D/g, ''),
          theme: { ...est.theme, name: normalizedName, accentColor: accent, logo },
        });
        toast.success('Identidade visual salva!');
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : 'Não foi possível salvar a identidade visual.');
      }
    };

    const chooseLogo = async (file?: File) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return; }
      if (file.size > 8 * 1024 * 1024) { toast.error('A imagem deve ter até 8 MB.'); return; }
      setUploadingLogo(true);
      try {
        const imageBlob = await resizeLogo(file);
        if (supabase && user && !user.isDemo) {
          const path = `${est.id}/${crypto.randomUUID()}.jpg`;
          const { error } = await supabase.storage.from('establishment-logos').upload(path, imageBlob, {
            contentType: 'image/jpeg',
            upsert: true,
          });
          if (error) throw error;
          setLogo(supabase.storage.from('establishment-logos').getPublicUrl(path).data.publicUrl);
        } else {
          setLogo(await blobToDataUrl(imageBlob));
        }
        toast.success('Foto carregada. Salve as alterações para aplicar à loja.');
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : 'Não foi possível carregar a foto.');
      } finally {
        setUploadingLogo(false);
        if (logoInputRef.current) logoInputRef.current.value = '';
      }
    };

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Configurações da loja</h1>
          <p className="text-muted-foreground">Identidade, agendamentos, delivery e acessos da equipe.</p>
        </div>

        <Tabs defaultValue={canEditIdentity ? 'store' : canConfigureAppointments ? 'appointments' : canConfigureDelivery ? 'delivery' : 'team'} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {canEditIdentity && <TabsTrigger value="store">Loja</TabsTrigger>}
            {canConfigureAppointments && <TabsTrigger value="appointments">Agendamentos</TabsTrigger>}
            {canConfigureDelivery && <TabsTrigger value="delivery">Delivery</TabsTrigger>}
            {canManageTeam && <TabsTrigger value="team">Equipe</TabsTrigger>}
          </TabsList>

          {canEditIdentity && <TabsContent value="store" className="mt-0">
            <Card className="space-y-5 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="est-name">Nome do Estabelecimento</Label>
                <Input id="est-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Logo / Avatar</Label>
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {logo ? <img src={logo} alt={`Prévia da foto de ${name}`} className="h-full w-full rounded-xl object-cover" /> : name.charAt(0) || '?'}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => void chooseLogo(event.target.files?.[0])} />
                  <Button type="button" variant="outline" size="sm" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingLogo ? 'Carregando...' : 'Escolher foto'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cor de Destque da Marca</Label>
                <div className="flex flex-wrap gap-3">
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAccent(c)}
                      className={cn(
                        'h-10 w-10 rounded-lg border-2 transition-all',
                        accent === c ? 'border-foreground scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {accent === c && <Check className="mx-auto h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp para Notificações</Label>
                <Input
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="5511999999999"
                />
                <p className="text-xs text-muted-foreground">Usado para receber pedidos e avisos de agendamento</p>
              </div>

              <Button onClick={saveIdentity}>Salvar alterações</Button>
            </Card>
          </TabsContent>}
          {canConfigureAppointments && <TabsContent value="appointments" className="mt-0">
            <AppointmentSettings />
          </TabsContent>}
          {canConfigureDelivery && <TabsContent value="delivery" className="mt-0">
            <DeliveryStoreSettings establishmentId={est.id} />
          </TabsContent>}
          {canManageTeam && <TabsContent value="team" className="mt-0">
            <StoreUserManagement establishment={est} />
          </TabsContent>}
        </Tabs>
      </div>
    );
  }
}

function ReportsCharts({ est, kind }: { est: Establishment; kind: 'activity' | 'professional' }) {
  const establishmentId = est.id;
  const [cashRegister, , cashLoaded] = usePersistentState<CashRegisterData>(
    `cash-register:${establishmentId}`,
    EMPTY_CASH_REGISTER,
    { readOnly: true },
  );
  const isBarbershop = est.slug === 'barbearia-estilo';
  const [appointments, , appointmentsLoaded] = usePersistentState<Appointment[]>(
    `appointments:${establishmentId}`,
    isBarbershop ? initialAppointments : [],
    { readOnly: true },
  );
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('week');
  const [dashboardReferenceDate, setDashboardReferenceDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [activityChartType, setActivityChartType] = useState<ChartType>('bar');
  const [professionalChartType, setProfessionalChartType] = useState<ChartType>('bar');

  const chartRangeStart = new Date(`${dashboardReferenceDate}T00:00:00`);
  if (dashboardPeriod === 'week') chartRangeStart.setDate(chartRangeStart.getDate() - ((chartRangeStart.getDay() + 6) % 7));
  if (dashboardPeriod === 'month') chartRangeStart.setDate(1);
  if (dashboardPeriod === 'year') chartRangeStart.setMonth(0, 1);
  const chartRangeEnd = new Date(chartRangeStart);
  if (dashboardPeriod === 'day') chartRangeEnd.setDate(chartRangeEnd.getDate() + 1);
  if (dashboardPeriod === 'week') chartRangeEnd.setDate(chartRangeEnd.getDate() + 7);
  if (dashboardPeriod === 'month') chartRangeEnd.setMonth(chartRangeEnd.getMonth() + 1);
  if (dashboardPeriod === 'year') chartRangeEnd.setFullYear(chartRangeEnd.getFullYear() + 1);
  const chartBuckets: { start: Date; end: Date; label: string }[] = [];
  for (let bucketStart = new Date(chartRangeStart); bucketStart < chartRangeEnd;) {
    const bucketEnd = new Date(bucketStart);
    if (dashboardPeriod === 'day') bucketEnd.setHours(bucketEnd.getHours() + 1);
    else if (dashboardPeriod === 'year') bucketEnd.setMonth(bucketEnd.getMonth() + 1);
    else bucketEnd.setDate(bucketEnd.getDate() + 1);
    const label = dashboardPeriod === 'day'
      ? bucketStart.toLocaleTimeString('pt-BR', { hour: '2-digit' })
      : dashboardPeriod === 'year'
        ? bucketStart.toLocaleDateString('pt-BR', { month: 'short' })
        : dashboardPeriod === 'week'
          ? bucketStart.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })
          : bucketStart.toLocaleDateString('pt-BR', { day: '2-digit' });
    chartBuckets.push({ start: bucketStart, end: bucketEnd, label });
    bucketStart = bucketEnd;
  }
  const chartData = chartBuckets.map(({ start, end, label }) => {
    const sales = cashRegister.sales.filter((sale) => {
      const createdAt = new Date(sale.createdAt).getTime();
      return sale.status !== 'cancelled' && createdAt >= start.getTime() && createdAt < end.getTime();
    });
    const movements = cashRegister.movements.filter((movement) => {
      const createdAt = new Date(movement.createdAt).getTime();
      return !movement.cancelledAt && createdAt >= start.getTime() && createdAt < end.getTime();
    });
    return {
      period: label,
      vendas: sales.reduce((total, sale) => total + sale.total, 0),
      sangrias: movements.filter((movement) => movement.type === 'withdrawal').reduce((total, movement) => total + movement.amount, 0),
      suprimentos: movements.filter((movement) => movement.type === 'supply').reduce((total, movement) => total + movement.amount, 0),
    };
  });
  const activityPieData = [
    { name: 'Vendas', value: chartData.reduce((total, bucket) => total + bucket.vendas, 0), color: '#3f7c78' },
    { name: 'Sangrias', value: chartData.reduce((total, bucket) => total + bucket.sangrias, 0), color: '#bc7a69' },
    { name: 'Suprimentos', value: chartData.reduce((total, bucket) => total + bucket.suprimentos, 0), color: '#86a58d' },
  ].filter((entry) => entry.value > 0);
  const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const professionalSales = new Map<string, { appointments: number; revenue: number }>();
  for (const sale of cashRegister.sales) {
    const createdAt = new Date(sale.createdAt).getTime();
    if (sale.origin !== 'agendamento' || sale.status === 'cancelled' || createdAt < chartRangeStart.getTime() || createdAt >= chartRangeEnd.getTime()) continue;
    for (const item of sale.items) {
      const appointment = item.sourceRecordId ? appointmentsById.get(item.sourceRecordId) : undefined;
      const professional = item.professional || appointment?.professional;
      if (!professional) continue;
      const summary = professionalSales.get(professional) ?? { appointments: 0, revenue: 0 };
      summary.appointments += item.quantity;
      summary.revenue += item.price * item.quantity;
      professionalSales.set(professional, summary);
    }
  }
  const professionalChartData = [...professionalSales.entries()]
    .map(([name, summary]) => ({ professional: name, ...summary }))
    .sort((first, second) => second.revenue - first.revenue);

    if (!cashLoaded || (kind === 'professional' && !appointmentsLoaded)) return <p>Carregando gráficos...</p>;
    return <div className="space-y-4">
        {kind === 'professional' && <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Data de referência<Input type="date" value={dashboardReferenceDate} onChange={(event) => { if (event.target.value) setDashboardReferenceDate(event.target.value); }} /></label>
          <div className="inline-flex flex-wrap rounded-md border p-1" role="group" aria-label="Período dos gráficos">
            {(['day', 'week', 'month', 'year'] as const).map((period) => <Button key={period} type="button" size="sm" variant={dashboardPeriod === period ? 'default' : 'ghost'} onClick={() => setDashboardPeriod(period)}>{DASHBOARD_PERIOD_LABELS[period]}</Button>)}
          </div>
        </div>}
        {kind === 'activity' && (
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-semibold">Atividade do caixa</h2><p className="text-sm text-muted-foreground">Vendas, sangrias e suprimentos · {DASHBOARD_PERIOD_LABELS[dashboardPeriod]} · {chartRangeStart.toLocaleDateString('pt-BR')} a {new Date(chartRangeEnd.getTime() - 1).toLocaleDateString('pt-BR')}</p></div>
              <div className="flex flex-wrap items-end gap-3">
                <ChartTypeSelector value={activityChartType} onChange={setActivityChartType} label="atividade do caixa" />
                <label className="space-y-1 text-xs font-medium text-muted-foreground">Data de referência<Input type="date" value={dashboardReferenceDate} onChange={(event) => { if (event.target.value) setDashboardReferenceDate(event.target.value); }} /></label>
                <div className="inline-flex flex-wrap rounded-md border p-1" role="group" aria-label="Período dos gráficos">
                  {(['day', 'week', 'month', 'year'] as const).map((period) => <Button key={period} type="button" size="sm" variant={dashboardPeriod === period ? 'default' : 'ghost'} onClick={() => setDashboardPeriod(period)}>{DASHBOARD_PERIOD_LABELS[period]}</Button>)}
                </div>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {activityChartType === 'pie' ? (
                  <PieChart>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Pie data={activityPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="75%">
                      {activityPieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                ) : activityChartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value: number) => formatCurrency(value)} tickLine={false} axisLine={false} width={104} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="vendas" name="Vendas" stroke="#3f7c78" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sangrias" name="Sangrias" stroke="#bc7a69" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="suprimentos" name="Suprimentos" stroke="#86a58d" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value: number) => formatCurrency(value)} tickLine={false} axisLine={false} width={104} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="vendas" name="Vendas" fill="#3f7c78" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="sangrias" name="Sangrias" fill="#bc7a69" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="suprimentos" name="Suprimentos" fill="#86a58d" radius={[6, 6, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {kind === 'professional' && (
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Faturamento por profissional</h2><p className="text-sm text-muted-foreground">Serviços registrados no caixa · {DASHBOARD_PERIOD_LABELS[dashboardPeriod].toLowerCase()} ({chartRangeStart.toLocaleDateString('pt-BR')} a {new Date(chartRangeEnd.getTime() - 1).toLocaleDateString('pt-BR')})</p></div><ChartTypeSelector value={professionalChartType} onChange={setProfessionalChartType} label="faturamento por profissional" /></div>
            {professionalChartData.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {professionalChartType === 'pie' ? (
                    <PieChart>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                      <Pie data={professionalChartData} dataKey="revenue" nameKey="professional" cx="50%" cy="50%" outerRadius="75%">
                        {professionalChartData.map((entry, index) => <Cell key={entry.professional} fill={['#3f7c78', '#bc7a69', '#86a58d', '#7487a6', '#d2a84a'][index % 5]} />)}
                      </Pie>
                    </PieChart>
                  ) : professionalChartType === 'line' ? (
                    <LineChart data={professionalChartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="professional" tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(value: number) => formatCurrency(value)} tickLine={false} axisLine={false} width={104} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Line type="monotone" dataKey="revenue" name="Faturamento" stroke="#3f7c78" strokeWidth={2} />
                    </LineChart>
                  ) : (
                    <BarChart data={professionalChartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="professional" tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(value: number) => formatCurrency(value)} tickLine={false} axisLine={false} width={104} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" name="Faturamento" fill="#3f7c78" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há serviços registrados por profissional neste período.</p>}
          </Card>
        )}

    </div>;
  }


function SidebarItem({ icon: Icon, label, active, onClick }: {
  icon: typeof Home; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors md:justify-start md:px-3',
        active
          ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/10'
          : 'text-muted-foreground hover:bg-slate-100/80 hover:text-foreground dark:hover:bg-slate-800/70'
      )}
      title={label}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden truncate md:block">{label}</span>
    </button>
  );
}

async function resizeLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('Não foi possível processar a imagem.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível converter a imagem.')), 'image/jpeg', 0.82);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível ler a imagem.'));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}
