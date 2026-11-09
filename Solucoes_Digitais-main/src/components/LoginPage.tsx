import { useState, type FormEvent } from 'react';
import { Layers, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const { login, demoModeAvailable, authConfigured } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(username, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground"><Layers className="h-6 w-6" /></div>
          <div><h1 className="text-xl font-bold">Soluções Digitais</h1><p className="text-sm text-muted-foreground">Acesso ao painel</p></div>
        </div>
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /><h2 className="font-semibold">Entrar</h2></div>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5"><Label htmlFor="login-username">{authConfigured ? 'E-mail' : 'Usuário'}</Label><Input id="login-username" autoComplete={authConfigured ? 'email' : 'username'} type={authConfigured ? 'email' : 'text'} value={username} onChange={(event) => setUsername(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="login-password">Senha</Label><Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {!demoModeAvailable && !authConfigured && <p role="status" className="text-sm text-amber-800">Autenticação de produção não configurada. Conecte o provedor Supabase para habilitar o acesso.</p>}
            {demoModeAvailable && <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">Demonstração local: admin / 123. Esta conta não protege dados em produção.</p>}
            <Button type="submit" className="w-full" disabled={submitting || (!demoModeAvailable && !authConfigured)}>{submitting ? 'Entrando...' : 'Entrar'}</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}