# Supabase setup

## Frontend

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and the project's public anon/publishable key.
3. Never put the service-role key in a `VITE_*` variable or frontend file.

## Database and first administrator

1. Apply the SQL files in `supabase/migrations/` in filename order.
2. Create the initial account from Supabase Auth (email/password).
3. Promote only that account to Super Admin from the Supabase SQL editor:

```sql
update public.profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

The `admin` / `123` account is only available in local Vite development as a demo. It is not created in Supabase and is disabled in production builds.

## User management function

Deploy `supabase/functions/admin-manage-users/` as an Edge Function. Configure its `APP_ORIGIN` secret to the exact deployed frontend origin. Supabase provides the project URL and keys to deployed functions; the `service_role` key must remain server-side. The function validates the caller's access token and either a Super Admin role or store-scoped user-management permission before using its admin client.

Apply the migrations in order before deploying frontend changes. Existing store memberships receive full access; store managers can create restricted subusers from **Configurações da loja** through the same Edge Function. The function also supports store-scoped list and removal actions, and checks the caller's `manage-users` permission.

The support-chat lifecycle migration adds inactivity-based closure and a private `support-attachments` bucket for PDF and JPEG files (up to 5 MB). Apply it before deploying the frontend so the chat can store and securely serve attachments.

Subuser permissions are checked in the frontend and by database row-level security. Store managers can only delegate permissions they themselves hold. Cash permissions separately control the matching interface areas and restrict writes to sales, movements/extracts, and cash sessions; delivery users may register delivery payments without changing other cash sales. Apply and test these policies in a non-production Supabase project before using real store data. Existing browser-local records are copied to `tenant_records` on first authorized access to each tenant-scoped key.