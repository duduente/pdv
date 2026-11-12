import { useState } from 'react';
import { CalendarClock, ClipboardList, Minus, Plus, Receipt, Trash2, Users } from 'lucide-react';
import { useApp } from '@/store';
import { menuItems as initialMenuItems, formatCurrency } from '@/mockData';
import { usePersistentState } from '@/hooks/usePersistentState';
import type { Command, MenuItem, SaleItem, TableReservation } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { createTableReservation, sortTableReservations } from '@/lib/tableReservations';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `command-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDefaultReservationDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function getLocalDateTimeNow() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CommandsModule() {
  const { selectedEstablishment } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [commands, setCommands, commandsLoaded] = usePersistentState<Command[]>(`commands:${establishmentId}`, []);
  const [menuItems] = usePersistentState<MenuItem[]>(
    `menu-items:${establishmentId}`,
    selectedEstablishment?.slug === 'burger-house' ? initialMenuItems : [],
  );
  const [selectedId, setSelectedId] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [reservationDateTime, setReservationDateTime] = useState(getDefaultReservationDateTime);
  const [reservationCustomer, setReservationCustomer] = useState('');
  const [reservationPhone, setReservationPhone] = useState('');
  const [reservationPartySize, setReservationPartySize] = useState('2');
  const [reservationTable, setReservationTable] = useState('');
  const [reservationNotes, setReservationNotes] = useState('');
  const selectedCommand = commands.find((command) => command.id === selectedId && command.status === 'open')
    ?? commands.find((command) => command.status === 'open');
  const openCommands = commands.filter((command) => command.status === 'open').sort((a, b) => a.number - b.number);
  const total = selectedCommand?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;
  const [reservations, setReservations] = usePersistentState<TableReservation[]>(`table-reservations:${establishmentId}`, []);
  const sortedReservations = sortTableReservations(reservations);

  if (!selectedEstablishment) return null;
  if (!commandsLoaded) return <p>Carregando comandas...</p>;

  const createCommand = () => {
    const command: Command = {
      id: createId(),
      establishmentId,
      number: commands.reduce((max, entry) => Math.max(max, entry.number), 0) + 1,
      createdAt: new Date().toISOString(),
      items: [],
      total: 0,
      status: 'open',
    };
    setCommands((current) => [...current, command]);
    setSelectedId(command.id);
    toast.success(`Comanda ${command.number} criada`);
  };

  const addItem = (item: SaleItem) => {
    if (!selectedCommand) {
      toast.error('Crie ou selecione uma comanda aberta');
      return;
    }
    setCommands((current) => current.map((command) => {
      if (command.id !== selectedCommand.id) return command;
      const existing = command.items.find((entry) => entry.productId === item.productId);
      const items = existing
        ? command.items.map((entry) => entry.productId === item.productId ? { ...entry, quantity: entry.quantity + 1 } : entry)
        : [...command.items, item];
      return { ...command, items, total: items.reduce((sum, entry) => sum + entry.price * entry.quantity, 0) };
    }));
  };

  const updateQuantity = (item: SaleItem, delta: number) => {
    if (!selectedCommand) return;
    setCommands((current) => current.map((command) => {
      if (command.id !== selectedCommand.id) return command;
      const items = command.items
        .map((entry) => entry.productId === item.productId
          ? { ...entry, quantity: entry.quantity + delta }
          : entry)
        .filter((entry) => entry.quantity > 0);
      return { ...command, items, total: items.reduce((sum, entry) => sum + entry.price * entry.quantity, 0) };
    }));
  };

  const addManualItem = () => {
    const price = Number(itemPrice);
    if (!itemName.trim() || !Number.isFinite(price) || price <= 0) {
      toast.error('Informe a descrição e um valor maior que zero');
      return;
    }
    addItem({
      productId: createId(),
      name: itemName.trim(),
      price: Math.round(price * 100) / 100,
      quantity: 1,
    });
    setItemName('');
    setItemPrice('');
  };

  const removeCommand = (command: Command) => {
    if (!window.confirm(`Excluir a comanda ${command.number}?`)) return;
    setCommands((current) => current.filter((entry) => entry.id !== command.id));
    if (selectedId === command.id) setSelectedId('');
    toast.success(`Comanda ${command.number} excluída`);
  };

  const addReservation = () => {
    try {
      const reservation = createTableReservation({
        scheduledAt: reservationDateTime,
        customerName: reservationCustomer,
        phone: reservationPhone,
        partySize: Number(reservationPartySize),
        tableLabel: reservationTable,
        notes: reservationNotes,
      }, establishmentId, createId(), new Date().toISOString());
      setReservations((current) => [...current, reservation]);
      setReservationCustomer('');
      setReservationPhone('');
      setReservationPartySize('2');
      setReservationTable('');
      setReservationNotes('');
      setReservationDateTime(getDefaultReservationDateTime());
      toast.success('Reserva registrada');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Não foi possível registrar a reserva.');
    }
  };

  const updateReservationStatus = (reservation: TableReservation, status: TableReservation['status']) => {
    setReservations((current) => current.map((entry) => entry.id === reservation.id ? { ...entry, status } : entry));
    toast.success(status === 'arrived' ? 'Cliente marcado como chegou' : 'Reserva cancelada');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="h-6 w-6 text-primary" />Comandas</h1>
          <p className="text-muted-foreground">Gerencie comandas e reservas do estabelecimento.</p>
        </div>
      </div>

      <Tabs defaultValue="commands">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="commands">Comandas</TabsTrigger>
            <TabsTrigger value="reservations">Reservas de mesa</TabsTrigger>
          </TabsList>
          <TabsContent value="commands" className="m-0">
            <Button type="button" onClick={createCommand}><Plus className="mr-2 h-4 w-4" />Nova comanda</Button>
          </TabsContent>
        </div>
        <TabsContent value="commands" className="mt-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.65fr)_1.35fr]">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Comandas abertas</h2>
          {!openCommands.length && <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma comanda aberta.</p>}
          {openCommands.map((command) => (
            <button
              type="button"
              key={command.id}
              onClick={() => setSelectedId(command.id)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${selectedCommand?.id === command.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                Comanda {command.number}
                <Badge variant="secondary">{formatCurrency(command.total)}</Badge>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{command.items.length} item(ns)</span>
            </button>
          ))}
          {commands.some((command) => command.status === 'paid') && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Finalizadas</p>
              {commands.filter((command) => command.status === 'paid').sort((a, b) => b.number - a.number).map((command) => (
                <div key={command.id} className="flex items-center justify-between py-1 text-sm text-muted-foreground">
                  <span>Comanda {command.number}</span><span>{formatCurrency(command.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h2 className="font-semibold">{selectedCommand ? `Consumo · Comanda ${selectedCommand.number}` : 'Selecione uma comanda'}</h2><p className="text-sm text-muted-foreground">Toque em um item para adicioná-lo ao consumo.</p></div>
              {selectedCommand && <Button type="button" size="sm" variant="outline" onClick={() => removeCommand(selectedCommand)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>}
            </div>
            {!!menuItems.length && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {menuItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={!selectedCommand}
                  onClick={() => addItem({ productId: `menu:${item.id}`, name: item.name, price: item.price, quantity: 1 })}
                  className="flex min-h-16 items-center justify-between gap-2 rounded-md border p-3 text-left hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                >
                  <span className="text-sm font-medium">{item.name}</span><span className="shrink-0 text-sm font-semibold text-primary">{formatCurrency(item.price)}</span>
                </button>
              ))}
            </div>}
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <Input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Outro item ou consumo" disabled={!selectedCommand} />
              <CurrencyInput value={Number(itemPrice) || 0} onValueChange={(value) => setItemPrice(value === null ? '' : String(value))} placeholder="Valor (R$)" disabled={!selectedCommand} />
              <Button type="button" variant="outline" onClick={addManualItem} disabled={!selectedCommand}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4" />Itens consumidos</h2>
            {!selectedCommand?.items.length && <p className="py-5 text-center text-sm text-muted-foreground">Nenhum consumo registrado nesta comanda.</p>}
            {selectedCommand?.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 border-b py-2 last:border-0">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{formatCurrency(item.price)} cada</p></div>
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item, -1)} aria-label={`Diminuir ${item.name}`}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item, 1)} aria-label={`Aumentar ${item.name}`}><Plus className="h-3 w-3" /></Button>
                <span className="w-20 text-right text-sm font-semibold">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-lg font-bold"><span>Total da comanda</span><span className="text-primary">{formatCurrency(total)}</span></div>
            <p className="mt-2 text-xs text-muted-foreground">Para receber o pagamento, abra o PDV e selecione esta comanda na origem da venda.</p>
          </Card>
        </div>
      </div>
        </TabsContent>
        <TabsContent value="reservations" className="mt-4 space-y-4">
          <Card className="space-y-4 p-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />Nova reserva</h2>
              <p className="text-sm text-muted-foreground">Registre o horário e a quantidade de pessoas; a mesa é opcional.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-sm font-medium">Data e horário
                <Input type="datetime-local" value={reservationDateTime} min={getLocalDateTimeNow()} onChange={(event) => setReservationDateTime(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm font-medium">Nome do cliente
                <Input value={reservationCustomer} onChange={(event) => setReservationCustomer(event.target.value)} maxLength={100} />
              </label>
              <label className="space-y-1 text-sm font-medium">Telefone
                <Input type="tel" value={reservationPhone} onChange={(event) => setReservationPhone(event.target.value)} maxLength={30} />
              </label>
              <label className="space-y-1 text-sm font-medium">Quantidade de pessoas
                <Input type="number" min="1" step="1" value={reservationPartySize} onChange={(event) => setReservationPartySize(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm font-medium">Mesa (opcional)
                <Input value={reservationTable} onChange={(event) => setReservationTable(event.target.value)} placeholder="Ex.: Mesa 4" maxLength={40} />
              </label>
              <label className="space-y-1 text-sm font-medium">Observações (opcional)
                <Input value={reservationNotes} onChange={(event) => setReservationNotes(event.target.value)} placeholder="Ex.: aniversário, cadeira infantil" maxLength={200} />
              </label>
            </div>
            <Button type="button" onClick={addReservation}><Plus className="mr-2 h-4 w-4" />Registrar reserva</Button>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Reservas</h2>
              <Badge variant="secondary">{reservations.filter((reservation) => reservation.status === 'confirmed').length} confirmadas</Badge>
            </div>
            {!sortedReservations.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma reserva registrada.</p>}
            <div className="divide-y">
              {sortedReservations.map((reservation) => {
                const scheduledAt = new Date(reservation.scheduledAt);
                const status = reservation.status === 'confirmed'
                  ? { label: 'Confirmada', className: 'border-blue-300 bg-blue-50 text-blue-800' }
                  : reservation.status === 'arrived'
                    ? { label: 'Cliente chegou', className: 'border-emerald-300 bg-emerald-50 text-emerald-800' }
                    : { label: 'Cancelada', className: 'border-slate-300 bg-slate-100 text-slate-700' };
                return (
                  <div key={reservation.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{reservation.customerName}</p>
                        <Badge variant="outline" className={status.className}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {scheduledAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        {' · '}
                        <Users className="h-3.5 w-3.5" /> {reservation.partySize} pessoas
                        {reservation.tableLabel ? ` · ${reservation.tableLabel}` : ''}
                      </p>
                      {reservation.phone && <p className="text-sm text-muted-foreground">Telefone: {reservation.phone}</p>}
                      {reservation.notes && <p className="text-sm text-muted-foreground">Observação: {reservation.notes}</p>}
                    </div>
                    {reservation.status === 'confirmed' && (
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => updateReservationStatus(reservation, 'arrived')}>Marcar chegada</Button>
                        <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => updateReservationStatus(reservation, 'cancelled')}>Cancelar</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
