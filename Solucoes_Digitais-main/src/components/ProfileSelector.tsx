import { Building2, Scissors, UtensilsCrossed, Store, Layers, Check } from 'lucide-react';
import { useApp } from '@/store';
import { useAuth } from '@/auth/AuthContext';
import type { ViewProfile } from '@/types';
import { MODULE_LABELS } from '@/mockData';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ADMIN_PROFILE: {
  key: ViewProfile;
  label: string;
  short: string;
  icon: typeof Building2;
  description: string;
} = { key: 'super-admin', label: 'Painel Super Admin', short: 'Super Admin', icon: Building2, description: 'Gerenciar estabelecimentos' };

export function ProfileSelector() {
  const { currentProfile, setProfile, establishments } = useApp();
  const { user } = useAuth();
  const profiles = [
    ...(user?.role === 'super-admin' ? [ADMIN_PROFILE] : []),
    ...establishments.map((establishment) => {
      const activeModules = (Object.keys(establishment.modules) as (keyof typeof establishment.modules)[])
        .filter((module) => establishment.modules[module]);
      const Icon = establishment.modules.agendamento
        ? Scissors
        : establishment.modules.cardapio
          ? UtensilsCrossed
          : establishment.modules.estoque
            ? Store
            : Layers;
      const description = activeModules.map((module) => MODULE_LABELS[module]).join(' · ') || 'Sem módulos ativos';
      return {
        key: establishment.slug,
        label: establishment.name,
        short: establishment.name,
        icon: Icon,
        description,
      };
    }),
  ];
  const active = profiles.find((profile) => profile.key === currentProfile) ?? ADMIN_PROFILE;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
        <span className="font-medium text-foreground">Visão:</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2.5 min-w-[200px] md:min-w-[280px]">
            <active.icon className="h-4 w-4 text-primary" />
            <span className="truncate">{active.short}</span>
            <Badge variant="secondary" className="ml-auto hidden md:inline-flex text-[10px] px-1.5 py-0">
              {active.description}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[380px] p-2">
          <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Seletor de Contexto — Simulação
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {profiles.map((p) => (
            <DropdownMenuItem
              key={p.key}
              onClick={() => setProfile(p.key)}
              className="flex items-start gap-3 p-3 cursor-pointer rounded-md"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                  currentProfile === p.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                <p.icon className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-medium leading-tight">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.description}</span>
              </div>
              {currentProfile === p.key && (
                <Check className="h-4 w-4 text-primary shrink-0 mt-1" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
