-- =========================
-- PRODUCT CATEGORIES
-- =========================
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_categories_restaurant on public.product_categories(restaurant_id);
create index idx_product_categories_tenant on public.product_categories(tenant_id);

alter table public.product_categories enable row level security;

-- =========================
-- PRODUCTS
-- =========================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  description text,
  price_cents integer not null default 0,
  cost_cents integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_restaurant on public.products(restaurant_id);
create index idx_products_tenant on public.products(tenant_id);
create index idx_products_category on public.products(category_id);
create index idx_products_active on public.products(restaurant_id, active);

alter table public.products enable row level security;

-- =========================
-- VALIDATION TRIGGERS
-- =========================
create or replace function public.validate_product_money()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price_cents < 0 then
    raise exception 'price_cents cannot be negative';
  end if;
  if new.cost_cents < 0 then
    raise exception 'cost_cents cannot be negative';
  end if;
  -- garantir consistência tenant/restaurant
  if not exists (
    select 1 from public.restaurants r
    where r.id = new.restaurant_id and r.tenant_id = new.tenant_id
  ) then
    raise exception 'restaurant_id does not belong to tenant_id';
  end if;
  return new;
end;
$$;

create trigger trg_products_validate
before insert or update on public.products
for each row execute function public.validate_product_money();

create or replace function public.validate_category_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.restaurants r
    where r.id = new.restaurant_id and r.tenant_id = new.tenant_id
  ) then
    raise exception 'restaurant_id does not belong to tenant_id';
  end if;
  return new;
end;
$$;

create trigger trg_categories_validate
before insert or update on public.product_categories
for each row execute function public.validate_category_tenant();

-- updated_at triggers
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger trg_categories_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

-- =========================
-- RLS POLICIES — categories
-- =========================
create policy "categories_select_member"
on public.product_categories for select
to authenticated
using (public.is_member_of_restaurant(auth.uid(), restaurant_id));

create policy "categories_insert_admins"
on public.product_categories for insert
to authenticated
with check (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::app_role[]));

create policy "categories_update_admins"
on public.product_categories for update
to authenticated
using (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::app_role[]))
with check (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::app_role[]));

-- intentionally NO delete policy → physical delete blocked

-- =========================
-- RLS POLICIES — products
-- =========================
create policy "products_select_member"
on public.products for select
to authenticated
using (public.is_member_of_restaurant(auth.uid(), restaurant_id));

create policy "products_insert_admins"
on public.products for insert
to authenticated
with check (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::app_role[]));

create policy "products_update_admins"
on public.products for update
to authenticated
using (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::app_role[]))
with check (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, array['owner','manager']::app_role[]));

-- intentionally NO delete policy → use active=false