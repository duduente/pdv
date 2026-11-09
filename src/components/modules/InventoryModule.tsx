import { useState } from 'react';
import { Package, Plus, Trash2, AlertTriangle, Boxes } from 'lucide-react';
import { products as initialProducts, formatCurrency } from '@/mockData';
import { useApp } from '@/store';
import type { Product } from '@/types';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

export function InventoryModule() {
  const { selectedEstablishment } = useApp();
  const defaultProducts = selectedEstablishment?.slug === 'mercadinho-central' ? initialProducts : [];
  const [items, setItems] = usePersistentState<Product[]>(
    `inventory:${selectedEstablishment?.id ?? 'default'}`,
    defaultProducts,
  );
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState('');
  const unit = 'un';

  const filtered = items.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = items.filter((p) => p.stock < 25);

  const addProduct = () => {
    if (!name || !price || !stock) { toast.error('Preencha os campos obrigatórios'); return; }
    setItems((prev) => [...prev, {
      id: `pr${Date.now()}`,
      name,
      price: Number(price),
      stock: Number(stock),
      category: category || 'Geral',
      unit: unit || 'un',
    }]);
    setName(''); setPrice(''); setStock(''); setCategory('');
    toast.success('Produto cadastrado!');
  };

  const removeProduct = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const adjustStock = (id: string, delta: number) => {
    setItems((prev) => prev.map((p) =>
      p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p
    ));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Controle de Estoque & Clientes
        </h1>
        <p className="text-muted-foreground">Cadastre produtos e acompanhe o estoque</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de produtos</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{items.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Estoque baixo</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{lowStock.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unidades em estoque</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{items.reduce((s, i) => s + i.stock, 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Add product */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Cadastrar Produto</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Arroz 5kg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço (R$)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="32.90" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estoque</Label>
            <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="48" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mercearia" />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={addProduct}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar produto
        </Button>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <Input
            placeholder="Buscar produto ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.category}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{formatCurrency(p.price)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustStock(p.id, -1)}>
                        <span className="text-xs">−</span>
                      </Button>
                      <span className={`w-12 text-center font-medium ${p.stock < 25 ? 'text-amber-600' : ''}`}>
                        {p.stock} {p.unit}
                      </span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustStock(p.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      {p.stock < 25 && (
                        <Badge variant="outline" className="ml-1 rounded-full border border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          Baixo
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeProduct(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
