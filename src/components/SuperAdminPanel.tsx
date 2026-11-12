import { useState } from 'react';
import {
  Building2, Users, DollarSign, TrendingUp, Search, MoreVertical,
  ExternalLink, Pencil, Copy, CalendarClock, UtensilsCrossed,
  Calculator, Package, Star, Activity, Plus, Trash2, ClipboardList, Bike,
  WalletCards, Store,
} from 'lucide-react';
import { useApp } from '@/store';
import { MODULE_LABELS, formatCurrency } from '@/mockData';
import type { Establishment, ModuleKey } from '@/types';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { UserManagementDialog } from '@/components/UserManagementDialog';
import { SupportInbox } from '@/components/SupportInbox';
import { AdminBillingPanel } from '@/components/modules/AdminBillingPanel';

const MODULE_META: Record<ModuleKey, { label: string; icon: typeof CalendarClock }> = {
  agendamento: { label: 'Agendamento Online', icon: CalendarClock },
  cardapio: { label: 'Cardápio Digital', icon: UtensilsCrossed },
  pdv: { label: 'Frente de Caixa (PDV)', icon: Calculator },
  estoque: { label: 'Controle de Estoque & Clientes', icon: Package },
  comandas: { label: 'Comandas', icon: ClipboardList },
  delivery: { label: 'Delivery', icon: Bike },
  finance: { label: 'Finanças', icon: WalletCards },
};

export function SuperAdminPanel() {
  const { establishments, updateEstablishment, createEstablishment, deleteEstablishment, viewPublicPage } = useApp();
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<Establishment | null>(null);
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useState<Establishment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'stores' | 'finances'>('stores');

  const filtered = establishments.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.owner.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = establishments
    .filter((e) => e.status === 'active')
    .reduce((sum, e) => sum + e.monthlyRevenue, 0);

  const moduleCounts: Record<ModuleKey, number> = {
    agendamento: establishments.filter((e) => e.modules.agendamento).length,
    cardapio: establishments.filter((e) => e.modules.cardapio).length,
    pdv: establishments.filter((e) => e.modules.pdv).length,
    estoque: establishments.filter((e) => e.modules.estoque).length,
    comandas: establishments.filter((e) => e.modules.comandas).length,
    delivery: establishments.filter((e) => e.modules.delivery).length,
    finance: establishments.filter((e) => e.modules.finance).length,
  };

  const activeModules = Object.entries(moduleCounts).sort(([, a], [, b]) => b - a)[0];

  const copyLink = (slug: string, type: 'agendar' | 'cardapio') => {
    const link = `${type}/${slug}`;
    navigator.clipboard?.writeText(link);
    toast.success('Link copiado para a área de transferência!');
  };

  const removeEstablishment = async (establishment: Establishment) => {
    const confirmed = window.confirm(`Excluir definitivamente ${establishment.name} e todos os dados vinculados? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    try {
      await deleteEstablishment(establishment.id);
      toast.success('Estabelecimento e dados vinculados foram excluídos.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Não foi possível excluir o estabelecimento.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 animate-fade-in sm:px-6 lg:px-8">
      <SupportInbox />
      <div className="flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label="Painel Super Admin">
        <Button type="button" role="tab" aria-selected={activeTab === 'stores'} variant={activeTab === 'stores' ? 'default' : 'outline'} onClick={() => setActiveTab('stores')}>
          <Store className="mr-2 h-4 w-4" />Lojas
        </Button>
        <Button type="button" role="tab" aria-selected={activeTab === 'finances'} variant={activeTab === 'finances' ? 'default' : 'outline'} onClick={() => setActiveTab('finances')}>
          <WalletCards className="mr-2 h-4 w-4" />Finanças do Kito
        </Button>
      </div>
      {activeTab === 'finances' ? (
        <AdminBillingPanel
          establishments={establishments}
          onUpdateMonthlyRevenue={(id, monthlyRevenue) => updateEstablishment(id, { monthlyRevenue })}
        />
      ) : (
      <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total de Lojistas"
          value={establishments.length.toString()}
          sub={`${establishments.filter((e) => e.status === 'active').length} ativos`}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={DollarSign}
          label="Mensalidades Ativas"
          value={formatCurrency(totalRevenue)}
          sub="Soma mensal das lojas ativas"
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          icon={TrendingUp}
          label="Módulos Mais Ativados"
          value={MODULE_LABELS[activeModules[0]]}
          sub={`${activeModules[1]} estabelecimentos`}
          color="text-indigo-600"
          bg="bg-indigo-50"
        />
        <StatCard
          icon={Activity}
          label="Módulos Ativos no Total"
          value={Object.values(moduleCounts).reduce((a, b) => a + b, 0).toString()}
          sub="Em todos os clientes"
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      {/* Module breakdown bar */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <span className="text-sm font-semibold">Distribuição de Módulos:</span>
          {(Object.keys(MODULE_META) as ModuleKey[]).map((key) => {
            const Icon = MODULE_META[key].icon;
            return (
            <div key={key} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{MODULE_LABELS[key]}</span>
              <Badge variant="secondary" className="font-mono">{moduleCounts[key]}</Badge>
            </div>
            );
          })}
        </div>
      </Card>

      {/* Search + Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Estabelecimentos Cadastrados</h2>
            <p className="text-sm text-muted-foreground">Gerencie clientes, módulos e status</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou proprietário..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 pl-9"
              />
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova loja</Button>
            <Button type="button" variant="outline" onClick={() => setUsersOpen(true)}><Users className="mr-2 h-4 w-4" />Usuários</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="min-w-[180px]">Estabelecimento</TableHead>
                <TableHead>Proprietário</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Mensalidade</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link Público</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((est) => {
                const activeModules = (Object.keys(est.modules) as ModuleKey[]).filter(
                  (k) => est.modules[k]
                );
                return (
                  <TableRow key={est.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                        >
                          {est.theme.logo ? <img src={est.theme.logo} alt={`Logo de ${est.name}`} className="h-full w-full rounded-lg object-cover" /> : est.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium">{est.name}</div>
                          <div className="text-xs text-muted-foreground">/{est.slug}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">{est.owner}</div>
                        <div className="text-xs text-muted-foreground">{est.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Star className="h-3 w-3" />
                        {est.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto gap-1 px-2 py-1 font-semibold tabular-nums"
                        aria-label={`Editar mensalidade Kito de ${est.name}, atualmente ${formatCurrency(est.monthlyRevenue)}`}
                        onClick={() => setMonthlyRevenueTarget(est)}
                      >
                        {formatCurrency(est.monthlyRevenue)}
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {activeModules.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nenhum</span>
                        ) : (
                          activeModules.map((m) => {
                            const Icon = MODULE_META[m].icon;
                            return (
                            <TooltipProvider key={m}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <Icon className="h-3.5 w-3.5" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{MODULE_LABELS[m]}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            );
                          })
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={est.status === 'active' ? 'default' : 'secondary'}
                        className={est.status === 'active'
                          ? 'rounded-full border border-emerald-200/60 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-none'
                          : 'rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shadow-none'
                        }
                      >
                        {est.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {est.modules.agendamento && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => viewPublicPage(est.slug, 'booking')}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver página de agendamento</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {est.modules.cardapio && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => viewPublicPage(est.slug, 'menu')}
                                >
                                  <UtensilsCrossed className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver cardápio digital</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditTarget(est)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar loja
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void removeEstablishment(est)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir loja e dados
                          </DropdownMenuItem>
                          {est.modules.agendamento && (
                            <DropdownMenuItem onClick={() => copyLink(est.slug, 'agendar')}>
                              <Copy className="mr-2 h-4 w-4" />
                              Copiar link de agendamento
                            </DropdownMenuItem>
                          )}
                          {est.modules.cardapio && (
                            <DropdownMenuItem onClick={() => copyLink(est.slug, 'cardapio')}>
                              <Copy className="mr-2 h-4 w-4" />
                              Copiar link do cardápio
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      </>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <EditEstablishmentModal
          establishment={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={async (updates) => {
            try {
              await updateEstablishment(editTarget.id, updates);
              toast.success('Alterações salvas com sucesso!');
              setEditTarget(null);
            } catch (reason) {
              toast.error(reason instanceof Error ? reason.message : 'Não foi possível salvar as alterações.');
            }
          }}
        />
      )}
      {monthlyRevenueTarget && (
        <MonthlyRevenueModal
          establishment={monthlyRevenueTarget}
          onClose={() => setMonthlyRevenueTarget(null)}
          onSave={async (monthlyRevenue) => {
            try {
              await updateEstablishment(monthlyRevenueTarget.id, { monthlyRevenue });
              toast.success(`Mensalidade de ${monthlyRevenueTarget.name} atualizada.`);
              setMonthlyRevenueTarget(null);
            } catch (reason) {
              toast.error(reason instanceof Error ? reason.message : 'Não foi possível atualizar a mensalidade.');
            }
          }}
        />
      )}
      {createOpen && (
        <CreateEstablishmentModal
          existingSlugs={establishments.map((establishment) => establishment.slug)}
          onClose={() => setCreateOpen(false)}
          onCreate={async (establishment) => {
            try {
              await createEstablishment(establishment);
              toast.success('Estabelecimento criado com o template selecionado.');
              setCreateOpen(false);
            } catch (reason) {
              toast.error(reason instanceof Error ? reason.message : 'Não foi possível criar a loja.');
            }
          }}
        />
      )}
      <UserManagementDialog open={usersOpen} onClose={() => setUsersOpen(false)} />
    </div>
  );
}

function CreateEstablishmentModal({
  existingSlugs, onClose, onCreate,
}: {
  existingSlugs: string[];
  onClose: () => void;
  onCreate: (establishment: Establishment) => void;
}) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [plan, setPlan] = useState('Plano Profissional');
  const [monthlyRevenue, setMonthlyRevenue] = useState('0');
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>({
    agendamento: false,
    cardapio: false,
    pdv: false,
    estoque: false,
    comandas: false,
    delivery: false,
    finance: false,
  });
  const [error, setError] = useState('');

  const toggleModule = (module: ModuleKey) => {
    setModules((current) => ({ ...current, [module]: !current[module] }));
  };

  const create = () => {
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name.trim() || !owner.trim() || !email.trim()) { setError('Preencha o nome da loja, responsável e e-mail.'); return; }
    if (!slug) { setError('Informe um nome que possa ser usado como endereço da loja.'); return; }
    if (existingSlugs.includes(slug)) { setError('Já existe uma loja com este nome/endereço.'); return; }
    if (!Object.values(modules).some(Boolean)) { setError('Ative pelo menos um módulo.'); return; }
    const parsedMonthlyRevenue = Number(monthlyRevenue);
    if (!Number.isFinite(parsedMonthlyRevenue) || parsedMonthlyRevenue < 0) { setError('Informe uma mensalidade válida, maior ou igual a zero.'); return; }
    onCreate({
      id: globalThis.crypto?.randomUUID?.() ?? `est-${Date.now()}`,
      slug,
      name: name.trim(),
      owner: owner.trim(),
      email: email.trim(),
      plan: plan.trim() || 'Plano Personalizado',
      monthlyRevenue: Math.round(parsedMonthlyRevenue * 100) / 100,
      status: 'active',
      modules,
      theme: { name: name.trim(), logo: '', accentColor: '#4f46e5' },
      whatsapp: whatsapp.replace(/\D/g, ''),
      template: 'custom',
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Criar estabelecimento</DialogTitle>
          <DialogDescription>Configure uma loja personalizada selecionando os módulos que ela vai usar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Nome da loja<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Barbearia Centro" /></label>
            <label className="space-y-1 text-sm font-medium">Responsável<Input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Nome do proprietário" /></label>
            <label className="space-y-1 text-sm font-medium">E-mail<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@empresa.com" /></label>
            <label className="space-y-1 text-sm font-medium">WhatsApp (opcional)<Input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="5511999999999" /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">Plano<Input value={plan} onChange={(event) => setPlan(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">Mensalidade Kito (R$)<CurrencyInput value={Number(monthlyRevenue) || 0} onValueChange={(value) => setMonthlyRevenue(value === null ? '' : String(value))} /><span className="block text-xs font-normal text-muted-foreground">Valor mensal que será usado para as cobranças da assinatura.</span></label>
          </div>
          <div className="rounded-md border p-4">
            <h3 className="mb-2 text-sm font-semibold">Módulos</h3>
            {(Object.keys(MODULE_META) as ModuleKey[]).map((module) => {
              const Icon = MODULE_META[module].icon;
              return <label key={module} className="flex items-center justify-between border-b py-2 last:border-0">
                <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-muted-foreground" />{MODULE_LABELS[module]}</span>
                <Switch checked={modules[module]} onCheckedChange={() => toggleModule(module)} />
              </label>;
            })}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="button" onClick={create}>Criar loja</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: typeof Users; label: string; value: string; sub: string; color: string; bg: string;
}) {
  return (
    <Card className="p-6 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="break-words text-3xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </Card>
  );
}

function EditEstablishmentModal({
  establishment, onClose, onSave,
}: {
  establishment: Establishment;
  onClose: () => void;
  onSave: (updates: Partial<Establishment>) => void;
}) {
  const [name, setName] = useState(establishment.name);
  const [owner, setOwner] = useState(establishment.owner);
  const [email, setEmail] = useState(establishment.email);
  const [plan, setPlan] = useState(establishment.plan);
  const [status, setStatus] = useState(establishment.status);
  const [whatsapp, setWhatsapp] = useState(establishment.whatsapp);
  const [accentColor, setAccentColor] = useState(establishment.theme.accentColor);
  const [modules, setModules] = useState(establishment.modules);

  const handleToggle = (mod: ModuleKey) => {
    setModules((prev) => ({ ...prev, [mod]: !prev[mod] }));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Editar Estabelecimento
          </DialogTitle>
          <DialogDescription>
            Configure os dados e os módulos. Para alterar a mensalidade, clique no valor da tabela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome do Estabelecimento</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Proprietário</label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">E-mail</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">WhatsApp</label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Plano</label>
              <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={status === 'active'}
                  onCheckedChange={(v) => setStatus(v ? 'active' : 'inactive')}
                />
                <span className="text-sm">{status === 'active' ? 'Ativo' : 'Inativo'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium" htmlFor="est-accent-color">Cor da loja</label>
            <Input id="est-accent-color" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-16 p-1" />
            <span className="text-sm text-muted-foreground">{accentColor}</span>
          </div>

          <div className="rounded-lg border p-4 space-y-1 bg-muted/30">
            <p className="text-sm font-semibold mb-3">Módulos Contratados</p>
            {(Object.keys(MODULE_META) as ModuleKey[]).map((key) => {
              const meta = MODULE_META[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <meta.icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <Switch checked={modules[key]} onCheckedChange={() => handleToggle(key)} />
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => {
            onSave({
              name: name.trim(),
              owner: owner.trim(),
              email: email.trim(),
              plan: plan.trim(),
              status,
              modules,
              whatsapp: whatsapp.replace(/\D/g, ''),
              theme: { ...establishment.theme, name: name.trim(), accentColor },
            });
          }}>
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MonthlyRevenueModal({
  establishment,
  onClose,
  onSave,
}: {
  establishment: Establishment;
  onClose: () => void;
  onSave: (monthlyRevenue: number) => Promise<void>;
}) {
  const [monthlyRevenue, setMonthlyRevenue] = useState(establishment.monthlyRevenue);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!Number.isFinite(monthlyRevenue) || monthlyRevenue < 0) {
      toast.error('Informe um valor válido, maior ou igual a zero.');
      return;
    }
    setSaving(true);
    try {
      await onSave(Math.round(monthlyRevenue * 100) / 100);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mensalidade Kito</DialogTitle>
          <DialogDescription>Altere o valor mensal de {establishment.name}.</DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm font-medium">
          Valor mensal (R$)
          <CurrencyInput autoFocus value={monthlyRevenue} onValueChange={(value) => setMonthlyRevenue(value ?? 0)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar mensalidade'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
