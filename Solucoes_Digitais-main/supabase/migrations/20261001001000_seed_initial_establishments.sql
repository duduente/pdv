insert into public.establishments
  (id, slug, name, owner, email, plan, monthly_revenue, status, modules, theme, whatsapp)
values
  (
    '1', 'barbearia-estilo', 'Barbearia Estilo', 'Carlos Mendes', 'carlos@barbeariaestilo.com', 'Plano Essencial', 99, 'active',
    '{"agendamento":true,"cardapio":false,"pdv":true,"estoque":false}'::jsonb,
    '{"name":"Barbearia Estilo","logo":"","accentColor":"#1e3a5f"}'::jsonb, '5511987654321'
  ),
  (
    '2', 'burger-house', 'Burger House', 'Ana Ribeiro', 'ana@burgerhouse.com', 'Plano Profissional', 199, 'active',
    '{"agendamento":false,"cardapio":true,"pdv":true,"estoque":false}'::jsonb,
    '{"name":"Burger House","logo":"","accentColor":"#d97706"}'::jsonb, '5511987654322'
  ),
  (
    '3', 'mercadinho-central', 'Mercadinho Central', 'José Pereira', 'jose@mercadinhocentral.com', 'Plano Profissional', 199, 'active',
    '{"agendamento":false,"cardapio":false,"pdv":true,"estoque":true}'::jsonb,
    '{"name":"Mercadinho Central","logo":"","accentColor":"#059669"}'::jsonb, '5511987654323'
  ),
  (
    '4', 'loja-completa', 'Loja Completa', 'Mariana Costa', 'mariana@lojacompleta.com', 'Plano Premium', 299, 'active',
    '{"agendamento":true,"cardapio":true,"pdv":true,"estoque":true}'::jsonb,
    '{"name":"Loja Completa","logo":"","accentColor":"#4f46e5"}'::jsonb, '5511987654324'
  )
on conflict (id) do nothing;

-- Bootstrap a Super Admin only after creating the Auth user in Supabase.
-- Replace the e-mail and run once from the Supabase SQL editor:
-- update public.profiles set role = 'super_admin' where id = (
--   select id from auth.users where email = 'admin@example.com'
-- );