-- =========================================================
-- FOUNDATION: multi-tenant, RBAC, RLS, audit
-- =========================================================

-- 1. ENUM de roles
create type public.app_role as enum (
  'owner',
  'manager',
  'cashier',
  'waiter',
  'kitchen',
  'support'
);

-- 2. TENANTS (conta comercial / SaaS)
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. RESTAURANTS (unidades dentro de um tenant)
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index on public.restaurants(tenant_id);

-- 4. PROFILES (dados públicos do usuário)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. RESTAURANT_MEMBERS (RBAC: usuário <-> restaurante <-> role)
create table public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id, role)
);
create index on public.restaurant_members(user_id);
create index on public.restaurant_members(restaurant_id);
create index on public.restaurant_members(tenant_id);

-- 6. AUDIT_LOG (auditoria de ações críticas)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log(tenant_id);
create index on public.audit_log(restaurant_id);
create index on public.audit_log(created_at desc);

-- =========================================================
-- SECURITY DEFINER FUNCTIONS (evitam recursão em RLS)
-- =========================================================

-- has_role: usuário X tem o papel Y no restaurante R?
create or replace function public.has_role(
  _user_id uuid,
  _restaurant_id uuid,
  _role public.app_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members
    where user_id = _user_id
      and restaurant_id = _restaurant_id
      and role = _role
  )
$$;

-- is_member_of_restaurant: usuário X pertence ao restaurante R (qualquer papel)?
create or replace function public.is_member_of_restaurant(
  _user_id uuid,
  _restaurant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members
    where user_id = _user_id and restaurant_id = _restaurant_id
  )
$$;

-- is_member_of_tenant: usuário X pertence a algum restaurante do tenant T?
create or replace function public.is_member_of_tenant(
  _user_id uuid,
  _tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members
    where user_id = _user_id and tenant_id = _tenant_id
  )
$$;

-- has_any_role_in_restaurant: usuário tem QUALQUER papel da lista no restaurante?
create or replace function public.has_any_role_in_restaurant(
  _user_id uuid,
  _restaurant_id uuid,
  _roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members
    where user_id = _user_id
      and restaurant_id = _restaurant_id
      and role = any(_roles)
  )
$$;

-- has_any_role_in_tenant: usuário tem QUALQUER papel da lista em algum restaurante do tenant?
create or replace function public.has_any_role_in_tenant(
  _user_id uuid,
  _tenant_id uuid,
  _roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members
    where user_id = _user_id
      and tenant_id = _tenant_id
      and role = any(_roles)
  )
$$;

-- =========================================================
-- TRIGGERS
-- =========================================================

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger trg_restaurants_updated_at
  before update on public.restaurants
  for each row execute function public.set_updated_at();

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- handle_new_user: ao criar conta, cria profile + tenant + restaurante + owner membership
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_restaurant_id uuid;
  v_tenant_name text;
  v_restaurant_name text;
  v_slug_base text;
  v_slug text;
begin
  -- profile
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );

  v_tenant_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'tenant_name'), ''),
    'Conta de ' || coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  v_restaurant_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'restaurant_name'), ''),
    v_tenant_name
  );

  v_slug_base := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if v_slug_base = '' then
    v_slug_base := 'tenant';
  end if;
  v_slug := v_slug_base || '-' || substr(replace(new.id::text, '-', ''), 1, 8);

  insert into public.tenants (name, slug)
  values (v_tenant_name, v_slug)
  returning id into v_tenant_id;

  insert into public.restaurants (tenant_id, name, slug)
  values (v_tenant_id, v_restaurant_name, 'principal')
  returning id into v_restaurant_id;

  insert into public.restaurant_members (tenant_id, restaurant_id, user_id, role)
  values (v_tenant_id, v_restaurant_id, new.id, 'owner');

  insert into public.audit_log (tenant_id, restaurant_id, user_id, action, entity, entity_id, payload)
  values (v_tenant_id, v_restaurant_id, new.id, 'tenant.created', 'tenant', v_tenant_id,
          jsonb_build_object('source', 'signup'));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- RLS
-- =========================================================

alter table public.tenants            enable row level security;
alter table public.restaurants        enable row level security;
alter table public.profiles           enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.audit_log          enable row level security;

-- ---- profiles
create policy "profiles_select_self"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- ---- tenants
create policy "tenants_select_member"
  on public.tenants for select
  to authenticated
  using (public.is_member_of_tenant(auth.uid(), id));

create policy "tenants_update_owner"
  on public.tenants for update
  to authenticated
  using (
    exists (
      select 1 from public.restaurant_members rm
      where rm.user_id = auth.uid()
        and rm.tenant_id = tenants.id
        and rm.role = 'owner'
    )
  );

-- ---- restaurants
create policy "restaurants_select_member"
  on public.restaurants for select
  to authenticated
  using (public.is_member_of_restaurant(auth.uid(), id));

create policy "restaurants_insert_owner_or_manager"
  on public.restaurants for insert
  to authenticated
  with check (
    public.has_any_role_in_tenant(auth.uid(), tenant_id, array['owner','manager']::public.app_role[])
  );

create policy "restaurants_update_owner_or_manager"
  on public.restaurants for update
  to authenticated
  using (
    public.has_any_role_in_restaurant(auth.uid(), id, array['owner','manager']::public.app_role[])
  );

-- ---- restaurant_members
create policy "members_select_self_or_admins"
  on public.restaurant_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::public.app_role[])
  );

create policy "members_insert_admins"
  on public.restaurant_members for insert
  to authenticated
  with check (
    public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::public.app_role[])
  );

create policy "members_update_admins"
  on public.restaurant_members for update
  to authenticated
  using (
    public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::public.app_role[])
  );

create policy "members_delete_admins"
  on public.restaurant_members for delete
  to authenticated
  using (
    public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::public.app_role[])
  );

-- ---- audit_log
create policy "audit_select_admins"
  on public.audit_log for select
  to authenticated
  using (
    restaurant_id is not null
    and public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager','support']::public.app_role[])
  );

-- audit_log NÃO recebe policy de insert: só é escrita por funções SECURITY DEFINER (triggers/edge functions).
