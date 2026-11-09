import type { AppUser } from './AuthContext';
import type { AppPermission } from '@/types';

export function hasStorePermission(user: AppUser | null, establishmentId: string, permission: AppPermission) {
  if (!user) return false;
  if (user.role === 'super-admin') return true;
  const permissions: (AppPermission | '*')[] = user.establishmentPermissions?.[establishmentId]
    ?? (user.isDemo && user.establishmentIds.includes(establishmentId) ? ['*'] : []);
  return permissions.includes('*') || permissions.includes(permission);
}
