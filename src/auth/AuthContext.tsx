import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useEffect } from 'react';
import { FunctionsHttpError, type Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppPermission, StorePermission } from '@/types';
import { hasStorePermission } from './permissions';
import { reconcileLocalEmployees } from '@/lib/localEmployeeIntegration';

export type DemoRole = 'super-admin' | 'merchant';

export interface AppUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: DemoRole;
  establishmentIds: string[];
  establishmentPermissions?: Record<string, StorePermission[]>;
  passwordHash?: string;
  isDemo?: boolean;
}

interface AuthContextValue {
  user: AppUser | null;
  demoModeAvailable: boolean;
  authConfigured: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createUser: (input: { username: string; email: string; displayName: string; establishmentIds: string[]; password: string }) => Promise<void>;
  listUsers: () => Promise<AppUser[]>;
  deleteUser: (id: string) => Promise<void>;
  createStoreUser: (input: { username: string; email: string; displayName: string; establishmentId: string; password: string; permissions: AppPermission[] }) => Promise<void>;
  listStoreUsers: (establishmentId: string) => Promise<AppUser[]>;
  deleteStoreUser: (userId: string, establishmentId: string) => Promise<void>;
}

const USERS_KEY = 'demo-auth-users';
const SESSION_KEY = 'demo-auth-session';
const DEMO_ADMIN: AppUser = {
  id: 'demo-super-admin',
  username: 'admin',
  displayName: 'Super Admin (demonstração)',
  role: 'super-admin',
  establishmentIds: [],
  isDemo: true,
};

async function getFunctionErrorMessage(error: Error, fallback: string) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await error.context.clone().json();
      if (typeof body === 'object' && body !== null) {
        if ('error' in body && typeof body.error === 'string') return body.error;
        if ('message' in body && typeof body.message === 'string') return body.message;
      }
    } catch {
      // The response may not contain JSON, so fall back to the SDK error.
    }
  }
  return error.message || fallback;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const demoModeAvailable = import.meta.env.DEV;

function readUsers(): AppUser[] {
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? '[]') as AppUser[];
  } catch {
    return [];
  }
}

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function restoreDemoSession(): AppUser | null {
  if (!demoModeAvailable) return null;
  try {
    const id = window.localStorage.getItem(SESSION_KEY);
    if (id === DEMO_ADMIN.id) return DEMO_ADMIN;
    return readUsers().find((user) => user.id === id) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(restoreDemoSession);
  const [loading, setLoading] = useState(Boolean(supabase));

  const resolveSession = useCallback(async (session: Session | null) => {
    if (!session || !supabase) {
      setUser((current) => current?.isDemo ? current : null);
      setLoading(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username, display_name, role')
      .eq('id', session.user.id)
      .single();
    if (profileError || !profile) {
      setUser(null);
      setLoading(false);
      return;
    }
    const { data: memberships } = await supabase
      .from('establishment_memberships')
      .select('establishment_id, permissions')
      .eq('user_id', session.user.id);
    setUser({
      id: session.user.id,
      username: profile.username ?? session.user.email?.split('@')[0] ?? '',
      email: session.user.email,
      displayName: profile.display_name || session.user.email || 'Usuário',
      role: profile.role === 'super_admin' ? 'super-admin' : 'merchant',
      establishmentIds: memberships?.map((membership) => membership.establishment_id) ?? [],
      establishmentPermissions: Object.fromEntries((memberships ?? []).map((membership) => [
        membership.establishment_id,
        (membership.permissions ?? []) as StorePermission[],
      ])),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) void resolveSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void resolveSession(session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [resolveSession]);

  const login = useCallback(async (username: string, password: string) => {
    const normalizedUsername = username.trim().toLowerCase();
    if (demoModeAvailable && normalizedUsername === 'admin' && password === '123') {
      window.localStorage.setItem(SESSION_KEY, DEMO_ADMIN.id);
      setUser(DEMO_ADMIN);
      return;
    }

    if (demoModeAvailable) {
      const passwordHash = await hashPassword(password);
      const matchedUser = readUsers().find((candidate) =>
        candidate.username.toLowerCase() === normalizedUsername && candidate.passwordHash === passwordHash,
      );
      if (matchedUser) {
        window.localStorage.setItem(SESSION_KEY, matchedUser.id);
        setUser(matchedUser);
        return;
      }
    }

    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: username.trim(), password });
      if (error) throw new Error('E-mail ou senha inválidos.');
      return;
    }
    if (!demoModeAvailable) throw new Error('Configure o Supabase para habilitar autenticação de produção.');
    throw new Error('Usuário ou senha inválidos.');
  }, []);

  const logout = useCallback(async () => {
    window.localStorage.removeItem(SESSION_KEY);
    if (supabase && user?.isDemo !== true) await supabase.auth.signOut();
    setUser(null);
  }, [user]);

  const createUser = useCallback<AuthContextValue['createUser']>(async (input) => {
    if (user?.role !== 'super-admin') throw new Error('Apenas o Super Admin pode criar usuários.');
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    if (!username || input.password.length < 8) throw new Error('Informe usuário e senha com pelo menos 8 caracteres.');
    if (supabase && !user.isDemo) {
      const { error } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'create', ...input, username },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível criar o usuário.'));
      return;
    }
    if (!demoModeAvailable) throw new Error('Gestão local de usuários só está disponível na demonstração.');
    if (username === 'admin' || readUsers().some((candidate) =>
      candidate.username.toLowerCase() === username || candidate.email?.toLowerCase() === email,
    )) {
      throw new Error('Já existe um usuário com esse nome.');
    }
    const newUser: AppUser = {
      id: window.crypto.randomUUID(),
      username,
      email,
      displayName: input.displayName.trim() || username,
      role: 'merchant',
      establishmentIds: [...new Set(input.establishmentIds)],
      passwordHash: await hashPassword(input.password),
      isDemo: true,
    };
    window.localStorage.setItem(USERS_KEY, JSON.stringify([...readUsers(), newUser]));
  }, [user]);

  const listUsers = useCallback(async () => {
    if (user?.role !== 'super-admin') return [];
    if (supabase && !user.isDemo) {
      const { data, error } = await supabase.functions.invoke('admin-manage-users', { body: { action: 'list' } });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível listar os usuários.'));
      return data.users as AppUser[];
    }
    return readUsers().map((candidate) => {
      const safeUser = { ...candidate };
      delete safeUser.passwordHash;
      return safeUser;
    });
  }, [user]);

  const deleteUser = useCallback(async (id: string) => {
    if (user?.role !== 'super-admin') throw new Error('Apenas o Super Admin pode remover usuários.');
    if (supabase && !user.isDemo) {
      const { error } = await supabase.functions.invoke('admin-manage-users', { body: { action: 'delete', userId: id } });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível remover o usuário.'));
      return;
    }
    window.localStorage.setItem(USERS_KEY, JSON.stringify(readUsers().filter((candidate) => candidate.id !== id)));
  }, [user]);

  const createStoreUser = useCallback<AuthContextValue['createStoreUser']>(async (input) => {
    if (!user || !hasStorePermission(user, input.establishmentId, 'manage-users')) {
      throw new Error('Você não tem permissão para criar usuários nesta loja.');
    }
    if (input.permissions.some((permission) => !hasStorePermission(user, input.establishmentId, permission))) {
      throw new Error('Você não pode conceder permissões que não possui.');
    }
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    if (!username || !email || input.password.length < 8) throw new Error('Informe usuário, e-mail e senha com pelo menos 8 caracteres.');
    if (supabase && !user.isDemo) {
      const { error } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'create_store', ...input, username, email },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível criar o usuário da loja.'));
      return;
    }
    if (!demoModeAvailable) throw new Error('Configure o Supabase para habilitar a gestão de usuários.');
    if (username === 'admin' || readUsers().some((candidate) =>
      candidate.username.toLowerCase() === username || candidate.email?.toLowerCase() === email,
    )) {
      throw new Error('Já existe um usuário com esse nome.');
    }
    const newUser: AppUser = {
      id: window.crypto.randomUUID(),
      username,
      email,
      displayName: input.displayName.trim() || username,
      role: 'merchant',
      establishmentIds: [input.establishmentId],
      establishmentPermissions: { [input.establishmentId]: [...new Set(input.permissions)] },
      passwordHash: await hashPassword(input.password),
      isDemo: true,
    };
    window.localStorage.setItem(USERS_KEY, JSON.stringify([...readUsers(), newUser]));
    try {
      reconcileLocalEmployees(input.establishmentId, []);
    } catch (error) {
      throw new Error(`Subusuário criado, mas não foi possível vinculá-lo a Funcionários: ${error instanceof Error ? error.message : 'erro de armazenamento.'}`);
    }
  }, [user]);

  const listStoreUsers = useCallback<AuthContextValue['listStoreUsers']>(async (establishmentId) => {
    if (!user || !hasStorePermission(user, establishmentId, 'manage-users')) return [];
    if (supabase && !user.isDemo) {
      const { data, error } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'list_store', establishmentId },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível listar os usuários da loja.'));
      return data.users as AppUser[];
    }
    return readUsers().filter((candidate) => candidate.id !== user?.id && candidate.establishmentIds.includes(establishmentId))
      .map((candidate) => {
        const safeUser = { ...candidate };
        delete safeUser.passwordHash;
        return safeUser;
      });
  }, [user]);

  const deleteStoreUser = useCallback<AuthContextValue['deleteStoreUser']>(async (userId, establishmentId) => {
    if (!user || !hasStorePermission(user, establishmentId, 'manage-users')) {
      throw new Error('Você não tem permissão para remover usuários desta loja.');
    }
    if (supabase && !user.isDemo) {
      const { error } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'delete_store', userId, establishmentId },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível remover o usuário da loja.'));
      return;
    }
    const updated = readUsers().flatMap((candidate) => {
      if (candidate.id !== userId) return [candidate];
      const establishmentIds = candidate.establishmentIds.filter((id) => id !== establishmentId);
      if (!establishmentIds.length) return [];
      const establishmentPermissions = { ...candidate.establishmentPermissions };
      delete establishmentPermissions[establishmentId];
      return [{ ...candidate, establishmentIds, establishmentPermissions }];
    });
    window.localStorage.setItem(USERS_KEY, JSON.stringify(updated));
  }, [user]);

  const value = useMemo(() => ({
    user, demoModeAvailable, authConfigured: Boolean(supabase), loading, login, logout,
    createUser, listUsers, deleteUser, createStoreUser, listStoreUsers, deleteStoreUser,
  }), [
    user, loading, login, logout, createUser, listUsers, deleteUser, createStoreUser, listStoreUsers, deleteStoreUser,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}