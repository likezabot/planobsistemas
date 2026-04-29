-- 1) Flag para habilitar/desabilitar cardápio público por restaurante
alter table public.restaurants
  add column if not exists public_menu_enabled boolean not null default true;

-- 2) Função pública segura para obter o restaurante (somente campos públicos)
create or replace function public.get_public_restaurant(_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  timezone text,
  public_menu_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, r.slug, r.timezone, r.public_menu_enabled
  from public.restaurants r
  where r.slug = _slug
    and r.public_menu_enabled = true
$$;

-- 3) Função pública para listar categorias ativas (sem dados internos)
create or replace function public.get_public_categories(_slug text)
returns table (
  id uuid,
  name text,
  sort_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.sort_order
  from public.product_categories c
  join public.restaurants r on r.id = c.restaurant_id
  where r.slug = _slug
    and r.public_menu_enabled = true
    and c.active = true
  order by c.sort_order asc, c.name asc
$$;

-- 4) Função pública para listar produtos ativos.
--    NUNCA retorna cost_cents, tenant_id, created_at/updated_at internos.
create or replace function public.get_public_products(_slug text)
returns table (
  id uuid,
  category_id uuid,
  name text,
  description text,
  price_cents int,
  sort_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.category_id, p.name, p.description, p.price_cents, p.sort_order
  from public.products p
  join public.restaurants r on r.id = p.restaurant_id
  where r.slug = _slug
    and r.public_menu_enabled = true
    and p.active = true
    and (
      p.category_id is null
      or exists (
        select 1 from public.product_categories c
        where c.id = p.category_id and c.active = true
      )
    )
  order by p.sort_order asc, p.name asc
$$;

-- 5) Permissões — apenas EXECUTE para anon/authenticated nas funções públicas.
--    Nenhum acesso direto às tabelas para anon.
revoke all on function public.get_public_restaurant(text) from public, anon, authenticated;
revoke all on function public.get_public_categories(text) from public, anon, authenticated;
revoke all on function public.get_public_products(text)   from public, anon, authenticated;

grant execute on function public.get_public_restaurant(text) to anon, authenticated;
grant execute on function public.get_public_categories(text) to anon, authenticated;
grant execute on function public.get_public_products(text)   to anon, authenticated;