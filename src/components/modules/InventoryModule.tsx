import { useState } from 'react';
import { Package, Plus, Trash2, AlertTriangle, Boxes, History } from 'lucide-react';
import { products as initialProducts, formatCurrency } from '@/mockData';
import { useApp } from '@/store';
import type { InventoryMovement, Product } from '@/types';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { getUniqueInventoryCategories, resolveInventoryCategory } from '@/lib/inventoryCategories';

const NEW_CATEGORY_OPTION = '__new_category__';

export function InventoryModule() {
  const { selectedEstablishment } = useApp();
  const defaultProducts = selectedEstablishment?.slug === 'mercadinho-central' ? initialProducts : [];
  const [items, setItems] = usePersistentState<Product[]>(
    `inventory:${selectedEstablishment?.id ?? 'default'}`,
    defaultProducts,
  );
  const [movements, setMovements] = usePersistentState<InventoryMovement[]>(
    `inventory-movements:${selectedEstablishment?.id ?? 'default'}`,
    [],
  );
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [stock, setStock] = useState('');
  const [minimumStock, setMinimumStock] = useState('5');
  const [categoryChoice, setCategoryChoice] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState('un');
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [adjustmentAmounts, setAdjustmentAmounts] = useState<Record<string, string>>({});
  const [stockDecreaseProductId, setStockDecreaseProductId] = useState<string | null>(null);
  const [stockDecreaseReason, setStockDecreaseReason] = useState('');

  const filtered = items.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );
  const categoryOptions = getUniqueInventoryCategories(items.map((item) => item.category));

  const thresholdFor = (product: Product) => product.minimumStock ?? 24;
  const lowStock = items.filter((product) => product.stock > 0 && product.stock <= thresholdFor(product));
  const outOfStock = items.filter((product) => product.stock <= 0);

  const addProduct = () => {
    const parsedPrice = Number(price);
    const parsedUnitCost = unitCost.trim() ? Number(unitCost) : undefined;
    const parsedStock = Number(stock);
    const parsedMinimumStock = Number(minimumStock);
    if (!name.trim() || price === '' || stock === '' || minimumStock === '' || !unit.trim()) {
      toast.error('Preencha nome, preço, estoque, unidade e limite de alerta');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0
      || !Number.isFinite(parsedStock) || parsedStock < 0
      || !Number.isFinite(parsedMinimumStock) || parsedMinimumStock < 0) {
      toast.error('Informe valores válidos e não negativos para preço e estoque');
      return;
    }
    if (parsedUnitCost !== undefined && (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0)) {
      toast.error('O custo unitário deve ser um valor maior ou igual a zero');
      return;
    }
    if (categoryChoice === NEW_CATEGORY_OPTION && !newCategory.trim()) {
      toast.error('Informe o nome da nova categoria');
      return;
    }
    const requestedCategory = categoryChoice === NEW_CATEGORY_OPTION
      ? newCategory.trim()
      : categoryChoice || 'Geral';
    const productCategory = resolveInventoryCategory(requestedCategory, categoryOptions);
    const id = globalThis.crypto?.randomUUID?.() ?? `pr${Date.now()}`;
    setItems((prev) => [...prev, {
      id,
      name: name.trim(),
      price: parsedPrice,
      unitCost: parsedUnitCost === undefined ? undefined : Math.round(parsedUnitCost * 100) / 100,
      stock: parsedStock,
      minimumStock: parsedMinimumStock,
      category: productCategory,
      unit: unit.trim(),
    }]);
    if (parsedStock > 0) {
      setMovements((previous) => [...previous, {
        id: globalThis.crypto?.randomUUID?.() ?? `inventory-${Date.now()}`,
        productId: id,
        productName: name.trim(),
        type: 'restock',
        quantity: parsedStock,
        unit: unit.trim(),
        createdAt: new Date().toISOString(),
      }]);
    }
    setName(''); setPrice(''); setUnitCost(''); setStock(''); setMinimumStock('5'); setCategoryChoice(''); setNewCategory(''); setUnit('un');
    toast.success('Produto cadastrado!');
  };

  const removeProduct = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const adjustStock = (id: string, direction: -1 | 1, reason?: string): boolean => {
    const product = items.find((item) => item.id === id);
    const quantity = Number(adjustmentAmounts[id] || 1);
    if (!product) return false;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Informe uma quantidade de ajuste maior que zero');
      return false;
    }
    if (direction < 0 && product.stock < quantity) {
      toast.error('O ajuste não pode deixar o estoque negativo');
      return false;
    }
    if (direction < 0 && !reason?.trim()) {
      toast.error('Informe o motivo da perda ou ajuste');
      return false;
    }
    const delta = quantity * direction;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, stock: item.stock + delta } : item));
    setMovements((previous) => [...previous, {
      id: globalThis.crypto?.randomUUID?.() ?? `inventory-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      type: delta > 0 ? 'restock' : 'adjustment',
      quantity,
      unit: product.unit,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      createdAt: new Date().toISOString(),
    }]);
    return true;
  };

  const confirmStockDecrease = () => {
    if (!stockDecreaseProductId || !adjustStock(stockDecreaseProductId, -1, stockDecreaseReason)) return;
    setStockDecreaseProductId(null);
    setStockDecreaseReason('');
  };

  const updateMinimumStock = (productId: string) => {
    const draft = thresholdDrafts[productId];
    const value = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(value) || value < 0) {
      toast.error('O limite de alerta deve ser um número igual ou maior que zero');
      setThresholdDrafts((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      return;
    }
    setItems((previous) => previous.map((product) => product.id === productId
      ? { ...product, minimumStock: value }
      : product));
    setThresholdDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const updateProductCost = (productId: string) => {
    const draft = costDrafts[productId];
    if (draft === undefined) return;
    const value = draft.trim() === '' ? undefined : Number(draft);
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      toast.error('O custo unitário deve ser um valor maior ou igual a zero');
      setCostDrafts((current) => ({ ...current, [productId]: String(items.find((item) => item.id === productId)?.unitCost ?? '') }));
      return;
    }
    setItems((previous) => previous.map((product) => product.id === productId
      ? { ...product, unitCost: value === undefined ? undefined : Math.round(value * 100) / 100 }
      : product));
    setCostDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const recentMovements = [...movements].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 10);
  const movementLabel: Record<InventoryMovement['type'], string> = {
    sale: 'Venda',
    restock: 'Entrada',
    adjustment: 'Ajuste / saída',
    return: 'Estorno de venda',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Controle de Estoque
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
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Produtos sem estoque</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{outOfStock.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Add product */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Cadastrar Produto</h3>
        <div className="grid grid-cols-1 sm:grid-cols-8 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Arroz 5kg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço (R$)</Label>
            <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="32.90" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Custo unitário (R$)</Label>
            <Input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estoque</Label>
            <Input type="number" min="0" step="0.01" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="48" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="un, kg, L..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Alertar com estoque em</Label>
            <Input type="number" min="0" step="0.01" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <select
              aria-label="Categoria do produto"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={categoryChoice}
              onChange={(event) => {
                setCategoryChoice(event.target.value);
                if (event.target.value !== NEW_CATEGORY_OPTION) setNewCategory('');
              }}
            >
              <option value="">Geral (padrão)</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value={NEW_CATEGORY_OPTION}>＋ Nova categoria...</option>
            </select>
            {categoryChoice === NEW_CATEGORY_OPTION && (
              <Input
                aria-label="Nome da nova categoria"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="Ex.: Mercearia"
                maxLength={60}
              />
            )}
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
                <TableHead>Custo unitário</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Alerta abaixo de</TableHead>
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
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Custo unitário para ${p.name}`}
                      placeholder="Não informado"
                      value={costDrafts[p.id] ?? (p.unitCost === undefined ? '' : String(p.unitCost))}
                      onFocus={() => setCostDrafts((current) => ({ ...current, [p.id]: String(p.unitCost ?? '') }))}
                      onChange={(event) => setCostDrafts((current) => ({ ...current, [p.id]: event.target.value }))}
                      onBlur={() => updateProductCost(p.id)}
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" aria-label={`Registrar saída de estoque para ${p.name}`} className="h-7 w-7" onClick={() => {
                        setStockDecreaseProductId(p.id);
                        setStockDecreaseReason('');
                      }}>
                        <span className="text-xs">−</span>
                      </Button>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        aria-label={`Quantidade de ajuste para ${p.name}`}
                        value={adjustmentAmounts[p.id] ?? '1'}
                        onChange={(event) => setAdjustmentAmounts((current) => ({ ...current, [p.id]: event.target.value }))}
                        className="h-7 w-16 px-1 text-center"
                      />
                      <span className={`min-w-16 text-center font-medium ${p.stock <= thresholdFor(p) ? 'text-amber-600' : ''}`}>
                        {p.stock} {p.unit}
                      </span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustStock(p.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      {p.stock <= thresholdFor(p) && (
                        <Badge variant="outline" className="ml-1 rounded-full border border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          {p.stock <= 0 ? 'Sem estoque' : 'Baixo'}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Limite de alerta para ${p.name}`}
                      value={thresholdDrafts[p.id] ?? thresholdFor(p)}
                      onFocus={() => setThresholdDrafts((current) => ({ ...current, [p.id]: String(thresholdFor(p)) }))}
                      onChange={(event) => setThresholdDrafts((current) => ({ ...current, [p.id]: event.target.value }))}
                      onBlur={() => {
                        if (thresholdDrafts[p.id] !== undefined) updateMinimumStock(p.id);
                      }}
                      className="w-24"
                    />
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
      <Dialog open={stockDecreaseProductId !== null} onOpenChange={(open) => {
        if (!open) {
          setStockDecreaseProductId(null);
          setStockDecreaseReason('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar saída de estoque</DialogTitle>
            <DialogDescription>
              {items.find((item) => item.id === stockDecreaseProductId)?.name}
              {' · '}
              Quantidade: {stockDecreaseProductId ? adjustmentAmounts[stockDecreaseProductId] ?? '1' : ''}
              . Informe o motivo para registrar esta perda ou correção no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="stock-decrease-reason">Motivo obrigatório</Label>
            <Textarea
              id="stock-decrease-reason"
              autoFocus
              value={stockDecreaseReason}
              onChange={(event) => setStockDecreaseReason(event.target.value)}
              placeholder="Ex.: produto quebrado, vencido, perda ou correção de inventário"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setStockDecreaseProductId(null);
              setStockDecreaseReason('');
            }}>
              Cancelar
            </Button>
            <Button onClick={confirmStockDecrease} disabled={!stockDecreaseReason.trim()}>
              Confirmar saída
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <History className="h-4 w-4 text-primary" />
          <div><h3 className="font-semibold">Movimentações recentes</h3><p className="text-xs text-muted-foreground">Últimas 10 entradas, ajustes, vendas e estornos.</p></div>
        </div>
        {recentMovements.length
          ? <div className="divide-y px-4">
            {recentMovements.map((movement) => (
              <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{movement.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {movementLabel[movement.type]} · {new Date(movement.createdAt).toLocaleString('pt-BR')}
                    {movement.reason ? ` · Motivo: ${movement.reason}` : ''}
                  </p>
                </div>
                <span className={movement.type === 'sale' || movement.type === 'adjustment' ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>
                  {movement.type === 'sale' || movement.type === 'adjustment' ? '−' : '+'}{movement.quantity} {movement.unit}
                </span>
              </div>
            ))}
          </div>
          : <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}
      </Card>
    </div>
  );
}
