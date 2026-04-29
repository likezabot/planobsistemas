-- Fixtures de teste E2E para o cardápio público.
-- São dados públicos, sem dono, usados apenas para validar que:
--   - get_public_products NÃO devolve produto active=false
--   - get_public_products NÃO devolve cost_cents
--   - get_public_restaurant retorna vazio se public_menu_enabled=false
--
-- Não há membros (restaurant_members) para esses tenants, então
-- nenhum usuário autenticado real consegue ver via RLS — apenas
-- as RPCs públicas conseguem ler (porque são SECURITY DEFINER e
-- já filtram por slug + active + public_menu_enabled).

do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_rest_a uuid;
  v_rest_b uuid;
  v_cat_active uuid;
  v_cat_inactive uuid;
begin
  -- limpa fixtures antigos (idempotente)
  delete from public.products
    where restaurant_id in (
      select id from public.restaurants where slug in ('e2e-public-on', 'e2e-public-off')
    );
  delete from public.product_categories
    where restaurant_id in (
      select id from public.restaurants where slug in ('e2e-public-on', 'e2e-public-off')
    );
  delete from public.restaurants where slug in ('e2e-public-on', 'e2e-public-off');
  delete from public.tenants where slug in ('e2e-tenant-on', 'e2e-tenant-off');

  insert into public.tenants (name, slug) values ('E2E Tenant ON', 'e2e-tenant-on') returning id into v_tenant_a;
  insert into public.tenants (name, slug) values ('E2E Tenant OFF', 'e2e-tenant-off') returning id into v_tenant_b;

  insert into public.restaurants (tenant_id, name, slug, public_menu_enabled)
    values (v_tenant_a, 'E2E Public ON', 'e2e-public-on', true)
    returning id into v_rest_a;

  insert into public.restaurants (tenant_id, name, slug, public_menu_enabled)
    values (v_tenant_b, 'E2E Public OFF', 'e2e-public-off', false)
    returning id into v_rest_b;

  insert into public.product_categories (tenant_id, restaurant_id, name, sort_order, active)
    values (v_tenant_a, v_rest_a, 'E2E Categoria Ativa', 0, true)
    returning id into v_cat_active;

  insert into public.product_categories (tenant_id, restaurant_id, name, sort_order, active)
    values (v_tenant_a, v_rest_a, 'E2E Categoria Inativa', 1, false)
    returning id into v_cat_inactive;

  insert into public.products (tenant_id, restaurant_id, category_id, name, price_cents, cost_cents, active, sort_order)
    values
      (v_tenant_a, v_rest_a, v_cat_active, 'E2E Produto Ativo', 1990, 777, true, 0),
      (v_tenant_a, v_rest_a, v_cat_active, 'E2E Produto Inativo', 2990, 888, false, 1),
      (v_tenant_a, v_rest_a, v_cat_inactive, 'E2E Produto em Cat Inativa', 3990, 999, true, 2);

  -- restaurante OFF tem 1 produto ativo só pra provar que ele não vaza
  insert into public.products (tenant_id, restaurant_id, name, price_cents, cost_cents, active, sort_order)
    values (v_tenant_b, v_rest_b, 'E2E Produto OFF', 4990, 111, true, 0);
end $$;