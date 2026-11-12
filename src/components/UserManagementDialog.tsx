import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { useApp } from '@/store';
import { useAuth, type AppUser } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export function UserManagementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { establishments } = useApp();
  const { createUser, listUsers, deleteUser, user, authConfigured } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [establishmentIds, setEstablishmentIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) void listUsers().then(setUsers).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar usuários.');
    });
  }, [listUsers, open]);

  const toggleEstablishment = (id: string) => {
    setEstablishmentIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setError('');
    if (!establishmentIds.length) { setError('Selecione pelo menos um estabelecimento.'); return; }
    setCreating(true);
    try {
      await createUser({
        username,
        email,
        displayName,
        password,
        establishmentIds,
      });
      setUsername(''); setEmail(''); setDisplayName(''); setPassword(''); setEstablishmentIds([]);
      toast.success('Usuário criado com as permissões selecionadas.');
      try {
        setUsers(await listUsers());
      } catch (reason) {
        setError(`Usuário criado, mas não foi possível atualizar a lista: ${reason instanceof Error ? reason.message : 'erro desconhecido.'}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o usuário.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteUser(id);
      setUsers(await listUsers());
      toast.success('Usuário removido.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o usuário.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" />Usuários e permissões</DialogTitle>
          <DialogDescription>
            Contas comuns só poderão acessar os estabelecimentos selecionados. {authConfigured && !user?.isDemo ? 'Gerenciado pelo Supabase Auth.' : 'Armazenado localmente neste navegador para demonstração.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={create}>
          <fieldset disabled={creating} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Usuário<Input autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
              <label className="space-y-1 text-sm font-medium">E-mail<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="space-y-1 text-sm font-medium">Nome de exibição<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Opcional" /></label>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">Senha (mínimo 8 caracteres)<Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            </div>
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-semibold">Estabelecimentos permitidos</legend>
              {establishments.map((establishment) => (
                <label key={establishment.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" checked={establishmentIds.includes(establishment.id)} onChange={() => toggleEstablishment(establishment.id)} />
                  <span>{establishment.name}</span>
                </label>
              ))}
              {!establishments.length && <p className="text-sm text-muted-foreground">Nenhum estabelecimento cadastrado.</p>}
            </fieldset>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              <span role={creating ? 'status' : undefined}>{creating ? 'Criando usuário...' : 'Criar usuário'}</span>
            </Button>
          </DialogFooter>
        </form>
        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-semibold">Usuários cadastrados</h3>
          <div className="divide-y">
            {users.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.displayName}</p><p className="text-xs text-muted-foreground">@{item.username} · {item.establishmentIds.length} loja(s)</p></div>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={creating} onClick={() => remove(item.id)} aria-label={`Excluir usuário ${item.username}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!users.length && <p className="py-3 text-sm text-muted-foreground">Nenhum usuário comum criado.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}