import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { useAuth, type AppUser } from '@/auth/AuthContext';
import { hasStorePermission } from '@/auth/permissions';
import type { AppPermission, Establishment, ModuleKey } from '@/types';
import { STORE_PERMISSIONS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const PERMISSION_LABELS: Record<AppPermission, string> = {
  dashboard: 'Dashboard',
  agendamento: 'Agendamentos',
  cardapio: 'Cardápio digital',
  estoque: 'Estoque',
  comandas: 'Comandas',
  delivery: 'Delivery',
  'pdv-sales': 'Caixa · Vendas',
  'pdv-movements': 'Caixa · Movimentações e extratos',
  'pdv-reports': 'Caixa · Relatórios',
  'pdv-sessions': 'Caixa · Abertura e fechamento',
  finance: 'Finanças · Boletos e mensalidades',
  'store-settings': 'Configurações da loja',
  'manage-users': 'Criar e remover subusuários',
};

const MODULE_PERMISSIONS: Partial<Record<ModuleKey, AppPermission>> = {
  agendamento: 'agendamento',
  cardapio: 'cardapio',
  estoque: 'estoque',
  comandas: 'comandas',
  delivery: 'delivery',
  finance: 'finance',
};

const PERMISSION_PRESETS: { label: string; permissions: AppPermission[] }[] = [
  { label: 'Atendente', permissions: ['dashboard', 'pdv-sales'] },
  { label: 'Caixa', permissions: ['dashboard', 'pdv-sales', 'pdv-movements', 'pdv-sessions'] },
  {
    label: 'Gerente',
    permissions: [
      'dashboard', 'agendamento', 'cardapio', 'estoque', 'comandas', 'delivery',
      'pdv-sales', 'pdv-movements', 'pdv-reports', 'pdv-sessions',
    ],
  },
];

export function StoreUserManagement({ establishment }: { establishment: Establishment }) {
  const { createStoreUser, listStoreUsers, deleteStoreUser, user, authConfigured } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void listStoreUsers(establishment.id).then((result) => {
      if (active) setUsers(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os subusuários.');
    });
    return () => { active = false; };
  }, [establishment.id, listStoreUsers]);

  const availablePermissions = STORE_PERMISSIONS.filter((permission) => {
    if (!user || !hasStorePermission(user, establishment.id, permission)) return false;
    if (permission.startsWith('pdv-') && !establishment.modules.pdv) return false;
    const module = (Object.keys(MODULE_PERMISSIONS) as ModuleKey[])
      .find((key) => MODULE_PERMISSIONS[key] === permission);
    return !module || establishment.modules[module];
  });

  const togglePermission = (permission: AppPermission) => {
    setPermissions((current) => current.includes(permission)
      ? current.filter((entry) => entry !== permission)
      : [...current, permission]);
  };

  const applyPermissionPreset = (preset: AppPermission[]) => {
    setPermissions(availablePermissions.filter((permission) => preset.includes(permission)));
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setError('');
    if (!permissions.length) {
      setError('Selecione pelo menos uma permissão.');
      return;
    }
    setCreating(true);
    try {
      await createStoreUser({
        username, email, displayName, password,
        establishmentId: establishment.id, permissions,
      });
      setUsername('');
      setEmail('');
      setDisplayName('');
      setPassword('');
      setPermissions([]);
      toast.success('Subusuário criado com as permissões selecionadas.');
      try {
        setUsers(await listStoreUsers(establishment.id));
      } catch (reason) {
        setError(`Subusuário criado, mas não foi possível atualizar a lista: ${reason instanceof Error ? reason.message : 'erro desconhecido.'}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o subusuário.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (target: AppUser) => {
    if (!window.confirm(`Remover ${target.displayName} desta loja?`)) return;
    try {
      await deleteStoreUser(target.id, establishment.id);
      setUsers(await listStoreUsers(establishment.id));
      toast.success('Acesso do usuário removido desta loja.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o acesso.');
    }
  };

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus className="h-5 w-5 text-primary" />Subusuários e permissões</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie acessos exclusivos para {establishment.name}. As permissões também são validadas pelo servidor.
          {authConfigured && !user?.isDemo ? ' As novas contas poderão entrar com e-mail e senha.' : ' No modo demonstração, os dados ficam neste navegador.'}
        </p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void create(event)}>
        <fieldset disabled={creating} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Usuário<Input autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label className="space-y-1 text-sm font-medium">E-mail<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="space-y-1 text-sm font-medium">Nome de exibição<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium">Senha (mínimo 8 caracteres)<Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          </div>
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">Permissões de acesso</legend>
            <div className="space-y-2 border-b pb-3">
              <p className="text-xs text-muted-foreground">Atalhos de perfil — as permissões podem ser ajustadas abaixo.</p>
              <div className="flex flex-wrap gap-2">
                {PERMISSION_PRESETS.map((preset) => (
                  <Button key={preset.label} type="button" size="sm" variant="outline" onClick={() => applyPermissionPreset(preset.permissions)}>
                    {preset.label}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => setPermissions([])}>
                  Limpar seleção
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O perfil Gerente não inclui acesso a finanças, configurações da loja ou gestão de subusuários.
              </p>
            </div>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {availablePermissions.map((permission) => (
                <label key={permission} className="flex items-center gap-2 py-1.5 text-sm">
                  <input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} />
                  <span>{PERMISSION_LABELS[permission]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={creating}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="mr-2 h-4 w-4" />}
          <span role={creating ? 'status' : undefined}>{creating ? 'Criando subusuário...' : 'Criar subusuário'}</span>
        </Button>
      </form>
      <div className="border-t pt-4">
        <h3 className="mb-2 text-sm font-semibold">Acessos desta loja</h3>
        <div className="divide-y">
          {users.map((item) => {
            const granted = item.establishmentPermissions?.[establishment.id] ?? [];
            const grantedNames = granted
              .filter((permission): permission is AppPermission => permission !== '*')
              .map((permission) => PERMISSION_LABELS[permission]);
            return (
              <div key={item.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.displayName}</p>
                  <p className="text-xs text-muted-foreground">@{item.username}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {granted.includes('*') ? 'Todas as permissões' : grantedNames.join(' · ') || 'Sem permissões'}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={creating} onClick={() => void remove(item)} aria-label={`Remover ${item.username}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {!users.length && <p className="py-3 text-sm text-muted-foreground">Nenhum subusuário cadastrado nesta loja.</p>}
        </div>
      </div>
    </Card>
  );
}
