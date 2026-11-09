import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'http://localhost:8080',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return respond({ error: 'Function is not configured' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return respond({ error: 'Unauthorized' }, 401);

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return respond({ error: 'Invalid request body' }, 400);
  }

  const storeActions = ['list_store', 'create_store', 'delete_store'];
  if (storeActions.includes(String(payload.action))) {
    const establishmentId = typeof payload.establishmentId === 'string' ? payload.establishmentId : '';
    if (!establishmentId) return respond({ error: 'Establishment is required.' }, 400);
    let managerPermissions: string[] = [];
    if (profile?.role !== 'super_admin') {
      const { data: membership, error: membershipError } = await adminClient
        .from('establishment_memberships')
        .select('permissions')
        .eq('user_id', authData.user.id)
        .eq('establishment_id', establishmentId)
        .maybeSingle();
      if (membershipError) return respond({ error: membershipError.message }, 500);
      if (!membership || !(membership.permissions ?? []).some((permission: string) => permission === '*' || permission === 'manage-users')) {
        return respond({ error: 'You do not have permission to manage users for this store.' }, 403);
      }
      managerPermissions = membership.permissions ?? [];
    }

    if (payload.action === 'list_store') {
      const { data: memberships, error: membershipsError } = await adminClient
        .from('establishment_memberships')
        .select('user_id, permissions')
        .eq('establishment_id', establishmentId)
        .neq('user_id', authData.user.id)
        .order('created_at');
      if (membershipsError) return respond({ error: membershipsError.message }, 500);
      const ids = (memberships ?? []).map((item) => item.user_id);
      const { data: profiles, error: profilesError } = ids.length
        ? await adminClient.from('profiles').select('id, username, display_name, role').in('id', ids).eq('role', 'merchant')
        : { data: [], error: null };
      if (profilesError) return respond({ error: profilesError.message }, 500);
      const permissionsByUser = new Map((memberships ?? []).map((item) => [item.user_id, item.permissions ?? []]));
      return respond({
        users: (profiles ?? []).map((item) => ({
          id: item.id,
          username: item.username ?? '',
          displayName: item.display_name,
          role: 'merchant',
          establishmentIds: [establishmentId],
          establishmentPermissions: { [establishmentId]: permissionsByUser.get(item.id) ?? [] },
        })),
      });
    }

    if (payload.action === 'create_store') {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
      const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
      const password = typeof payload.password === 'string' ? payload.password : '';
      const permissions = Array.isArray(payload.permissions)
        ? [...new Set(payload.permissions.filter((permission): permission is string => typeof permission === 'string'))]
        : [];
      const allowedPermissions = new Set([
        'dashboard', 'agendamento', 'cardapio', 'estoque', 'comandas', 'delivery',
        'pdv-sales', 'pdv-movements', 'pdv-reports', 'pdv-sessions',
        'finance', 'store-settings', 'manage-users',
      ]);
      if (!email || !username || password.length < 8 || !permissions.length || permissions.some((permission) => !allowedPermissions.has(permission))) {
        return respond({ error: 'E-mail, usuário, senha de pelo menos 8 caracteres e permissões válidas são obrigatórios.' }, 400);
      }
      if (profile?.role !== 'super_admin'
        && !managerPermissions.includes('*')
        && permissions.some((permission) => !managerPermissions.includes(permission))) {
        return respond({ error: 'Você não pode conceder permissões que não possui.' }, 403);
      }
      const { data: store, error: storeError } = await adminClient
        .from('establishments')
        .select('id')
        .eq('id', establishmentId)
        .maybeSingle();
      if (storeError || !store) return respond({ error: 'Estabelecimento inválido.' }, 400);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName || username },
      });
      if (createError || !created.user) return respond({ error: createError?.message ?? 'Não foi possível criar a conta.' }, 400);

      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: created.user.id,
        username,
        display_name: displayName || username,
        role: 'merchant',
      });
      if (!profileError) {
        const { error: membershipError } = await adminClient.from('establishment_memberships').insert({
          user_id: created.user.id,
          establishment_id: establishmentId,
          permissions,
        });
        if (!membershipError) return respond({ id: created.user.id });
        await adminClient.auth.admin.deleteUser(created.user.id);
        return respond({ error: membershipError.message }, 500);
      }
      await adminClient.auth.admin.deleteUser(created.user.id);
      return respond({ error: profileError.message }, 500);
    }

    if (payload.action === 'delete_store') {
      const userId = typeof payload.userId === 'string' ? payload.userId : '';
      if (!userId || userId === authData.user.id) return respond({ error: 'Usuário inválido.' }, 400);
      const { data: target, error: targetError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (targetError || target?.role !== 'merchant') return respond({ error: 'Usuário comum não encontrado.' }, 404);
      const { data: membership, error: membershipError } = await adminClient
        .from('establishment_memberships')
        .select('user_id')
        .eq('user_id', userId)
        .eq('establishment_id', establishmentId)
        .maybeSingle();
      if (membershipError) return respond({ error: membershipError.message }, 500);
      if (!membership) return respond({ error: 'Usuário não encontrado nesta loja.' }, 404);
      const { error: deleteMembershipError } = await adminClient
        .from('establishment_memberships')
        .delete()
        .eq('user_id', userId)
        .eq('establishment_id', establishmentId);
      if (deleteMembershipError) return respond({ error: deleteMembershipError.message }, 500);
      const { count, error: remainingMembershipsError } = await adminClient
        .from('establishment_memberships')
        .select('establishment_id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (remainingMembershipsError) return respond({ error: remainingMembershipsError.message }, 500);
      if (!count) {
        const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteUserError) return respond({ error: deleteUserError.message }, 500);
      }
      return respond({ deleted: true });
    }
  }

  if (profile?.role !== 'super_admin') return respond({ error: 'Forbidden' }, 403);

  if (payload.action === 'list') {
    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, username, display_name, role')
      .eq('role', 'merchant')
      .order('created_at');
    if (profilesError) return respond({ error: profilesError.message }, 500);
    const ids = (profiles ?? []).map((item) => item.id);
    const { data: memberships, error: membershipsError } = ids.length
      ? await adminClient.from('establishment_memberships').select('user_id, establishment_id').in('user_id', ids)
      : { data: [], error: null };
    if (membershipsError) return respond({ error: membershipsError.message }, 500);
    const establishmentIds = new Map<string, string[]>();
    for (const membership of memberships ?? []) {
      establishmentIds.set(membership.user_id, [...(establishmentIds.get(membership.user_id) ?? []), membership.establishment_id]);
    }
    return respond({ users: (profiles ?? []).map((item) => ({
      id: item.id,
      username: item.username ?? '',
      displayName: item.display_name,
      role: 'merchant',
      establishmentIds: establishmentIds.get(item.id) ?? [],
    })) });
  }

  if (payload.action === 'create') {
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
    const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const establishmentIds = Array.isArray(payload.establishmentIds)
      ? [...new Set(payload.establishmentIds.filter((id): id is string => typeof id === 'string'))]
      : [];
    if (!email || !username || password.length < 8 || !establishmentIds.length) {
      return respond({ error: 'E-mail, usuário, senha de pelo menos 8 caracteres e lojas são obrigatórios.' }, 400);
    }

    const { data: stores, error: storesError } = await adminClient
      .from('establishments')
      .select('id')
      .in('id', establishmentIds);
    if (storesError || stores?.length !== establishmentIds.length) return respond({ error: 'Estabelecimento inválido.' }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName || username },
    });
    if (createError || !created.user) return respond({ error: createError?.message ?? 'Não foi possível criar a conta.' }, 400);

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      username,
      display_name: displayName || username,
      role: 'merchant',
    });
    if (!profileError) {
      const { error: membershipError } = await adminClient.from('establishment_memberships').insert(
        establishmentIds.map((establishmentId) => ({ user_id: created.user!.id, establishment_id: establishmentId })),
      );
      if (!membershipError) return respond({ id: created.user.id });
      await adminClient.auth.admin.deleteUser(created.user.id);
      return respond({ error: membershipError.message }, 500);
    }
    await adminClient.auth.admin.deleteUser(created.user.id);
    return respond({ error: profileError.message }, 500);
  }

  if (payload.action === 'delete') {
    const userId = typeof payload.userId === 'string' ? payload.userId : '';
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (targetError || target?.role !== 'merchant') return respond({ error: 'Usuário comum não encontrado.' }, 404);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) return respond({ error: deleteError.message }, 500);
    return respond({ deleted: true });
  }

  return respond({ error: 'Unknown action' }, 400);
});