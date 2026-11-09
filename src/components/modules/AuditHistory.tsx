import { Activity } from 'lucide-react';
import type { AuditEvent } from '@/types';
import { Card } from '@/components/ui/card';

const ACTION_LABELS: Record<AuditEvent['action'], string> = {
  created: 'Criado',
  edited: 'Editado',
  status_changed: 'Status alterado',
  cancelled: 'Cancelado / estornado',
  deleted: 'Excluído',
  opened: 'Aberto',
  closed: 'Fechado',
};

const ENTITY_LABELS: Record<AuditEvent['entityType'], string> = {
  order: 'Pedido',
  sale: 'Venda',
  expense: 'Despesa',
  cash_movement: 'Movimentação',
  cash_session: 'Sessão de caixa',
};

export function AuditHistory({ events, title = 'Histórico de alterações' }: {
  events: AuditEvent[];
  title?: string;
}) {
  const recentEvents = [...events].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt));

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h3 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" />{title}</h3>
        <p className="text-sm text-muted-foreground">Alterações, cancelamentos e exclusões com responsável e data.</p>
      </div>
      {recentEvents.length ? (
        <div className="divide-y">
          {recentEvents.map((event) => (
            <div key={event.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{ENTITY_LABELS[event.entityType]} · {ACTION_LABELS[event.action]}</p>
                <p className="text-sm text-muted-foreground">{event.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {event.actorName} · {new Date(event.occurredAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">#{event.entityId.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
      )}
    </Card>
  );
}
