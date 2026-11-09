import { useState } from 'react';
import { ClipboardList, Minus, Plus, Receipt, Trash2 } from 'lucide-react';
import { useApp } from '@/store';
import { menuItems as initialMenuItems, formatCurrency } from '@/mockData';
import { usePersistentState } from '@/hooks/usePersistentState';
import type { Command, MenuItem, SaleItem } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `command-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CommandsModule() {
  const { selectedEstablishment } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const [commands, setCommands] = usePersistentState<Command[]>(`commands:${establishmentId}`, []);
  const [menuItems] = usePersistentState<MenuItem[]>(
    `menu-items:${establishmentId}`,
    selectedEstablishment?.slug === 'burger-house' ? initialMenuItems : [],
  );
  const [selectedId, setSelectedId] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const selectedCommand = commands.find((command) => command.id === selectedId && command.status === 'open')
    ?? commands.find((command) => command.status === 'open');
  const openCommands = commands.filter((command) => command.status === 'open').sort((a, b) => a.number - b.number);
  const total = selectedCommand?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;

  if (!selectedEstablishment) return null;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="h-6 w-6 text-primary" />Comandas</h1>
          <p className="text-muted-foreground">Registre o consumo e envie a comanda ao caixa para cobrança.</p>
        </div>
        <Button type="button" onClick={createCommand}><Plus className="mr-2 h-4 w-4" />Nova comanda</Button>
      </div>

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
              <Input type="number" min="0.01" step="0.01" value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} placeholder="Valor (R$)" disabled={!selectedCommand} />
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
    </div>
  );
}
