import { useCallback, useEffect, useState } from 'react';
import { Clock3, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type PublicOrderStatus = {
  store_name: string;
  order_type: 'delivery' | 'pickup' | null;
  delivery_status: 'production' | 'dispatched' | 'finalized' | null;
  created_at: string | null;
};

const TRACKING_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPublicOrderStatus(value: unknown): value is PublicOrderStatus {
  if (typeof value !== 'object' || value === null) return false;
  return 'store_name' in value
    && typeof value.store_name === 'string'
    && 'order_type' in value
    && (value.order_type === 'delivery' || value.order_type === 'pickup' || value.order_type === null)
    && 'delivery_status' in value
    && (value.delivery_status === 'production' || value.delivery_status === 'dispatched'
      || value.delivery_status === 'finalized' || value.delivery_status === null)
    && 'created_at' in value
    && (typeof value.created_at === 'string' || value.created_at === null);
}

function getStatusDetails(order: PublicOrderStatus) {
  if (order.delivery_status === 'finalized') {
    return { title: 'Pedido concluído', description: 'Seu pedido foi finalizado.', icon: PackageCheck };
  }
  if (order.delivery_status === 'dispatched') {
    return order.order_type === 'pickup'
      ? { title: 'Pronto para retirada', description: 'Seu pedido está pronto para ser retirado.', icon: PackageCheck }
      : { title: 'Saiu para entrega', description: 'Seu pedido está a caminho.', icon: Truck };
  }
  return { title: 'Pedido em produção', description: 'A equipe está preparando seu pedido.', icon: Clock3 };
}

export function PublicOrderTrackingPage({ token }: { token: string }) {
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadOrderStatus = useCallback(async () => {
    if (!TRACKING_TOKEN_PATTERN.test(token)) {
      setError('Este link de acompanhamento é inválido.');
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError('O acompanhamento de pedidos ainda não está configurado neste sistema.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const { data, error: requestError } = await supabase.rpc('get_public_order_tracking', {
      tracking_code: token,
    });
    if (requestError) {
      setError(`Não foi possível consultar o pedido: ${requestError.message}`);
      setLoading(false);
      return;
    }
    const result = Array.isArray(data) ? data[0] : null;
    if (!isPublicOrderStatus(result)) {
      setOrder(null);
      setError('Pedido não encontrado. Confira se o link está correto.');
      setLoading(false);
      return;
    }
    setOrder(result);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadOrderStatus();
    const intervalId = window.setInterval(() => void loadOrderStatus(), 20_000);
    return () => window.clearInterval(intervalId);
  }, [loadOrderStatus]);

  const statusDetails = order ? getStatusDetails(order) : null;
  const StatusIcon = statusDetails?.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-lg space-y-5 p-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Acompanhamento de pedido</p>
          <h1 className="mt-1 text-2xl font-bold">{order?.store_name ?? 'Seu pedido'}</h1>
        </div>
        {loading && <p className="text-sm text-muted-foreground">Consultando o status do pedido...</p>}
        {!loading && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && order && statusDetails && StatusIcon && (
          <div className="flex items-start gap-4 rounded-lg border bg-white p-4">
            <StatusIcon className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">{statusDetails.title}</h2>
              <p className="text-sm text-muted-foreground">{statusDetails.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Modalidade: {order.order_type === 'pickup' ? 'Retirada' : 'Entrega'}
              </p>
              {order.created_at && (
                <p className="text-xs text-muted-foreground">
                  Pedido feito em {new Date(order.created_at).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        )}
        <Button type="button" variant="outline" onClick={() => void loadOrderStatus()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />Atualizar status
        </Button>
        <p className="text-xs text-muted-foreground">O status é atualizado automaticamente a cada 20 segundos.</p>
      </Card>
    </div>
  );
}
