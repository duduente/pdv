import { Layers } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { AppProvider, useApp } from './store';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import { UserMenu } from './components/UserMenu';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import { MerchantPanel } from './components/MerchantPanel';
import { PublicBookingPage } from './components/PublicBookingPage';
import { PublicMenuPage } from './components/PublicMenuPage';
import { Toaster } from './components/ui/sonner';

function AppContent() {
  const { screen, selectedEstablishment } = useApp();
  const { user } = useAuth();

  const isPublicPage = screen === 'public-booking' || screen === 'public-menu';
  const isAdmin = screen === 'admin' && user?.role === 'super-admin';

  return (
    <div className="app-shell min-h-screen bg-background">
      {!isPublicPage && (
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-800 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/85">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Layers className="h-4.5 w-4.5" />
              </div>
              <div>
                <span className="block text-sm font-bold leading-tight">Soluções Digitais</span>
                <span className="block text-[11px] text-muted-foreground">Workspace</span>
              </div>
            </div>
            {selectedEstablishment && <span className="ml-auto truncate text-sm font-medium text-muted-foreground">{selectedEstablishment.name}</span>}
          </div>
        </header>
      )}

      {isAdmin ? (
        <div className="flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
          <aside className="flex h-full min-h-0 w-14 shrink-0 flex-col border-r border-slate-200/80 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900 sm:w-16 md:w-64 md:p-4">
            <div className="mb-6 hidden px-2 pt-2 md:block">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Administração</p>
              <p className="mt-1 text-sm text-muted-foreground">Visão geral do sistema</p>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              <div title="Painel geral" className="flex items-center justify-center gap-3 rounded-lg bg-primary/10 px-2 py-2.5 text-sm font-medium text-primary md:justify-start md:px-3"><Layers className="h-4 w-4 shrink-0" /><span className="hidden md:block">Painel geral</span></div>
            </nav>
            <div className="mt-auto shrink-0 border-t border-border/70 pt-2 md:pt-4"><UserMenu /></div>
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto"><SuperAdminPanel /></main>
        </div>
      ) : (
      <main className="min-w-0">
        {screen === 'merchant' && <MerchantPanel />}
        {screen === 'public-booking' && <PublicBookingPage key={selectedEstablishment?.id ?? 'none'} />}
        {screen === 'public-menu' && <PublicMenuPage key={selectedEstablishment?.id ?? 'none'} />}
      </main>
      )}
    </div>
  );
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Verificando sessão...</div>;
  if (!user) return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="solucoes-theme"><LoginPage /></ThemeProvider>;
  return <AppProvider key={user.id}><ThemedAppContent /></AppProvider>;
}

function ThemedAppContent() {
  const { screen } = useApp();
  const isPublicPage = screen === 'public-booking' || screen === 'public-menu';

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="solucoes-theme" forcedTheme={isPublicPage ? 'light' : undefined}>
      <AppContent />
    </ThemeProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
