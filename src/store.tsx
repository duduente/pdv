import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Establishment, EstablishmentTemplate, ViewProfile, ModuleKey } from './types';
import {
  appointments, establishments as initialData, menuCategories, menuItems,
  products, professionals, services,
} from './mockData';
import { usePersistentState } from './hooks/usePersistentState';
import { useAuth } from './auth/AuthContext';
import { supabase } from './lib/supabase';

export type Screen = 'admin' | 'merchant' | 'public-booking' | 'public-menu';

interface AppState {
  establishments: Establishment[];
  currentProfile: ViewProfile;
  screen: Screen;
  selectedEstablishment: Establishment | null;
  setProfile: (profile: ViewProfile) => void;
  createEstablishment: (establishment: Establishment) => Promise<void>;
  deleteEstablishment: (id: string) => Promise<void>;
  updateEstablishment: (id: string, updates: Partial<Establishment>) => Promise<void>;
  toggleModule: (id: string, module: ModuleKey) => Promise<void>;
  viewPublicPage: (slug: string, type: 'booking' | 'menu') => void;
  goBack: () => void;
}

const AppContext = createContext<AppState | null>(null);
const EMPTY_ESTABLISHMENTS: Establishment[] = [];

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [localEstablishments, setLocalEstablishments] = usePersistentState<Establishment[]>('establishments', initialData);
  const [remoteEstablishments, setRemoteEstablishments] = useState<Establishment[] | null>(null);
  const usesRemoteAuth = Boolean(supabase && !user?.isDemo);
  const establishmentData = usesRemoteAuth ? remoteEstablishments ?? EMPTY_ESTABLISHMENTS : localEstablishments;
  const establishments = establishmentData.map((establishment) => ({
    ...establishment,
    modules: {
      ...establishment.modules,
      comandas: establishment.modules.comandas ?? Boolean(establishment.modules.cardapio),
      delivery: establishment.modules.delivery ?? Boolean(establishment.modules.cardapio),
    },
  }));

  useEffect(() => {
    if (!usesRemoteAuth || !supabase) {
      setRemoteEstablishments(null);
      return;
    }
    let active = true;
    void supabase.from('establishments').select('*').order('name').then(({ data, error }) => {
      if (!active) return;
      if (error) { setRemoteEstablishments([]); return; }
      setRemoteEstablishments((data ?? []).map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        owner: row.owner,
        email: row.email,
        plan: row.plan,
        monthlyRevenue: Number(row.monthly_revenue),
        status: row.status,
        modules: row.modules,
        theme: row.theme,
        whatsapp: row.whatsapp,
        template: row.template ?? undefined,
      })));
    });
    return () => { active = false; };
  }, [usesRemoteAuth, user?.id]);
  const firstPermittedEstablishment = user?.role === 'merchant'
    ? establishments.find((establishment) => user.establishmentIds.includes(establishment.id))
    : undefined;
  const [currentProfile, setCurrentProfile] = useState<ViewProfile>(
    user?.role === 'super-admin' ? 'super-admin' : firstPermittedEstablishment?.slug ?? 'super-admin',
  );
  const [screen, setScreen] = useState<Screen>(user?.role === 'super-admin' ? 'admin' : 'merchant');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(firstPermittedEstablishment?.slug ?? null);

  useEffect(() => {
    if (user?.role !== 'merchant' || remoteEstablishments === null) return;
    const first = remoteEstablishments.find((establishment) => user.establishmentIds.includes(establishment.id));
    if (first && !selectedSlug) {
      setSelectedSlug(first.slug);
      setCurrentProfile(first.slug);
    }
  }, [remoteEstablishments, selectedSlug, user]);

  const accessibleEstablishments = user?.role === 'super-admin'
    ? establishments
    : establishments.filter((establishment) => user?.establishmentIds.includes(establishment.id));

  const selectedEstablishment = selectedSlug
    ? accessibleEstablishments.find((e) => e.slug === selectedSlug) ?? null
    : null;

  const setProfile = useCallback((profile: ViewProfile) => {
    if (profile === 'super-admin' && user?.role !== 'super-admin') return;
    const establishment = establishments.find((item) => item.slug === profile);
    if (establishment && user?.role !== 'super-admin' && !user?.establishmentIds.includes(establishment.id)) return;
    if (profile !== 'super-admin' && !establishment) return;
    setCurrentProfile(profile);
    setSelectedSlug(null);
    if (profile === 'super-admin') {
      setScreen('admin');
    } else {
      setScreen('merchant');
      setSelectedSlug(profile);
    }
  }, [establishments, user]);

  const createEstablishment = useCallback(async (establishment: Establishment) => {
    if (user?.role !== 'super-admin') throw new Error('Apenas o Super Admin pode criar estabelecimentos.');
    if (usesRemoteAuth && supabase) {
      const row = {
        id: establishment.id, slug: establishment.slug, name: establishment.name,
        owner: establishment.owner, email: establishment.email, plan: establishment.plan,
        monthly_revenue: establishment.monthlyRevenue, status: establishment.status,
        modules: establishment.modules, theme: establishment.theme, whatsapp: establishment.whatsapp,
        template: establishment.template ?? null,
      };
      const { error } = await supabase.from('establishments').insert(row);
      if (error) throw error;
      setRemoteEstablishments((current) => [...(current ?? []), establishment]);
    } else {
      setLocalEstablishments((current) => [...current, establishment]);
    }

    const saveSeed = (key: string, value: unknown) => {
      try {
        window.localStorage.setItem(`${key}:${establishment.id}`, JSON.stringify(value));
      } catch {
        // The store remains usable if browser storage is unavailable.
      }
    };
    const template: EstablishmentTemplate = establishment.template ?? 'custom';

    if (template === 'barbershop' || template === 'complete') {
      saveSeed('services', services);
      saveSeed('professionals', professionals);
      saveSeed('appointments', appointments.map((appointment) => ({ ...appointment, status: 'confirmed', paymentStatus: 'unpaid' })));
    }
    if (template === 'restaurant' || template === 'complete') {
      saveSeed('menu-items', menuItems);
      saveSeed('menu-categories', menuCategories);
    }
    if (template === 'grocery' || template === 'complete') {
      saveSeed('inventory', products);
    }
  }, [setLocalEstablishments, user, usesRemoteAuth]);

  const deleteEstablishment = useCallback(async (id: string) => {
    if (user?.role !== 'super-admin') throw new Error('Apenas o Super Admin pode excluir estabelecimentos.');
    if (usesRemoteAuth && supabase) {
      const { error } = await supabase.from('establishments').delete().eq('id', id);
      if (error) throw error;
      setRemoteEstablishments((current) => (current ?? []).filter((establishment) => establishment.id !== id));
    } else {
      setLocalEstablishments((current) => current.filter((establishment) => establishment.id !== id));
    }

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.endsWith(`:${id}`)) window.localStorage.removeItem(key);
    }
  }, [setLocalEstablishments, user, usesRemoteAuth]);

  const updateEstablishment = useCallback(async (id: string, updates: Partial<Establishment>) => {
    if (user?.role !== 'super-admin' && !user?.establishmentIds.includes(id)) throw new Error('Acesso negado a este estabelecimento.');
    if (usesRemoteAuth && supabase) {
      const current = remoteEstablishments?.find((establishment) => establishment.id === id);
      if (!current) throw new Error('Estabelecimento não encontrado.');
      const updated = { ...current, ...updates, theme: updates.theme ?? current.theme };
      const { error } = await supabase.from('establishments').update({
        name: updated.name, owner: updated.owner, email: updated.email, plan: updated.plan,
        monthly_revenue: updated.monthlyRevenue,
        status: updated.status, modules: updated.modules, theme: updated.theme,
        whatsapp: updated.whatsapp, template: updated.template ?? null,
      }).eq('id', id);
      if (error) throw error;
      setRemoteEstablishments((previous) => previous?.map((establishment) => establishment.id === id ? updated : establishment) ?? []);
    } else {
      setLocalEstablishments((current) => current.map((e) => (e.id === id ? { ...e, ...updates } : e)));
    }
  }, [remoteEstablishments, setLocalEstablishments, user, usesRemoteAuth]);

  const toggleModule = useCallback(async (id: string, module: ModuleKey) => {
    if (user?.role !== 'super-admin') throw new Error('Apenas o Super Admin pode alterar módulos.');
    const applyToggle = (current: Establishment[]) => current.map((establishment) => establishment.id === id
      ? { ...establishment, modules: { ...establishment.modules, [module]: !establishment.modules[module] } }
      : establishment);
    if (usesRemoteAuth && supabase) {
      const updated = applyToggle(remoteEstablishments ?? []);
      const establishment = updated.find((item) => item.id === id);
      if (!establishment) throw new Error('Estabelecimento não encontrado.');
      const { error } = await supabase.from('establishments').update({ modules: establishment.modules }).eq('id', id);
      if (error) throw error;
      setRemoteEstablishments(updated);
    } else {
      setLocalEstablishments((current) => applyToggle(current));
    }
  }, [remoteEstablishments, setLocalEstablishments, user, usesRemoteAuth]);

  const viewPublicPage = useCallback((slug: string, type: 'booking' | 'menu') => {
    setSelectedSlug(slug);
    setScreen(type === 'booking' ? 'public-booking' : 'public-menu');
  }, []);

  const goBack = useCallback(() => {
    if (currentProfile === 'super-admin') {
      setScreen('admin');
    } else {
      setScreen('merchant');
    }
    setSelectedSlug(currentProfile === 'super-admin' ? null : currentProfile);
  }, [currentProfile]);

  return (
    <AppContext.Provider
      value={{
        establishments: accessibleEstablishments,
        currentProfile,
        screen,
        selectedEstablishment,
        setProfile,
        createEstablishment,
        deleteEstablishment,
        updateEstablishment,
        toggleModule,
        viewPublicPage,
        goBack,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
