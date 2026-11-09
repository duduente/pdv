import { useState } from 'react';
import {
  UtensilsCrossed, Plus, Trash2, Copy, Check, ExternalLink,
  MessageCircle, Image as ImageIcon, DollarSign, Pencil, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import { useApp } from '@/store';
import { menuItems as initialItems, menuCategories as initialCats, formatCurrency } from '@/mockData';
import type { MenuItem, MenuCategory } from '@/types';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export function MenuModule() {
  const { selectedEstablishment, viewPublicPage } = useApp();
  const [tab, setTab] = useState('items');

  if (!selectedEstablishment) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            Cardápio Digital
          </h1>
          <p className="text-muted-foreground">Cadastre itens e receba pedidos via WhatsApp</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyLinkButton slug={selectedEstablishment.slug} />
          <Button size="sm" onClick={() => viewPublicPage(selectedEstablishment.slug, 'menu')}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Ver cardápio público
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="items">Itens do Cardápio</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <ItemsTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const link = `cardapio/${slug}`;
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

function ItemsTab() {
  const { selectedEstablishment } = useApp();
  const isBurgerHouse = selectedEstablishment?.slug === 'burger-house';
  const [items, setItems] = usePersistentState<MenuItem[]>(
    `menu-items:${selectedEstablishment?.id ?? 'default'}`,
    isBurgerHouse ? initialItems : [],
  );
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [cat, setCat] = useState(initialCats[0]?.name ?? '');
  const [image, setImage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const clearForm = () => {
    setEditingId(null); setName(''); setDesc(''); setPrice(''); setImage(''); setCat(initialCats[0]?.name ?? '');
    setEditorOpen(false);
  };

  const addItem = () => {
    setEditingId(null); setName(''); setDesc(''); setPrice(''); setImage(''); setCat(initialCats[0]?.name ?? '');
    setEditorOpen(true);
  };

  const saveItem = () => {
    const numericPrice = Number(price);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0) { toast.error('Informe nome e um preço maior que zero'); return; }
    const nextItem: MenuItem = {
      id: editingId ?? `m${Date.now()}`,
      name: name.trim(),
      description: desc.trim(),
      price: Math.round(numericPrice * 100) / 100,
      category: cat.trim(),
      image: image.trim(),
    };
    setItems((current) => editingId
      ? current.map((item) => item.id === editingId ? nextItem : item)
      : [...current, nextItem]);
    clearForm();
    toast.success(editingId ? 'Item atualizado!' : 'Item adicionado!');
  };

  const submitItem = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveItem();
  };

  const editItem = (item: MenuItem) => {
    setEditingId(item.id); setName(item.name); setDesc(item.description); setPrice(String(item.price)); setCat(item.category); setImage(item.image);
    setEditorOpen(true);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setItems((current) => {
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) clearForm();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="font-semibold">Itens do cardápio</h3><p className="text-sm text-muted-foreground">Edite valores e detalhes sem sair da lista.</p></div>
        <Button type="button" onClick={addItem}><Plus className="mr-1 h-4 w-4" />Novo item</Button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <Card key={item.id} className="p-3 flex flex-wrap items-center gap-3 hover:shadow-sm transition-shadow">
            <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted shrink-0">
              {item.image ? (
                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{item.name}</p>
                <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">{item.description}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <span className="font-bold text-primary">{formatCurrency(item.price)}</span>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label={`Mover ${item.name} para cima`}><ChevronUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label={`Mover ${item.name} para baixo`}><ChevronDown className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" size="sm" onClick={() => editItem(item)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(item.id)} aria-label={`Excluir ${item.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={editorOpen} onOpenChange={(open) => { if (!open) clearForm(); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar item do cardápio' : 'Adicionar item ao cardápio'}</DialogTitle>
            <DialogDescription>As alterações serão refletidas na lista do cardápio e no caixa desta loja.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitItem} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Nome<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Cheeseburger" required /></label>
              <label className="space-y-1 text-sm font-medium">Preço (R$)<Input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="28.90" required /></label>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">Descrição<Input value={desc} onChange={(event) => setDesc(event.target.value)} placeholder="Ingredientes e detalhes" /></label>
              <label className="space-y-1 text-sm font-medium">Categoria<Input value={cat} onChange={(event) => setCat(event.target.value)} placeholder="Burgers" /></label>
              <label className="space-y-1 text-sm font-medium">URL da imagem<Input type="url" value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://..." /></label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={clearForm}><X className="mr-1 h-4 w-4" />Cancelar</Button>
              <Button type="submit">{editingId ? 'Salvar alterações' : 'Adicionar item'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoriesTab() {
  const { selectedEstablishment } = useApp();
  const isBurgerHouse = selectedEstablishment?.slug === 'burger-house';
  const [cats, setCats] = usePersistentState<MenuCategory[]>(
    `menu-categories:${selectedEstablishment?.id ?? 'default'}`,
    isBurgerHouse ? initialCats : [],
  );
  const [, setItems] = usePersistentState<MenuItem[]>(
    `menu-items:${selectedEstablishment?.id ?? 'default'}`,
    isBurgerHouse ? initialItems : [],
  );
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = () => {
    const normalizedName = name.trim();
    if (!normalizedName) { toast.error('Informe o nome'); return; }
    if (cats.some((category) => category.name.toLowerCase() === normalizedName.toLowerCase() && category.id !== editingId)) {
      toast.error('Já existe uma categoria com esse nome'); return;
    }
    if (editingId) {
      const previousName = cats.find((category) => category.id === editingId)?.name;
      setCats((current) => current.map((category) => category.id === editingId ? { ...category, name: normalizedName } : category));
      if (previousName) setItems((current) => current.map((item) => item.category === previousName ? { ...item, category: normalizedName } : item));
      toast.success('Categoria atualizada!');
    } else {
      setCats((current) => [...current, { id: `c${Date.now()}`, name: normalizedName }]);
      toast.success('Categoria adicionada!');
    }
    setEditingId(null); setName('');
  };

  const remove = (id: string) => {
    const category = cats.find((item) => item.id === id);
    setCats((prev) => prev.filter((c) => c.id !== id));
    if (category) setItems((current) => current.map((item) => item.category === category.name ? { ...item, category: '' } : item));
    if (editingId === id) { setEditingId(null); setName(''); }
  };

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= cats.length) return;
    setCats((current) => {
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5">
        <h3 className="font-semibold mb-4">{editingId ? 'Editar Categoria' : 'Adicionar Categoria'}</h3>
        <div className="flex gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sobremesas" />
          <Button onClick={save} size="sm">
            {editingId ? <Pencil className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {editingId ? 'Salvar' : 'Adicionar'}
          </Button>
          {editingId && <Button type="button" size="icon" variant="outline" onClick={() => { setEditingId(null); setName(''); }} aria-label="Cancelar edição"><X className="h-4 w-4" /></Button>}
        </div>
      </Card>
      <div className="space-y-2">
        {cats.map((c, index) => (
          <Card key={c.id} className="flex items-center gap-2 p-3">
            <span className="min-w-0 flex-1 font-medium">{c.name}</span>
            <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover categoria ${c.name} para cima`}><ChevronUp className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" disabled={index === cats.length - 1} onClick={() => move(index, 1)} aria-label={`Mover categoria ${c.name} para baixo`}><ChevronDown className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => { setEditingId(c.id); setName(c.name); }} aria-label={`Editar categoria ${c.name}`}><Pencil className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => remove(c.id)} aria-label={`Excluir categoria ${c.name}`}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function WhatsAppTab() {
  const { selectedEstablishment } = useApp();
  const [whatsapp, setWhatsapp] = useState(selectedEstablishment?.whatsapp ?? '');

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          WhatsApp para Pedidos
        </h3>
        <div className="space-y-1">
          <Label>Número do WhatsApp</Label>
          <Input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="5511999999999"
          />
          <p className="text-xs text-muted-foreground">
            Os pedidos do cardápio digital serão enviados para este número com todos os itens e o total.
          </p>
        </div>
        <Button onClick={() => toast.success('WhatsApp configurado!')}>
          Salvar
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Como Funciona o Fluxo de Pedidos
        </h3>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2"><Badge variant="outline">1</Badge> O cliente acessa seu link público do cardápio</li>
          <li className="flex gap-2"><Badge variant="outline">2</Badge> Adiciona itens à sacola e revisa o pedido</li>
          <li className="flex gap-2"><Badge variant="outline">3</Badge> Confirma e o app monta uma mensagem com todos os itens</li>
          <li className="flex gap-2"><Badge variant="outline">4</Badge> O cliente é direcionado para o WhatsApp do seu estabelecimento</li>
        </ol>
      </Card>
    </div>
  );
}
