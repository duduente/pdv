import { type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AppUser } from '@/auth/AuthContext';

interface EmployeeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
  isEditing: boolean;
  name: string;
  onNameChange: (value: string) => void;
  userId: string;
  onUserIdChange: (value: string) => void;
  salary: number;
  onSalaryChange: (value: number) => void;
  commission: string;
  onCommissionChange: (value: string) => void;
  discount: string;
  onDiscountChange: (value: string) => void;
  active: boolean;
  onActiveChange: (value: boolean) => void;
  users: AppUser[];
  canManageUsers: boolean;
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function EmployeeEditDialog({
  open,
  onOpenChange,
  onSubmit,
  disabled,
  isEditing,
  name,
  onNameChange,
  userId,
  onUserIdChange,
  salary,
  onSalaryChange,
  commission,
  onCommissionChange,
  discount,
  onDiscountChange,
  active,
  onActiveChange,
  users,
  canManageUsers,
}: EmployeeEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar funcionário' : 'Cadastrar novo funcionário'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as informações do funcionário.'
              : 'Preencha os dados para cadastrar um novo funcionário.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Nome *</span>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              required
              placeholder="Digite o nome do funcionário"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Subusuário (opcional)</span>
            <select
              className={selectClass}
              value={userId}
              disabled={!canManageUsers}
              onChange={(event) => onUserIdChange(event.target.value)}
            >
              <option value="">Sem vínculo</option>
              {userId && !users.some((entry) => entry.id === userId) && (
                <option value={userId}>Vínculo existente</option>
              )}
              {users.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName} · @{entry.username}
                </option>
              ))}
            </select>
            {!canManageUsers && (
              <p className="text-xs text-muted-foreground">
                Você não tem permissão para gerenciar subusuários.
              </p>
            )}
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Salário mensal *</span>
            <CurrencyInput
              value={salary}
              onValueChange={(value) => onSalaryChange(value ?? 0)}
              placeholder="R$ 0,00"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Comissão (%) *</span>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commission}
              onChange={(event) => onCommissionChange(event.target.value)}
              required
              placeholder="0,00"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Desconto no consumo (%) *</span>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discount}
              onChange={(event) => onDiscountChange(event.target.value)}
              required
              placeholder="0,00"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => onActiveChange(event.target.checked)}
            />
            <span className="font-medium">Ativo para vendas e agendamentos</span>
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button disabled={disabled} type="submit">
              {isEditing ? 'Salvar funcionário' : 'Cadastrar funcionário'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
