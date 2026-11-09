import { useState } from 'react';
import {
  CalendarClock, Plus, Clock, DollarSign, Scissors, Users,
  Copy, Check, ExternalLink, Trash2, Calendar as CalIcon, Pencil,
} from 'lucide-react';
import { useApp } from '@/store';
import { services as initialServices, professionals as initialPros, appointments as initialAppts, workingHours as initialHours, formatCurrency } from '@/mockData';
import type { Service, Professional, Appointment, AppointmentStatus, CashRegisterData, WorkingHours } from '@/types';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function AppointmentModule() {
  const { selectedEstablishment, viewPublicPage } = useApp();
  const [tab, setTab] = useState('config');

  if (!selectedEstablishment) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Módulo de Agendamentos
          </h1>
          <p className="text-muted-foreground">Configure serviços, horários e acompanhe agendamentos</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyLinkButton slug={selectedEstablishment.slug} type="agendar" />
          <Button size="sm" onClick={() => viewPublicPage(selectedEstablishment.slug, 'booking')}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Ver página pública
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="pros">Profissionais</TabsTrigger>
          <TabsTrigger value="calendar">Agendamentos</TabsTrigger>
          <TabsTrigger value="reports">Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <ConfigTab />
        </TabsContent>
        <TabsContent value="services" className="mt-4">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="pros" className="mt-4">
          <ProsTab />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ProfessionalRevenueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type RevenuePeriod = 'day' | 'week' | 'month';

function getRevenuePeriodStart(period: RevenuePeriod) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === 'day') return today;
  if (period === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  today.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return today;
}

function ProfessionalRevenueTab() {
  const { selectedEstablishment } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const isBarbershop = selectedEstablishment?.slug === 'barbearia-estilo';
  const [period, setPeriod] = useState<RevenuePeriod>('month');
  const [appointments] = usePersistentState<Appointment[]>(
    `appointments:${establishmentId}`,
    isBarbershop ? initialAppts : [],
  );
  const [services] = usePersistentState<Service[]>(
    `services:${establishmentId}`,
    isBarbershop ? initialServices : [],
  );
  const [cashRegister] = usePersistentState<CashRegisterData>(
    `cash-register:${establishmentId}`,
    { activeSessionId: null, sessions: [], sales: [], movements: [] },
  );
  const start = getRevenuePeriodStart(period);
  const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const revenueByProfessional = new Map<string, { appointments: number; revenue: number; services: Map<string, number> }>();
  const countedAppointmentIds = new Set<string>();

  for (const sale of cashRegister.sales) {
    if (sale.origin !== 'agendamento' || sale.status === 'cancelled' || new Date(sale.createdAt) < start) continue;
    for (const item of sale.items) {
      const appointment = item.sourceRecordId ? appointmentsById.get(item.sourceRecordId) : undefined;
      if (appointment) countedAppointmentIds.add(appointment.id);
      const professional = item.professional || appointment?.professional || 'Sem profissional';
      const row = revenueByProfessional.get(professional) ?? { appointments: 0, revenue: 0, services: new Map<string, number>() };
      row.appointments += item.quantity;
      row.revenue += item.price * item.quantity;
      const serviceName = appointment?.service ?? item.name;
      row.services.set(serviceName, (row.services.get(serviceName) ?? 0) + item.quantity);
      revenueByProfessional.set(professional, row);
    }
  }

  for (const appointment of appointments) {
    if (appointment.paymentStatus !== 'paid' || countedAppointmentIds.has(appointment.id)) continue;
    const date = new Date(`${appointment.date}T00:00:00`);
    if (date < start) continue;
    const service = services.find((item) => item.name === appointment.service);
    if (!service) continue;
    const professional = appointment.professional || 'Sem profissional';
    const row = revenueByProfessional.get(professional) ?? { appointments: 0, revenue: 0, services: new Map<string, number>() };
    row.appointments += 1;
    row.revenue += service.price;
    row.services.set(service.name, (row.services.get(service.name) ?? 0) + 1);
    revenueByProfessional.set(professional, row);
  }

  const rows = [...revenueByProfessional.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevenue = rows.reduce((sum, [, row]) => sum + row.revenue, 0);
  const totalAppointments = rows.reduce((sum, [, row]) => sum + row.appointments, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-semibold">Vendas por profissional</h2><p className="text-sm text-muted-foreground">Atendimentos pagos no caixa, agrupados pelo profissional escolhido no agendamento.</p></div>
        <div className="flex gap-1 rounded-md border p-1">
          {(['day', 'week', 'month'] as const).map((value) => <Button key={value} type="button" size="sm" variant={period === value ? 'default' : 'ghost'} onClick={() => setPeriod(value)}>{value === 'day' ? 'Hoje' : value === 'week' ? 'Esta semana' : 'Este mês'}</Button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-6"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Atendimentos pagos</p><p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{totalAppointments}</p></Card>
        <Card className="p-6"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total vendido</p><p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{formatCurrency(totalRevenue)}</p></Card>
      </div>
      <Card className="divide-y p-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-3 text-xs font-semibold uppercase text-muted-foreground"><span>Profissional</span><span className="text-right">Atendimentos</span><span className="text-right">Faturamento</span></div>
        {rows.map(([professional, row]) => (
          <div key={professional} className="grid grid-cols-[1fr_auto_auto] gap-4 py-3">
            <div className="min-w-0"><p className="truncate font-medium">{professional}</p><p className="truncate text-xs text-muted-foreground">{[...row.services].map(([name, count]) => `${name}: ${count}`).join(' · ')}</p></div>
            <span className="text-right">{row.appointments}</span>
            <span className="text-right font-semibold">{formatCurrency(row.revenue)}</span>
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento pago neste período.</p>}
      </Card>
    </div>
  );
}

function CopyLinkButton({ slug, type }: { slug: string; type: 'agendar' | 'cardapio' }) {
  const [copied, setCopied] = useState(false);
  const link = `${type}/${slug}`;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard?.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Link copiado!');
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
      {link}
    </Button>
  );
}

function ConfigTab() {
  const { selectedEstablishment } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [hours, setHours] = usePersistentState<WorkingHours[]>(
    `working-hours:${establishmentId}`,
    initialHours,
  );
  const [defaultDuration, setDefaultDuration] = usePersistentState(
    `appointment-duration:${establishmentId}`,
    30,
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Dias e Horários de Funcionamento
        </h3>
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-3 py-1.5 border-b last:border-0">
              <div className="w-24">
                <span className="text-sm font-medium">{h.day}</span>
              </div>
              <Switch
                checked={h.enabled}
                onCheckedChange={(v) => {
                  setHours((prev) => prev.map((x, idx) => idx === i ? { ...x, enabled: v } : x));
                }}
              />
              {h.enabled ? (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="time"
                    value={h.start}
                    onChange={(e) => {
                      setHours((prev) => prev.map((x, idx) => idx === i ? { ...x, start: e.target.value } : x));
                    }}
                    className="w-28 h-8"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    value={h.end}
                    onChange={(e) => {
                      setHours((prev) => prev.map((x, idx) => idx === i ? { ...x, end: e.target.value } : x));
                    }}
                    className="w-28 h-8"
                  />
                </div>
              ) : (
                <span className="ml-auto text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="space-y-2">
          <Label>Duração Padrão dos Atendimentos (minutos)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">minutos por agendamento</span>
          </div>
        </div>
      </Card>

      <Button onClick={() => toast.success('Configurações salvas!')}>
        Salvar configurações
      </Button>
    </div>
  );
}

function ServicesTab() {
  const { selectedEstablishment } = useApp();
  const isBarbershop = selectedEstablishment?.slug === 'barbearia-estilo';
  const [items, setItems] = usePersistentState<Service[]>(
    `services:${selectedEstablishment?.id ?? 'default'}`,
    isBarbershop ? initialServices : [],
  );
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');

  const addService = () => {
    if (!name || !price || !duration) {
      toast.error('Preencha todos os campos');
      return;
    }
    setItems((prev) => [...prev, {
      id: `s${Date.now()}`,
      name,
      price: Number(price),
      duration: Number(duration),
    }]);
    setName(''); setPrice(''); setDuration('');
    toast.success('Serviço adicionado!');
  };

  const removeService = (id: string) => {
    setItems((prev) => prev.filter((s) => s.id !== id));
    toast.success('Serviço removido');
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Scissors className="h-4 w-4 text-primary" />
          Cadastrar Novo Serviço
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Nome do Serviço</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Corte de Cabelo" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço (R$)</Label>
            <CurrencyInput value={Number(price) || 0} onValueChange={(value) => setPrice(value === null ? '' : String(value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Duração (min)</Label>
            <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={addService}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar serviço
        </Button>
      </Card>

      <div className="space-y-2">
        {items.map((s) => (
          <Card key={s.id} className="p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Scissors className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.duration} minutos</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="font-mono">
                <DollarSign className="h-3 w-3 mr-0.5" />
                {formatCurrency(s.price)}
              </Badge>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeService(s.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProsTab() {
  const { selectedEstablishment } = useApp();
  const isBarbershop = selectedEstablishment?.slug === 'barbearia-estilo';
  const [items, setItems] = usePersistentState<Professional[]>(
    `professionals:${selectedEstablishment?.id ?? 'default'}`,
    isBarbershop ? initialPros : [],
  );
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  const add = () => {
    if (!name) { toast.error('Informe o nome'); return; }
    setItems((prev) => [...prev, { id: `p${Date.now()}`, name, role: role || 'Profissional' }]);
    setName(''); setRole('');
    toast.success('Profissional adicionado!');
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Adicionar Profissional
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João Silva" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cargo</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex: Barbeiro" />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </Card>

      <div className="space-y-2">
        {items.map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                {p.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.role}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(p.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CalendarTab() {
  const { selectedEstablishment } = useApp();
  const isBarbershop = selectedEstablishment?.slug === 'barbearia-estilo';
  const [appts, setAppts] = usePersistentState<Appointment[]>(
    `appointments:${selectedEstablishment?.id ?? 'default'}`,
    isBarbershop ? initialAppts : [],
  );
  const [services] = usePersistentState<Service[]>(
    `services:${selectedEstablishment?.id ?? 'default'}`,
    isBarbershop ? initialServices : [],
  );
  const [professionals] = usePersistentState<Professional[]>(
    `professionals:${selectedEstablishment?.id ?? 'default'}`,
    isBarbershop ? initialPros : [],
  );
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState<Appointment | null>(null);
  const visibleAppointments = appts
    .filter((appointment) => showHistory || appointment.date === selectedDate)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const saveAppointment = () => {
    if (!draft) return;
    const hasConflict = draft.status !== 'cancelled' && appts.some((appointment) =>
      appointment.id !== draft.id && appointment.status !== 'cancelled' &&
      appointment.date === draft.date && appointment.time === draft.time &&
      appointment.professional === draft.professional,
    );
    if (hasConflict) { toast.error('Este profissional já possui um agendamento nesse horário'); return; }
    setAppts((current) => current.map((appointment) => appointment.id === draft.id ? draft : appointment));
    setSelectedDate(draft.date);
    setShowHistory(false);
    setDraft(null);
    toast.success('Agendamento atualizado');
  };

  const statusLabel = (appointment: Appointment) => {
    if (appointment.paymentStatus === 'paid') return 'Pago';
    if (appointment.status === 'completed') return 'Concluído';
    if (appointment.status === 'cancelled') return 'Cancelado';
    if (appointment.status === 'pending') return 'Pendente';
    return 'Confirmado';
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="flex items-center gap-2 font-semibold"><CalIcon className="h-4 w-4 text-primary" />Agenda e histórico</h3><p className="text-sm text-muted-foreground">Filtre atendimentos por data e acompanhe pagamento.</p></div>
          <div className="flex items-center gap-3">
            <label className="space-y-1 text-xs font-medium">Data<Input type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setShowHistory(false); }} /></label>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />Histórico completo</label>
          </div>
        </div>
        <div className="space-y-2">
          {visibleAppointments.map((appointment) => (
            <div key={appointment.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary text-primary-foreground"><span className="text-lg font-bold">{appointment.time}</span></div>
              <div className="min-w-0 flex-1"><p className="font-medium">{appointment.clientName}</p><p className="text-sm text-muted-foreground">{appointment.service} · {appointment.professional}</p><p className="text-xs text-muted-foreground">{new Date(`${appointment.date}T00:00:00`).toLocaleDateString('pt-BR')}</p></div>
              <Badge variant="outline" className={appointment.paymentStatus === 'paid' || appointment.status === 'completed' ? 'rounded-full border-emerald-200/60 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700' : appointment.status === 'cancelled' ? 'rounded-full border-rose-200/70 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700' : appointment.status === 'pending' ? 'rounded-full border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700' : 'rounded-full border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600'}>{statusLabel(appointment)}</Badge>
              <Button type="button" size="icon" variant="ghost" onClick={() => setDraft({ ...appointment })} aria-label={`Editar agendamento de ${appointment.clientName}`}><Pencil className="h-4 w-4" /></Button>
            </div>
          ))}
          {!visibleAppointments.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento nesta data.</p>}
        </div>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar agendamento</DialogTitle><DialogDescription>Atualize os dados do atendimento e seu status.</DialogDescription></DialogHeader>
          {draft && <div className="grid gap-3 py-2 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Cliente<Input value={draft.clientName} onChange={(event) => setDraft({ ...draft, clientName: event.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">WhatsApp<Input value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Serviço<select value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">Profissional<select value={draft.professional} onChange={(event) => setDraft({ ...draft, professional: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="Qualquer profissional">Qualquer profissional</option>{professionals.map((professional) => <option key={professional.id} value={professional.name}>{professional.name}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">Data<Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Horário<Input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">Status<select value={draft.status ?? 'confirmed'} onChange={(event) => setDraft({ ...draft, status: event.target.value as AppointmentStatus })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label>
            <p className="text-xs text-muted-foreground sm:col-span-2">Pagamento: {draft.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}. O status de pagamento é atualizado pelo caixa.</p>
          </div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button><Button type="button" onClick={saveAppointment}>Salvar alterações</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
