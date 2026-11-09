import { Building2, LogOut, UserRound, Check, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useApp } from '@/store';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu({ className }: { className?: string }) {
  const { user, logout } = useAuth();
  const { currentProfile, establishments, setProfile } = useApp();
  const { theme, setTheme } = useTheme();

  if (!user) return null;

  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={cn('h-auto w-full justify-start gap-3 rounded-lg border border-border/70 bg-background p-3 text-left hover:bg-muted max-md:justify-center max-md:border-transparent max-md:bg-transparent max-md:px-1', className)} aria-label="Abrir menu do usuário">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 max-md:hidden"><span className="block truncate text-sm font-semibold">{user.displayName}</span><span className="block truncate text-xs text-muted-foreground">{user.role === 'super-admin' ? 'Super Admin' : `@${user.username}`}</span></span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="mb-2 w-72">
          <DropdownMenuLabel>
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="text-xs font-normal text-muted-foreground">{user.role === 'super-admin' ? 'Super Admin' : `@${user.username}`}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Building2 className="h-3.5 w-3.5" />Estabelecimentos permitidos</DropdownMenuLabel>
          {user.role === 'super-admin' && (
            <DropdownMenuItem onClick={() => setProfile('super-admin')}>
              {currentProfile === 'super-admin' ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 h-4 w-4" />}
              Painel Super Admin
            </DropdownMenuItem>
          )}
          {establishments.map((establishment) => (
            <DropdownMenuItem key={establishment.id} onClick={() => setProfile(establishment.slug)}>
              {currentProfile === establishment.slug ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 h-4 w-4" />}
              <span className="truncate">{establishment.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Tema</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setTheme('light')}>
            {theme === 'light' ? <Check className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
            Claro
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme('dark')}>
            {theme === 'dark' ? <Check className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Escuro
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );
}