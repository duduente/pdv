import { useState } from 'react';
import {
  ArrowLeft, Check, Calendar, Clock, Scissors, User,
  MessageCircle, ChevronRight, ChevronLeft, Phone,
} from 'lucide-react';
import { useApp } from '@/store';
import { appointments as initialAppointments, professionals as initialProfessionals, services as initialServices, workingHours as initialHours, formatCurrency } from '@/mockData';
import type { Appointment, Professional, Service, WorkingHours } from '@/types';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STEPS = ['Serviço', 'Horário', 'Dados', 'Confirmação'] as const;

function createTimeSlots(start: string, end: string, interval: number) {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const slots: string[] = [];

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || interval <= 0) {
    return slots;
  }

  for (let minutes = startMinutes; minutes < endMinutes; minutes += interval) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }

  return slots;
}

export function PublicBookingPage() {
  const { selectedEstablishment, goBack } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const isBarbershop = selectedEstablishment?.slug === 'barbearia-estilo';
  const [services] = usePersistentState<Service[]>(`services:${establishmentId}`, isBarbershop ? initialServices : []);
  const [professionals] = usePersistentState<Professional[]>(`professionals:${establishmentId}`, isBarbershop ? initialProfessionals : []);
  const [appointments, setAppointments] = usePersistentState<Appointment[]>(`appointments:${establishmentId}`, isBarbershop ? initialAppointments : []);
  const [hours] = usePersistentState<WorkingHours[]>(
    `working-hours:${establishmentId}`,
    initialHours,
  );
  const [defaultDuration] = usePersistentState(
    `appointment-duration:${establishmentId}`,
    30,
  );
  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedPro, setSelectedPro] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [clientWhatsapp, setClientWhatsapp] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!selectedEstablishment) return null;
  const est = selectedEstablishment;
  const accent = est.theme.accentColor;

  const generateDates = () => {
    const dates: { label: string; value: string; dayName: string }[] = [];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const dayName = dayNames[d.getDay()];
      const wh = hours.find((w) => w.day === dayName);
      if (wh?.enabled) {
        dates.push({
          label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
          value: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`,
          dayName,
        });
      }
    }
    return dates;
  };
  const dates = generateDates();
  const selectedDayName = dates.find((date) => date.value === selectedDate)?.dayName;
  const selectedDayHours = hours.find((day) => day.day === selectedDayName);

  const canProceed = () => {
    if (step === 0) return selectedService !== null;
    if (step === 1) return selectedDate !== '' && selectedTime !== '';
    if (step === 2) return clientName.trim() !== '' && clientWhatsapp.trim() !== '';
    return true;
  };

  const handleConfirm = () => {
    if (!selectedService || appointments.some((appointment) => appointment.date === selectedDate && appointment.time === selectedTime)) {
      toast.error('Este horário acabou de ser reservado. Escolha outro horário.');
      setSelectedTime('');
      return;
    }
    const appointment: Appointment = {
      id: globalThis.crypto?.randomUUID?.() ?? `appointment-${Date.now()}`,
      clientName,
      service: selectedService.name,
      professional: selectedPro || 'Qualquer profissional',
      date: selectedDate,
      time: selectedTime,
      whatsapp: clientWhatsapp,
      status: 'confirmed',
      paymentStatus: 'unpaid',
    };
    setAppointments((current) => [...current, appointment]);
    setConfirmed(true);
    toast.success('Agendamento confirmado!');
  };

  const sendWhatsApp = () => {
    const msg = `Olá ${est.name}! Confirme meu agendamento:\n\n*Serviço:* ${selectedService?.name}\n*Profissional:* ${selectedPro || 'Qualquer'}\n*Data:* ${dates.find((d) => d.value === selectedDate)?.label}\n*Horário:* ${selectedTime}\n*Nome:* ${clientName}\n*WhatsApp:* ${clientWhatsapp}`;
    window.open(`https://wa.me/${est.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Card className="p-8 text-center animate-scale-in">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4"
              style={{ backgroundColor: accent }}
            >
              <Check className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-xl font-bold mb-2">Agendamento Confirmado!</h1>
            <p className="text-muted-foreground mb-6">
              {selectedService?.name} em {dates.find((d) => d.value === selectedDate)?.label} às {selectedTime}
            </p>
            <div className="rounded-lg border p-4 text-left space-y-2 mb-6">
              <InfoRow icon={Scissors} label="Serviço" value={selectedService?.name ?? ''} />
              <InfoRow icon={User} label="Profissional" value={selectedPro || 'Qualquer profissional'} />
              <InfoRow icon={Calendar} label="Data" value={dates.find((d) => d.value === selectedDate)?.label ?? ''} />
              <InfoRow icon={Clock} label="Horário" value={selectedTime} />
              <InfoRow icon={User} label="Nome" value={clientName} />
            </div>
            <Button className="w-full mb-2" style={{ backgroundColor: '#25D366' }} onClick={sendWhatsApp}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Receber aviso no WhatsApp
            </Button>
            <Button variant="outline" className="w-full" onClick={goBack}>
              Voltar ao painel
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 shadow-sm" style={{ backgroundColor: accent }}>
        <div className="max-w-md mx-auto flex items-center gap-3 text-white">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white font-bold">
              {est.theme.logo ? <img src={est.theme.logo} alt={`Logo de ${est.name}`} className="h-full w-full rounded-lg object-cover" /> : est.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold leading-tight">{est.name}</p>
              <p className="text-xs text-white/80">Agendamento Online</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-24">
        {/* Progress */}
        <div className="flex items-center justify-between mb-6 mt-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    i <= step ? 'text-white' : 'bg-muted text-muted-foreground'
                  )}
                  style={i <= step ? { backgroundColor: accent } : undefined}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn('text-[10px] font-medium', i <= step ? '' : 'text-muted-foreground')}>
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 flex-1 mx-1 rounded transition-colors', i < step ? 'bg-primary' : 'bg-muted')} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: Service */}
        {step === 0 && (
          <div className="space-y-3 animate-slide-up">
            <h2 className="text-lg font-bold">Escolha o serviço</h2>
            {services.map((s) => (
              <Card
                key={s.id}
                className={cn(
                  'p-4 cursor-pointer transition-all border-2',
                  selectedService?.id === s.id ? 'border-primary shadow-md' : 'border-transparent hover:border-muted'
                )}
                onClick={() => setSelectedService(s)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {s.duration} min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: accent }}>{formatCurrency(s.price)}</p>
                    {selectedService?.id === s.id && (
                      <Check className="h-4 w-4 text-primary ml-auto mt-1" />
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="space-y-4 animate-slide-up">
            <h2 className="text-lg font-bold">Escolha dia e horário</h2>
            <div>
              <Label className="text-xs text-muted-foreground mb-2">Profissional (opcional)</Label>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setSelectedPro('')}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm border transition-colors',
                    selectedPro === '' ? 'text-white border-transparent' : 'border-border hover:bg-muted'
                  )}
                  style={selectedPro === '' ? { backgroundColor: accent } : undefined}
                >
                  Qualquer
                </button>
                {professionals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPro(p.name)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm border transition-colors',
                      selectedPro === p.name ? 'text-white border-transparent' : 'border-border hover:bg-muted'
                    )}
                    style={selectedPro === p.name ? { backgroundColor: accent } : undefined}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2">Selecione o dia</Label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {dates.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDate(d.value)}
                    className={cn(
                      'flex flex-col items-center justify-center min-w-[60px] rounded-lg border-2 p-2 transition-all',
                      selectedDate === d.value ? 'text-white border-transparent' : 'border-border hover:border-muted'
                    )}
                    style={selectedDate === d.value ? { backgroundColor: accent } : undefined}
                  >
                    <span className="text-[10px]">{d.dayName.substring(0, 3)}</span>
                    <span className="text-lg font-bold">{d.label.split('/')[0]}</span>
                    <span className="text-[10px]">{new Date(`${d.value}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                  </button>
                ))}
              </div>
            </div>
            {selectedDate && (
              <div className="animate-fade-in">
                <Label className="text-xs text-muted-foreground mb-2">Horários disponíveis</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(selectedDayHours
                    ? createTimeSlots(selectedDayHours.start, selectedDayHours.end, defaultDuration)
                    : []
                  ).map((slot) => {
                    const taken = appointments.some((appointment) => appointment.date === selectedDate && appointment.time === slot);
                    return (
                      <button
                        key={slot}
                        disabled={taken}
                        onClick={() => setSelectedTime(slot)}
                        className={cn(
                          'rounded-lg border py-2 text-sm font-medium transition-colors',
                          taken
                            ? 'bg-muted text-muted-foreground line-through cursor-not-allowed'
                            : selectedTime === slot
                              ? 'text-white border-transparent'
                              : 'border-border hover:border-primary'
                        )}
                        style={selectedTime === slot && !taken ? { backgroundColor: accent } : undefined}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Client data */}
        {step === 2 && (
          <div className="space-y-4 animate-slide-up">
            <h2 className="text-lg font-bold">Seus dados</h2>
            <Card className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={clientWhatsapp}
                  onChange={(e) => setClientWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </Card>
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <p className="font-semibold mb-1">Resumo:</p>
              <InfoRow icon={Scissors} label="Serviço" value={selectedService?.name ?? ''} />
              <InfoRow icon={Calendar} label="Data" value={dates.find((d) => d.value === selectedDate)?.label ?? ''} />
              <InfoRow icon={Clock} label="Horário" value={selectedTime} />
              <InfoRow icon={User} label="Profissional" value={selectedPro || 'Qualquer'} />
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="space-y-4 animate-slide-up">
            <h2 className="text-lg font-bold">Confirme seu agendamento</h2>
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl text-white font-bold" style={{ backgroundColor: accent }}>
                  {est.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold">{est.name}</p>
                  <p className="text-xs text-muted-foreground">{est.whatsapp}</p>
                </div>
              </div>
              <div className="space-y-2 border-t pt-4">
                <InfoRow icon={Scissors} label="Serviço" value={selectedService?.name ?? ''} />
                <InfoRow icon={User} label="Profissional" value={selectedPro || 'Qualquer'} />
                <InfoRow icon={Calendar} label="Data" value={dates.find((d) => d.value === selectedDate)?.label ?? ''} />
                <InfoRow icon={Clock} label="Horário" value={selectedTime} />
                <InfoRow icon={User} label="Nome" value={clientName} />
                <InfoRow icon={Phone} label="WhatsApp" value={clientWhatsapp} />
                <div className="flex items-center justify-between border-t pt-2 mt-2">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg" style={{ color: accent }}>
                    {selectedService ? formatCurrency(selectedService.price) : '—'}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-4">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 0 && !confirmed && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          )}
          {step < 3 && !confirmed && (
            <Button
              className="flex-1"
              disabled={!canProceed()}
              onClick={() => setStep((s) => s + 1)}
              style={canProceed() ? { backgroundColor: accent } : undefined}
            >
              Continuar
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 3 && !confirmed && (
            <Button className="flex-1" onClick={handleConfirm} style={{ backgroundColor: accent }}>
              <Check className="h-4 w-4 mr-1" />
              Confirmar Agendamento
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
