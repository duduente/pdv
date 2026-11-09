import { useRef, useState } from 'react';
import {
  ArrowLeft, Plus, Minus, ShoppingBag, X, MessageCircle,
  Trash2, UtensilsCrossed, Check,
} from 'lucide-react';
import { useApp } from '@/store';
import { menuItems as initialItems, menuCategories as initialCategories, formatCurrency } from '@/mockData';
import type { CartItem, DeliverySettings, MenuCategory, MenuItem, MenuOrder, PaymentMethod, PaymentSplit } from '@/types';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { digitsOnly, formatPostalCode, lookupPostalAddress } from '@/lib/brazil';
import { PaymentDialog } from '@/components/modules/PaymentDialog';

export function PublicMenuPage() {
  const { selectedEstablishment, goBack } = useApp();
  const establishmentId = selectedEstablishment?.id ?? 'default';
  const isBurgerHouse = selectedEstablishment?.slug === 'burger-house';
  const [menuItems] = usePersistentState<MenuItem[]>(`menu-items:${establishmentId}`, isBurgerHouse ? initialItems : []);
  const [menuCategories] = usePersistentState<MenuCategory[]>(`menu-categories:${establishmentId}`, isBurgerHouse ? initialCategories : []);
  const [, setOrders] = usePersistentState<MenuOrder[]>(`menu-orders:${establishmentId}`, []);
  const [deliverySettings] = usePersistentState<DeliverySettings>(`delivery-settings:${establishmentId}`, { deliveryFee: 0 });
  const [activeCat, setActiveCat] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const postalCodeLookupId = useRef(0);
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');
  const paymentLabels: Record<PaymentMethod, string> = {
    dinheiro: 'Dinheiro',
    pix: 'Pix',
    credito: 'Cartão de crédito',
    debito: 'Cartão de débito',
    outro: 'Outro',
  };

  if (!selectedEstablishment) return null;
  const est = selectedEstablishment;
  const accent = est.theme.accentColor;

  const filtered = activeCat === 'all'
    ? menuItems
    : menuItems.filter((i) => i.category === activeCat);

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalWithDelivery = cartTotal + deliverySettings.deliveryFee;
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const searchPostalCode = async (value: string) => {
    const lookupId = ++postalCodeLookupId.current;
    const digits = digitsOnly(value);
    setPostalCode(formatPostalCode(value));
    if (digits.length !== 8) {
      setLookingUpPostalCode(false);
      return;
    }

    setLookingUpPostalCode(true);
    try {
      const foundAddress = await lookupPostalAddress(digits);
      if (lookupId === postalCodeLookupId.current) setAddress(foundAddress);
    } catch (reason) {
      if (lookupId === postalCodeLookupId.current) {
        toast.error(reason instanceof Error ? reason.message : 'Não foi possível consultar o CEP');
      }
    } finally {
      if (lookupId === postalCodeLookupId.current) setLookingUpPostalCode(false);
    }
  };

  const addToCart = (id: string, name: string, price: number, image: string) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        return prev.map((i) => i.id === id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id, name, price, quantity: 1, image }];
    });
    toast.success(`${name} adicionado à sacola`);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => i.id === id ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const startOrder = () => {
    if (!customerName.trim() || !address.trim() || !phone.trim() || !document.trim()) {
      toast.error('Preencha nome, endereço, telefone e CPF/CNPJ para continuar');
      return;
    }
    setPaymentDialogOpen(true);
  };

  const sendOrder = (splits: PaymentSplit[]) => {
    const items = cart.map((i) => `*${i.quantity}x* ${i.name} — ${formatCurrency(i.price * i.quantity)}`).join('\n');
    const paymentDescription = splits.map((split) => `${paymentLabels[split.method]}: ${formatCurrency(split.amount)}`).join(' + ');
    const msg = `*NOVO PEDIDO - ${est.name}*\n\n${items}\n\nEntrega: ${formatCurrency(deliverySettings.deliveryFee)}\n*Total: ${formatCurrency(totalWithDelivery)}*\n\nCliente: ${customerName.trim()}\nTelefone: ${phone.trim()}\nCEP: ${formatPostalCode(postalCode)}\nEndereço: ${address.trim()}\nPagamento informado: ${paymentDescription}`;
    window.open(`https://wa.me/${est.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    const order: MenuOrder = {
      id: globalThis.crypto?.randomUUID?.() ?? `order-${Date.now()}`,
      establishmentId: est.id,
      createdAt: new Date().toISOString(),
      items: cart.map((item) => ({ productId: item.id, name: item.name, price: item.price, quantity: item.quantity })),
      total: Math.round(cartTotal * 100) / 100,
      status: 'pending',
      channel: 'website',
      customerName: customerName.trim(),
      address: address.trim(),
      postalCode: digitsOnly(postalCode),
      phone: phone.trim(),
      document: digitsOnly(document),
      deliveryFee: Math.round(deliverySettings.deliveryFee * 100) / 100,
      paymentMethod: splits[0].method,
      paymentSplits: splits,
      deliveryStatus: 'production',
    };
    setOrders((previous) => [...previous, order]);
    setPaymentMethod(splits[0].method);
    setOrderSent(true);
    setCart([]);
    setCustomerName('');
    setAddress('');
    setPostalCode('');
    postalCodeLookupId.current += 1;
    setLookingUpPostalCode(false);
    setPhone('');
    setDocument('');
    setCheckoutOpen(false);
    setCartOpen(false);
    setTimeout(() => setOrderSent(false), 5000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 shadow-sm" style={{ backgroundColor: accent }}>
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 py-3 text-white">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white font-bold">
              {est.theme.logo ? <img src={est.theme.logo} alt={`Logo de ${est.name}`} className="h-full w-full rounded-lg object-cover" /> : est.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold leading-tight">{est.name}</p>
              <p className="text-xs text-white/80">Cardápio Digital</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto pb-24">
        {/* Category tabs */}
        <div className="sticky top-[57px] z-10 bg-gray-50 pt-3 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin px-4">
            <CatButton label="Todos" active={activeCat === 'all'} onClick={() => setActiveCat('all')} accent={accent} />
            {menuCategories.map((c) => (
              <CatButton
                key={c.id}
                label={c.name}
                active={activeCat === c.name}
                onClick={() => setActiveCat(c.name)}
                accent={accent}
              />
            ))}
          </div>
        </div>

        {/* Menu items */}
        <div className="px-4 space-y-3 mt-2">
          {filtered.map((item) => (
            <Card key={item.id} className="overflow-hidden flex gap-0 hover:shadow-md transition-shadow animate-fade-in">
              <div className="flex-1 p-3 flex flex-col justify-between">
                <div>
                  <p className="font-semibold text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold" style={{ color: accent }}>{formatCurrency(item.price)}</span>
                  <Button
                    size="sm"
                    className="h-8 px-3"
                    style={{ backgroundColor: accent }}
                    onClick={() => addToCart(item.id, item.name, item.price, item.image)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
              </div>
              <div className="relative min-h-24 w-24 shrink-0 self-stretch overflow-hidden bg-slate-100">
                <img src={item.image} alt={item.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-0 right-0 z-20 px-4">
          <div className="max-w-md mx-auto">
            <Button
              className="w-full h-14 shadow-lg gap-3 text-base"
              style={{ backgroundColor: accent }}
              onClick={() => setCartOpen(true)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <span>{cartCount} {cartCount === 1 ? 'item' : 'itens'} na sacola</span>
              <span className="ml-auto font-bold">{formatCurrency(totalWithDelivery)}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-md bg-card h-full flex flex-col animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b" style={{ backgroundColor: accent }}>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Sua Sacola
              </h2>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setCartOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingBag className="h-12 w-12 mb-2 opacity-30" />
                  <p>Sacola vazia</p>
                </div>
              )}
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <img src={item.image} alt={item.name} className="h-14 w-14 rounded-lg object-cover" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.price)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{formatCurrency(item.price * item.quantity)}</p>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive mt-1" onClick={() => removeFromCart(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="border-t p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-xl font-bold" style={{ color: accent }}>{formatCurrency(totalWithDelivery)}</span>
                </div>
                <Button
                  className="w-full h-12 text-base"
                  style={{ backgroundColor: '#25D366' }}
                  onClick={() => setCheckoutOpen(true)}
                >
                  <MessageCircle className="h-5 w-5 mr-2" />
                  Finalizar Pedido
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout confirmation */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setCheckoutOpen(false)} />
          <Card className="relative max-w-md w-full p-6 animate-scale-in">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5" style={{ color: accent }} />
              Confirmar Pedido
            </h2>
            <div className="space-y-2 mb-4">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>{item.quantity}x {item.name}</span>
                  <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 mt-2 text-sm"><span>Entrega</span><span>{formatCurrency(deliverySettings.deliveryFee)}</span></div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg" style={{ color: accent }}>{formatCurrency(totalWithDelivery)}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Informe seus dados para enviar o pedido à loja <strong>{est.name}</strong>.
            </p>
            <div className="mb-4 grid max-h-[45vh] gap-3 overflow-y-auto sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Nome<Input autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label className="space-y-1 text-sm font-medium">Telefone<Input autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              <label className="space-y-1 text-sm font-medium">CEP<Input autoComplete="postal-code" inputMode="numeric" value={postalCode} onChange={(event) => void searchPostalCode(event.target.value)} placeholder="00000-000" /></label>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">Endereço de entrega<Input autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Confira e informe número/complemento" /></label>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">CPF ou CNPJ<Input inputMode="numeric" maxLength={14} value={document} onChange={(event) => setDocument(digitsOnly(event.target.value).slice(0, 14))} /></label>
              {lookingUpPostalCode && <p className="text-xs text-muted-foreground sm:col-span-2">Buscando endereço pelo CEP...</p>}
              <p className="text-sm text-muted-foreground sm:col-span-2">Informe uma ou mais formas de pagamento e os respectivos valores antes de enviar.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCheckoutOpen(false)}>
                Voltar
              </Button>
              <Button className="flex-1" style={{ backgroundColor: '#25D366' }} onClick={startOrder}>
                <MessageCircle className="h-4 w-4 mr-1" />
                Informar pagamento
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Order sent confirmation */}
      {orderSent && (
        <div className="fixed bottom-4 left-0 right-0 z-50 px-4">
          <div className="max-w-md mx-auto">
            <Card className="p-4 flex items-center gap-3 animate-slide-up border-emerald-200 bg-emerald-50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500">
                <Check className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800">Pedido enviado!</p>
                <p className="text-xs text-emerald-600">Aguarde a confirmação no WhatsApp</p>
              </div>
            </Card>
          </div>
        </div>
      )}
      <PaymentDialog
        open={paymentDialogOpen}
        total={Math.round(totalWithDelivery * 100) / 100}
        defaultMethod={paymentMethod}
        mode="select"
        onOpenChange={setPaymentDialogOpen}
        onConfirm={sendOrder}
      />
    </div>
  );
}

function CatButton({ label, active, onClick, accent }: {
  label: string; active: boolean; onClick: () => void; accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors border',
        active ? 'text-white border-transparent' : 'bg-card border-border hover:bg-muted'
      )}
      style={active ? { backgroundColor: accent } : undefined}
    >
      {label}
    </button>
  );
}
